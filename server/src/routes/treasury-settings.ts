import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { sql } from "drizzle-orm";
import type { Db } from "@whoxos/db";
import { TREASURY_COMPANY_ID, saveTreasurySettingsSchema, type TreasuryLimits, type TreasurySettings } from "@whoxos/shared";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { persistActivity, publishActivity } from "../services/activity-log.js";

type Run = { responsible_user_id: string | null; status: string };
export function treasurySettingsOwner(actor: Request["actor"], run?: Run): string {
  if (actor.type === "board" && actor.source === "session" && actor.userId) return actor.userId;
  if (actor.type === "agent" && actor.source === "agent_jwt" && actor.runId && actor.onBehalfOfUserId
    && run?.status === "running" && run.responsible_user_id === actor.onBehalfOfUserId
    && actor.onBehalfOfMemberships?.some((membership) => membership.companyId === TREASURY_COMPANY_ID
      && membership.status === "active" && membership.membershipRole !== "viewer")) return actor.onBehalfOfUserId;
  throw forbidden("A signed-in user or an active Treasury run with a responsible user is required");
}

export function treasurySettingsRoutes(db: Db): ReturnType<typeof Router> {
  const router = Router();
  const path = "/companies/:companyId/treasury/settings";
  router.get(path, async (req, res) => {
    const companyId = String(req.params.companyId);
    assertCompanyAccess(req, companyId);
    if (companyId !== TREASURY_COMPANY_ID) throw notFound("Treasury settings not available for this organization");
    let run: Run | undefined;
    if (req.actor.type === "agent") {
      if (req.actor.source !== "agent_jwt" || !req.actor.runId || !req.actor.onBehalfOfUserId)
        throw forbidden("An active run with a responsible user is required");
      const rows = await db.execute(sql`SELECT responsible_user_id, status FROM heartbeat_runs
        WHERE id=${req.actor.runId} AND company_id=${companyId} AND agent_id=${req.actor.agentId}`);
      run = rows[0] as Run | undefined;
    }
    const userId = treasurySettingsOwner(req.actor, run);
    const rows = await db.execute(sql`SELECT revision, limits, updated_at FROM treasury_user_settings WHERE company_id=${companyId} AND user_id=${userId}`);
    const row = rows[0] as { revision: string; limits: TreasuryLimits; updated_at: Date | string } | undefined;
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ companyId, userId, revision: row?.revision ?? null, limits: row?.limits ?? null,
      updatedAt: row ? new Date(String(row.updated_at)).toISOString() : null, liveEnabled: false } satisfies TreasurySettings);
  });
  router.put(path, async (req, res) => {
    assertBoard(req);
    const companyId = String(req.params.companyId);
    assertCompanyAccess(req, companyId);
    if (companyId !== TREASURY_COMPANY_ID) throw notFound("Treasury settings not available for this organization");
    const userId = treasurySettingsOwner(req.actor);
    const parsed = saveTreasurySettingsSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Enter valid personal trading limits", parsed.error.flatten());
    const { limits, expectedRevision } = parsed.data;
    const revision = randomUUID();
    const result = await db.transaction(async (tx) => {
      const rows = expectedRevision === null
        ? await tx.execute(sql`INSERT INTO treasury_user_settings(company_id,user_id,revision,limits)
            VALUES (${companyId},${userId},${revision},${JSON.stringify(limits)}::jsonb)
            ON CONFLICT DO NOTHING RETURNING revision,limits,updated_at`)
        : await tx.execute(sql`UPDATE treasury_user_settings SET revision=${revision},limits=${JSON.stringify(limits)}::jsonb,updated_at=now()
            WHERE company_id=${companyId} AND user_id=${userId} AND revision=${expectedRevision} RETURNING revision,limits,updated_at`);
      const row = rows[0];
      if (!row) throw conflict("Your settings changed in another tab. Reload before saving.");
      const activity = await persistActivity(tx as unknown as Db, { companyId, actorType: "user", actorId: userId,
        action: "treasury.personal_limits_updated", entityType: "treasury_settings", entityId: userId,
        details: { revision, liveEnabled: false } });
      return { row, publication: activity.publication };
    });
    // A failed live-event broadcast cannot undo a committed personal setting.
    try { publishActivity(result.publication); } catch { /* durable audit is already committed */ }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ companyId, userId, revision, limits: result.row.limits as TreasuryLimits,
      updatedAt: new Date(String(result.row.updated_at)).toISOString(), liveEnabled: false } satisfies TreasurySettings);
  });
  return router;
}
