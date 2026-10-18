import { Router } from "express";
import type { Db } from "@whoxos/db";
import { isUuidLike } from "@whoxos/shared";
import { badRequest } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertItDiagnosticsAccess, parseItDiagnosticsWindow, readItDiagnostics, readItDiagnosticsHistory } from "../services/it-diagnostics.js";
import { logActivity } from "../services/activity-log.js";

export function itDiagnosticsRoutes(db: Db) {
  const router = Router();
  router.get("/companies/:companyId/it-diagnostics", async (req, res) => {
    const companyId = String(req.params.companyId);
    if (!isUuidLike(companyId)) throw badRequest("Invalid organization identifier");
    const window = parseItDiagnosticsWindow(req.query);
    assertCompanyAccess(req, companyId);
    await assertItDiagnosticsAccess(db, { companyId, type: req.actor.type,
      userId: req.actor.userId, agentId: req.actor.agentId, runId: req.actor.runId, keyScope: req.actor.keyScope });
    const report = window ? await readItDiagnosticsHistory(window) : await readItDiagnostics();
    // Revalidate after asynchronous archive reads so revoked grants/runs do not retain access.
    await assertItDiagnosticsAccess(db, { companyId, type: req.actor.type,
      userId: req.actor.userId, agentId: req.actor.agentId, runId: req.actor.runId, keyScope: req.actor.keyScope });
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId,
      agentId: actor.agentId, runId: actor.runId, agentApiKeyId: actor.agentApiKeyId,
      action: "system.it_diagnostics_read", entityType: "company", entityId: companyId,
      details: { generatedAt: report.generatedAt, windowMinutes: report.window.minutes, ...(window ? { since: window.since, until: window.until, mode: "history" } : {}), scope: "sanitized_service_metadata" } });
    res.set("Cache-Control", "no-store").json(report);
  });
  return router;
}
