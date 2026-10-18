import net from "node:net";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { agents, companies, companyMemberships, heartbeatRuns, instanceUserRoles, type Db } from "@whoxos/db";
import { z } from "zod";
import { readBuiltInAgentMarker } from "./built-in-agent-metadata.js";
import type { Request } from "express";
import { forbidden, HttpError, notFound } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "../routes/authz.js";
import { logActivity } from "./activity-log.js";
import { redactSensitiveText, REDACTED_EVENT_VALUE } from "../redaction.js";

// Kept for the platform Admin portal and historical grants. Host command grants
// now support every organization, subject to canonical identity/run checks.
export const PRODUCTION_ROOT_COMPANY_ID = "79255634-54f2-4a25-b72f-19f2808ad251";
export const TREASURY_ROOT_COMPANY_ID = "0d8aad87-64f2-4f9c-a92c-94a261e140f7";
export const TREASURY_ROOT_AGENT_ID = "10bf5dc5-8522-42a2-8456-9bc50cdd982d";
// Owner-selected storage provisioning route (2026-10-03). Eligibility does not
// grant access: the human manager must still explicitly enable the broker grant.
export function isProductionRootScope(companyId: string, agentId?: string) {
  return z.string().uuid().safeParse(companyId).success && (!agentId || z.string().uuid().safeParse(agentId).success);
}
export function assertProductionRootCompany(companyId: string, agentId?: string) {
  if (!isProductionRootScope(companyId, agentId)) throw forbidden("This organization and agent are not eligible for production root access");
}

export const productionRootHelperSchema = z.object({
  helperId: z.enum(["service.reload", "service.recover", "purpose.v14.synthetic_lifecycle"]),
  requestId: z.string().uuid(),
}).strict();
export const productionRootCommandSchema = z.object({
  requestId: z.string().uuid(),
  command: z.string().min(1).max(32000).refine(value => !value.includes("\0")),
  timeoutMs: z.number().int().min(1).max(300000).optional().default(30000),
}).strict();
export function isHostLeadership(agent: { role?: string; reportsTo?: string | null; adapterType?: string; metadata?: Record<string, unknown> | null }) {
  return agent.adapterType !== "typesafe" && !readBuiltInAgentMarker(agent.metadata) &&
    (agent.role === "ceo" || (agent.reportsTo === null && !agent.metadata?.organizationSecurity));
}
export const voiceProductionRootHelperSchema = z.object({
  helperId: z.enum(["service.reload", "service.recover"]),
}).strict();

export type RootAccessStatus = { available: boolean; enabled: boolean; target: "production"; uid: 0 };
export type RootHelperResult = { requestId: string; exitCode: number | null; output: string; truncated: boolean; timedOut: boolean; revoked: boolean; target: "production"; uid: 0 };
const SOCKET = "/run/overview-root-executor/control.sock";

/** The privileged service checks kernel peer PID, UID and process start time.
 * No credential is written into an agent-readable file or inherited environment.
 * Socket requests MUST originate in this process, never an agent child process.
 */
export async function callRootExecutor<T>(request: Record<string, unknown>, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET);
    let raw = "", settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(value!);
    };
    const timer = setTimeout(() => finish(new HttpError(504, "Root command result timed out. Its outcome is unknown; do not automatically repeat the command.")), timeoutMs);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw) > 512000) return finish(new HttpError(502, "Root executor response exceeded its limit"));
      if (!raw.includes("\n")) return;
      try {
        const reply = JSON.parse(raw.slice(0, raw.indexOf("\n")));
        if (reply.ok !== true) return finish(new HttpError([400, 403, 409, 503].includes(reply.status) ? reply.status : 503,
          typeof reply.error === "string" ? reply.error : "Root executor unavailable"));
        finish(undefined, reply.result as T);
      } catch { finish(new HttpError(502, "Invalid root executor response")); }
    });
    socket.once("error", () => finish(new HttpError(503, "Production root executor is unavailable. A server administrator must install or rebind it.")));
    socket.once("end", () => { if (!settled) finish(new HttpError(502, "Root executor disconnected; command outcome may be unknown. Do not automatically repeat it.")); });
  });
}
// One transport seam for authorization tests; production always uses the pinned
// Unix-socket caller above. No credential or configuration changes this seam.
export const rootExecutorTransport = { call: callRootExecutor };

export async function getRootAgent(db: Db, companyId: string, agentId: string) {
  const [agent] = await db.select().from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)));
  if (!agent) throw notFound("Agent not found");
  return agent;
}

export async function assertProductionRootManager(db: Db, req: Request, companyId: string, agentId?: string) {
  assertCompanyAccess(req, companyId);
  assertProductionRootCompany(companyId, agentId);
  if (req.actor.type === "agent") {
    if (!agentId || !req.actor.agentId || req.actor.companyId !== companyId) throw forbidden("Host access delegation stays within your organization");
    const leader = await getRootAgent(db, companyId, req.actor.agentId);
    if (!isHostLeadership(leader)) throw forbidden("Only CEOs and top-level managers can manage host access");
    await assertProductionRootExecution(db, req, companyId, leader.id);
    await ensureLeadershipRootAccess(db, companyId, leader.id);
    const grant = await rootExecutorTransport.call<RootAccessStatus>({ operation: "status", companyId, agentId: leader.id });
    if (!grant.enabled) throw forbidden("The manager's host access is disabled");
    return;
  }
  if (req.actor.type !== "board" || !req.actor.userId) throw forbidden("Only a human server administrator can manage production root access");
  const [role] = await db.select({ userId: instanceUserRoles.userId }).from(instanceUserRoles)
    .where(and(eq(instanceUserRoles.userId, req.actor.userId), eq(instanceUserRoles.role, "instance_admin")));
  const [member] = await db.select({ status: companyMemberships.status, role: companyMemberships.membershipRole }).from(companyMemberships)
    .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, req.actor.userId)));
  if (!role || member?.status !== "active" || !["owner", "admin"].includes(member.role ?? "")) {
    throw forbidden("Production root access requires server administrator and organization owner/admin access");
  }
}

export async function ensureLeadershipRootAccess(db: Db, companyId: string, agentId: string) {
  const agent = await getRootAgent(db, companyId, agentId);
  if (!isHostLeadership(agent) || ["terminated", "pending_approval"].includes(agent.status)) return;
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (company?.status !== "active" || !company.defaultResponsibleUserId) return;
  const [member] = await db.select().from(companyMemberships).where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, company.defaultResponsibleUserId)));
  const [admin] = await db.select().from(instanceUserRoles).where(and(eq(instanceUserRoles.userId, company.defaultResponsibleUserId), eq(instanceUserRoles.role, "instance_admin")));
  if (!admin || member?.status !== "active" || !["owner", "admin"].includes(member.membershipRole ?? "")) return;
  const status = await rootExecutorTransport.call<RootAccessStatus & { canDelegate?: boolean }>({ operation: "status", companyId, agentId });
  if (status.enabled && status.canDelegate) return;
  await logActivity(db, { companyId, actorType: "system", actorId: "host-leadership-policy", action: "agent.production_root_leadership_granted", entityType: "agent", entityId: agentId, details: { enabled: true, delegation: true } });
  await rootExecutorTransport.call({ operation: "leadership", companyId, agentId, enabled: true, actorId: company.defaultResponsibleUserId });
  await db.update(agents).set({ permissions: { ...agent.permissions, canCreateAgents: true }, updatedAt: new Date() }).where(eq(agents.id, agentId));
}

export async function reconcileOrganizationHostAccess(db: Db, companyId: string) {
  const rows = await db.select().from(agents).where(eq(agents.companyId, companyId));
  for (const agent of rows) if (isHostLeadership(agent) && !["terminated", "pending_approval"].includes(agent.status)) await ensureLeadershipRootAccess(db, companyId, agent.id);
}
export async function syncAgentHostAccess(db: Db, agent: Awaited<ReturnType<typeof getRootAgent>>, previous?: Awaited<ReturnType<typeof getRootAgent>>) {
  try {
    if (previous && isHostLeadership(previous) && (!isHostLeadership(agent) || agent.status === "terminated")) {
      await rootExecutorTransport.call({ operation: "leadership", companyId: agent.companyId, agentId: agent.id, enabled: false, actorId: "host-leadership-policy" });
    } else await ensureLeadershipRootAccess(db, agent.companyId, agent.id);
  } catch {
    // A missing broker must be shown as unavailable, never converted into sudo
    // privileges or allowed to roll back an already committed agent admission.
    console.warn(`Host grant reconciliation unavailable for agent ${agent.id}; retry through its production-root capability endpoint.`);
  }
}

export async function grantProductionRootAccess(db: Db, req: Request, companyId: string, agentId: string, enabled: boolean) {
  await assertProductionRootManager(db, req, companyId, agentId);
  const agent = await getRootAgent(db, companyId, agentId);
  if (enabled && ["terminated", "pending_approval"].includes(agent.status)) throw forbidden("This agent cannot receive production root access");
  if (!enabled && isHostLeadership(agent) && agent.status !== "terminated") throw forbidden("CEOs and top-level managers retain host access. Change their hierarchy before revoking it.");
  const actor = getActorInfo(req);
  const details = { enabled, target: "production", ...(req.actor.type === "agent" ? { delegatedByAgentId: req.actor.agentId } : {}) };
  await logActivity(db, { companyId, ...actor, action: "agent.production_root_grant_requested", entityType: "agent", entityId: agentId, details });
  await assertProductionRootManager(db, req, companyId, agentId);
  const status = await rootExecutorTransport.call<RootAccessStatus>({ operation: "grant", companyId, agentId, enabled, actorId: actor.actorId,
    ...(req.actor.type === "agent" ? { managerAgentId: req.actor.agentId } : {}) });
  await logActivity(db, { companyId, ...actor, action: "agent.production_root_grant_updated", entityType: "agent", entityId: agentId, details });
  return { ...status, eligible: true, canManage: true };
}

export async function assertProductionRootExecution(db: Db, req: Request, companyId: string, agentId: string, voice = false) {
  assertCompanyAccess(req, companyId);
  assertProductionRootCompany(companyId, agentId);
  const agent = await getRootAgent(db, companyId, agentId);
  if (!["active", "idle", "running", "error"].includes(agent.status)) throw forbidden("This agent is not active");
  const [membership] = await db.select({ status: companyMemberships.status }).from(companyMemberships)
    .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "agent"), eq(companyMemberships.principalId, agentId)));
  if (membership?.status !== "active") throw forbidden("Active agent membership required");
  if (voice) {
    // An organization viewer/operator must not borrow a root-enabled agent's powers.
    await assertProductionRootManager(db, req, companyId, agentId);
    return;
  }
  if (req.actor.type !== "agent" || req.actor.agentId !== agentId || !req.actor.runId
    || (req.actor.keyScope && req.actor.keyScope.kind !== "standard")) throw forbidden("A standard credential for this agent's current run is required");
  const [run] = await db.select({ status: heartbeatRuns.status, responsibleUserId: heartbeatRuns.responsibleUserId }).from(heartbeatRuns)
    .where(and(eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.agentId, agentId), eq(heartbeatRuns.id, req.actor.runId)));
  if (run?.status !== "running" || !run.responsibleUserId) throw forbidden("A current running execution with a responsible human is required");
  const [responsible] = await db.select({ status: companyMemberships.status, role: companyMemberships.membershipRole }).from(companyMemberships)
    .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, run.responsibleUserId)));
  const [serverRole] = await db.select({ userId: instanceUserRoles.userId }).from(instanceUserRoles)
    .where(and(eq(instanceUserRoles.userId, run.responsibleUserId), eq(instanceUserRoles.role, "instance_admin")));
  if (!serverRole || responsible?.status !== "active" || !["owner", "admin"].includes(responsible.role ?? "")) throw forbidden("The responsible human must retain server administrator and organization owner/admin access");
}

export async function executeProductionRootCommand(db: Db, req: Request, companyId: string, agentId: string, raw: unknown) {
  const input = productionRootCommandSchema.parse(raw);
  await assertProductionRootExecution(db, req, companyId, agentId);
  await ensureLeadershipRootAccess(db, companyId, agentId);
  const actor = getActorInfo(req);
  const details = { requestId: input.requestId, commandHash: createHash("sha256").update(input.command).digest("hex"), timeoutMs: input.timeoutMs };
  await logActivity(db, { companyId, ...actor, action: "agent.production_root_command_requested", entityType: "agent", entityId: agentId, details });
  await assertProductionRootExecution(db, req, companyId, agentId);
  const result = await rootExecutorTransport.call<RootHelperResult>({ operation: "execute", companyId, agentId, actorId: actor.actorId, ...input }, input.timeoutMs + 20000);
  await logActivity(db, { companyId, ...actor, action: "agent.production_root_command_finished", entityType: "agent", entityId: agentId, details: { ...details, exitCode: result.exitCode, revoked: result.revoked, timedOut: result.timedOut, truncated: result.truncated } });
  return { ...result, output: redactRootCommandOutput(result.output, req.header("authorization")) };
}

/** Redact before root output crosses into provider context, run logs or chat. */
export function redactRootCommandOutput(output: string, authorization: string | undefined): string {
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  // Exact replacement also catches a naked credential in a SyntaxError source line.
  const ownCredentialRedacted = bearer ? output.split(bearer).join(REDACTED_EVENT_VALUE) : output;
  return redactSensitiveText(ownCredentialRedacted)
    .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED_EVENT_VALUE);
}

export async function executeProductionRootHelper(db: Db, req: Request, companyId: string, agentId: string, raw: unknown, voice = false) {
  const input = productionRootHelperSchema.parse(raw);
  await assertProductionRootExecution(db, req, companyId, agentId, voice);
  const actor = getActorInfo(req);
  const status = await rootExecutorTransport.call<RootAccessStatus>({ operation: "status", companyId, agentId });
  if (!status.enabled) throw forbidden("Production root access is not enabled for this agent");
  const details = { requestId: input.requestId, helperId: input.helperId, target: "production", uid: 0 };
  await logActivity(db, { companyId, ...actor, action: "agent.production_root_helper_requested", entityType: "agent", entityId: agentId, details });
  await assertProductionRootExecution(db, req, companyId, agentId, voice);
  const result = await rootExecutorTransport.call<RootHelperResult>({ operation: "helper", companyId, agentId, actorId: actor.actorId, ...input }, 50000);
  await logActivity(db, { companyId, ...actor, action: "agent.production_root_helper_finished", entityType: "agent", entityId: agentId,
    details: { ...details, exitCode: result.exitCode, timedOut: result.timedOut, revoked: result.revoked, truncated: result.truncated } });
  return { ...result, output: redactRootCommandOutput(result.output, req.header("authorization")) };
}

export function voiceRootRequestId(sessionId: string, callId: string) {
  const digest = createHash("sha256").update(JSON.stringify([sessionId, callId])).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
