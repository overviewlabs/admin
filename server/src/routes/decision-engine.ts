import { Router } from "express";
import type { Db } from "@whoxos/db";
import { assertCompanyAccess } from "./authz.js";
import { projectToolContext } from "../services/project-tool-context.js";
import { decisionEngineService } from "../services/decision-engine.js";
import { forbidden } from "../errors.js";
import { z } from "zod";

export function decisionEngineRoutes(db: Db) {
  const router = Router();
  const svc = decisionEngineService(db);
  async function context(req: Parameters<typeof assertCompanyAccess>[0]) {
    // Reject board/session, static API keys and forged run IDs before lookup.
    if (req.actor.type !== "agent" || req.actor.source !== "agent_jwt") throw forbidden("Real-Time Decision Engine is available only to authenticated agent runs");
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const resolved = await projectToolContext(db, req.actor);
    if (resolved.run.companyId !== companyId) throw forbidden("Evaluation must stay within the agent's organization");
    return { companyId, callerAgentId: resolved.run.agentId, callerRunId: resolved.run.id, issueId: resolved.issue.id, responsibleUserId: resolved.run.responsibleUserId, actor: req.actor };
  }
  router.post("/companies/:companyId/decision-engine/evaluations", async (req, res) => {
    res.status(202).json(await svc.evaluate(await context(req), req.body));
  });
  router.get("/companies/:companyId/decision-engine/evaluations/:id", async (req, res) => {
    const ctx = await context(req);
    res.json(await svc.read(ctx.companyId, ctx.callerAgentId, z.uuid().parse(req.params.id), ctx.responsibleUserId, ctx.issueId));
  });
  return router;
}
