import { Router } from "express";
import type { Db } from "@whoxos/db";
import { assertProductionRootManager } from "../services/production-root.js";
import { assertInstanceAdmin } from "./authz.js";
import { forbidden } from "../errors.js";
import { getServerMonitor } from "../services/server-monitor.js";
export function serverMonitorRoutes(db: Db) {
  const router = Router();
  router.get("/instance/monitor", async (req, res) => {
    assertInstanceAdmin(req);
    if (!req.actor.userId) throw forbidden("A signed-in server administrator is required");
    res.set("Cache-Control", "no-store").json(await getServerMonitor());
  });
  router.get("/companies/:companyId/monitor", async (req, res) => {
    await assertProductionRootManager(db, req, req.params.companyId);
    res.set("Cache-Control", "no-store").json(await getServerMonitor());
  });
  router.get("/instance/admin-portal/access", async (req, res) => {
    assertInstanceAdmin(req);
    if (!req.actor.userId) throw forbidden("A signed-in server administrator is required");
    res.set("Cache-Control", "no-store").json({ allowed: true });
  });
  router.get("/instance/admin-portal/authorize", async (req, res) => {
    assertInstanceAdmin(req);
    if (!req.actor.userId) throw forbidden("A signed-in server administrator is required");
    const origin = req.get("Origin");
    const method = req.get("X-Forwarded-Method") ?? "GET";
    if ((origin && origin !== "https://overviewlabs.ai") || (!["GET", "HEAD", "OPTIONS"].includes(method) && origin !== "https://overviewlabs.ai")) {
      res.status(403).json({ error: "Open Admin from WHOXOS." });
      return;
    }
    res.set({ "Cache-Control": "no-store", "Remote-User": req.actor.userId! }).status(204).end();
  });
  return router;
}
