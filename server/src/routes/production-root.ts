import { executeServerManagement } from "../services/server-management.js";
import { Router } from "express";
import type { Db } from "@whoxos/db";
import { z } from "zod";
import { assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";
import { isProductionRootScope, isHostLeadership, ensureLeadershipRootAccess, grantProductionRootAccess, executeProductionRootCommand, assertProductionRootManager, rootExecutorTransport, executeProductionRootHelper, getRootAgent, type RootAccessStatus } from "../services/production-root.js";

export function productionRootRoutes(db: Db) {
  const router = Router();
  const scope = z.object({ companyId: z.string().uuid(), agentId: z.string().uuid() });
  const route = "/companies/:companyId/agents/:agentId/production-root";
  router.get(route, async (req, res) => {
    const { companyId, agentId } = scope.parse(req.params);
    assertCompanyAccess(req, companyId);
    const agent = await getRootAgent(db, companyId, agentId);
    if (req.actor.type === "agent" && req.actor.agentId !== agentId) await assertProductionRootManager(db, req, companyId, agentId);
    if (!isProductionRootScope(companyId, agentId)) {
      res.set("Cache-Control", "no-store").json({ eligible: false, available: false, enabled: false, canManage: false, target: "production", uid: 0 });
      return;
    }
    let canManage = false;
    try { await assertProductionRootManager(db, req, companyId, agentId); canManage = true; } catch (error) {
      if (!(error && typeof error === "object" && "status" in error && [403, 503].includes(error.status as number))) throw error;
    }
    try {
      await ensureLeadershipRootAccess(db, companyId, agentId);
      const status = await rootExecutorTransport.call<RootAccessStatus>({ operation: "status", companyId, agentId });
      res.set("Cache-Control", "no-store").json({ ...status, eligible: true, canManage, required: isHostLeadership(agent) });
    } catch {
      res.set("Cache-Control", "no-store").json({ eligible: true, available: false, enabled: false, canManage, target: "production", uid: 0 });
    }
  });
  router.patch(route, async (req, res) => {
    const { companyId, agentId } = scope.parse(req.params);
    const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    res.set("Cache-Control", "no-store").json(await grantProductionRootAccess(db, req, companyId, agentId, enabled));
  });
  router.post(route + "/commands", async (req, res) => {
    const { companyId, agentId } = scope.parse(req.params);
    res.set("Cache-Control", "no-store").json(await executeProductionRootCommand(db, req, companyId, agentId, req.body));
  });
  router.post(route + "/helpers", async (req, res) => {
    const { companyId, agentId } = scope.parse(req.params);
    res.set("Cache-Control", "no-store").json(await executeProductionRootHelper(db, req, companyId, agentId, req.body));
  });
  router.post("/companies/:companyId/agents/:agentId/server-api", async (req, res) => {
    const { companyId, agentId } = scope.parse(req.params);
    res.set("Cache-Control", "no-store").json(await executeServerManagement(db, req, companyId, agentId, req.body));
  });
  return router;
}
