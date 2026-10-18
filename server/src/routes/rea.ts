import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { agents, type Db } from "@whoxos/db";
import { projectToolContext } from "../services/project-tool-context.js";
import { reaEnabled, reaSessions, reaToolDefinitions, executeReaTool } from "../services/rea-runtime.js";
import { assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";

export function reaRoutes(db: Db) {
  const router = Router();
  router.post("/mcp/rea", async (req, res) => {
    const context = await projectToolContext(db, req.actor);
    assertCompanyAccess(req, context.run.companyId);
    const [agent] = await db.select().from(agents).where(and(eq(agents.id, context.run.agentId), eq(agents.companyId, context.run.companyId)));
    if (!agent || !reaEnabled(agent.runtimeConfig)) {
      await reaSessions.close(context.run.id);
      throw forbidden("R.E.A. Mode is disabled for this agent");
    }
    const { id = null, method, params } = req.body ?? {};
    const send = (result: unknown) => res.json({ jsonrpc: "2.0", id, result });
    if (method === "initialize") return send({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "overview-labs-rea", version: "1" } });
    if (method === "notifications/initialized") return res.status(202).end();
    if (method === "ping") return send({});
    if (method === "tools/list") return send({ tools: reaToolDefinitions });
    if (method !== "tools/call") return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    try {
      const result = await executeReaTool({ companyId: agent.companyId, agentId: agent.id, runId: context.run.id,
        workMode: context.issue.workMode }, params?.name, params?.arguments ?? {});
      return send(result);
    } catch (error) {
      return send({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "REA operation failed" }] });
    }
  });
  return router;
}
