import { Router } from "express";
import type { Db } from "@whoxos/db";
import { z } from "zod";
import { executeWebResearch } from "../services/web-research.js";

export function webResearchRoutes(db: Db) {
  const router = Router();
  for (const [path, action] of [["search", "search_web"], ["read", "read_web_page"]] as const) {
    router.post(`/companies/:companyId/web/${path}`, async (req, res) => {
      const companyId = z.string().uuid().parse(req.params.companyId);
      res.setHeader("Cache-Control", "no-store");
      res.json(await executeWebResearch(db, req, companyId, action, req.body));
    });
  }
  return router;
}
