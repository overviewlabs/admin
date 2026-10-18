import { randomUUID, createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { companies, heartbeatRuns, type Db } from "@whoxos/db";
import { z } from "zod";
import { badRequest, forbidden, HttpError } from "../errors.js";
import { assertProductionRootExecution, callRootExecutor, type RootAccessStatus } from "./production-root.js";
import { logActivity } from "./activity-log.js";
import { getActorInfo } from "../routes/authz.js";
import { redactSensitiveText } from "../redaction.js";

export const serverManagementSchema = z.object({
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
  path: z.string().max(2000).refine(path => /^\/api\/(companies|agents|issues|projects|goals|routines)(\/|\?|$)/.test(path)
    && !/[\\#%\s]/.test(path) && !path.split(/[/?]/).includes("..")
    && !/\/(server-api|voice-sessions|production-root)(\/|\?|$)/.test(path), "Use a local organization/resource API path, not authentication or root-grant endpoints"),
  body: z.record(z.string(), z.unknown()).optional(),
}).strict();
const digest = (body: unknown) => createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
const permits = new Map<string, { method: string; path: string; bodyHash: string; expires: number; authorize: () => Promise<Request["actor"]> }>();
/** In-process, single-use delegation to canonical routes; never issued to a model/client. */
export const serverManagementMiddleware: RequestHandler = async (req, res, next) => {
  const token = req.header("x-overview-server-management");
  if (!token) return next();
  const permit = permits.get(token); permits.delete(token);
  if (!permit || permit.expires < Date.now() || permit.method !== req.method || permit.path !== req.originalUrl || permit.bodyHash !== digest(req.body)) {
    res.status(403).json({ error: "Invalid server management delegation" }); return;
  }
  try { req.actor = await permit.authorize(); next(); } catch (error) { next(error); }
};
export function sanitizeServerManagementResult(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(sanitizeServerManagementResult);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(adapterConfig|runtimeConfig|env|credentials|password|token|apiKey|accessToken|refreshToken|secretValue|encryptedValue)$/i.test(key)).map(([key,item]) => [key,sanitizeServerManagementResult(item)]));
}
export async function executeServerManagement(db: Db, req: Request, companyId: string, agentId: string, raw: unknown) {
  const input = serverManagementSchema.parse(raw);
  if (input.method === "GET" && input.body) throw badRequest("GET takes no body");
  const authorize = async (): Promise<Request["actor"]> => {
    await assertProductionRootExecution(db, req, companyId, agentId, req.actor.type === "board");
    const grant = await callRootExecutor<RootAccessStatus>({ operation: "status", companyId, agentId });
    if (!grant.available || !grant.enabled) throw forbidden("An enabled production-root grant is required");
    let userId = req.actor.userId;
    if (req.actor.type === "agent") {
      const [run] = await db.select({ userId: heartbeatRuns.responsibleUserId }).from(heartbeatRuns).where(eq(heartbeatRuns.id, req.actor.runId!));
      userId = run?.userId ?? undefined;
    }
    if (!userId) throw forbidden("A responsible server administrator is required");
    const organizations = await db.select({ id: companies.id }).from(companies);
    return { type: "board", source: "board_key", userId, isInstanceAdmin: true, companyIds: organizations.map(item => item.id) };
  };
  await authorize();
  const actor = getActorInfo(req);
  await logActivity(db, { companyId, ...actor, action: "agent.server_management_requested", entityType: "agent", entityId: agentId, details: { method: input.method, path: input.path.split("?")[0] } });
  for (const [key,value] of permits) if (value.expires < Date.now()) permits.delete(key);
  const token = randomUUID();
  permits.set(token, { method: input.method, path: input.path, bodyHash: digest(input.body), expires: Date.now()+60_000, authorize });
  try {
    const response = await fetch(`http://127.0.0.1:${req.socket.localPort}${input.path}`, {
      method: input.method, headers: { "Content-Type": "application/json", "x-overview-server-management": token },
      ...(input.method === "GET" ? {} : { body: JSON.stringify(input.body ?? {}) }), redirect: "error", signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    if (text.length > 2_000_000) throw new HttpError(502, "Result too large; narrow the query. Do not repeat a write without checking its outcome.");
    let result: unknown = null;
    try { if(text) result = JSON.parse(text); } catch { throw new HttpError(502, "Management API returned a non-JSON result. Check the operation before retrying."); }
    await logActivity(db, { companyId, ...actor, action: "agent.server_management_finished", entityType: "agent", entityId: agentId, details: { method: input.method, path: input.path.split("?")[0], status: response.status } });
    return { success: response.ok, status: response.status, result: sanitizeServerManagementResult(result) };
  } finally { permits.delete(token); }
}
