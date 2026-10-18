import { executeServerManagement } from "./server-management.js";
import { readVoiceServerContext } from "./voice-server-context.js";
import { ToolGatewayHttpError, type ToolGatewayService } from "./tool-gateway.js";
import type { Request } from "express";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { agents, goals, issues, projects, heartbeatRuns, toolActionRequests, toolInvocations, type Db } from "@whoxos/db";
import type { PermissionKey } from "@whoxos/shared";
import { logActivity } from "./activity-log.js";
import { accessService } from "./access.js";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { voiceDirectPermit } from "./voice-direct-context.js";
import { loadAgentOrganizationContext } from "./agent-organization-context.js";
import { createVoiceReadAccess } from "./voice-direct-read-access.js";
import { executeWebResearch } from "./web-research.js";
import { isWeatherTool } from "./weather-tools.js";
import { executeWeather } from "../routes/weather.js";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../errors.js";
import { collectSensitiveStringValues, redactSensitiveValueOccurrences } from "../middleware/redact-sensitive.js";
import { redactSensitiveText } from "../redaction.js";

type VoiceApiScope = { companyId: string; agentId: string; userId: string; issueId: string };

async function resumeVoiceApprovalRun(db: Db, scope: VoiceApiScope, actionRequestId: string) {
  const runScope = and(
    eq(heartbeatRuns.companyId, scope.companyId),
    eq(heartbeatRuns.agentId, scope.agentId),
    eq(heartbeatRuns.responsibleUserId, scope.userId),
    eq(heartbeatRuns.runtimeMode, "voice_direct"),
    eq(heartbeatRuns.triggerDetail, "voice_direct"),
    sql`${heartbeatRuns.contextSnapshot}->>'issueId' = ${scope.issueId}`,
    sql`${heartbeatRuns.contextSnapshot}->>'source' = 'gemini_live_direct'`,
  );
  const [origin] = await db.select({ id: heartbeatRuns.id })
    .from(toolActionRequests)
    .innerJoin(toolInvocations, eq(toolInvocations.id, toolActionRequests.invocationId))
    .innerJoin(heartbeatRuns, eq(heartbeatRuns.id, toolInvocations.runId))
    .where(and(
      eq(toolActionRequests.id, actionRequestId),
      eq(toolActionRequests.companyId, scope.companyId),
      eq(toolActionRequests.issueId, scope.issueId),
      eq(toolActionRequests.requestedByAgentId, scope.agentId),
      eq(toolInvocations.companyId, scope.companyId),
      eq(toolInvocations.agentId, scope.agentId),
      eq(toolInvocations.issueId, scope.issueId),
      runScope,
    )).limit(1);
  if (!origin) throw forbidden("This connector approval does not belong to this user's voice conversation.");
  // The gateway binds approval to the originating run and requires that run to
  // be active. Reopen only a completed direct API audit run, never a model run.
  // The conditional claim also prevents concurrent retries sharing its session.
  const [run] = await db.update(heartbeatRuns)
    .set({ status: "running", finishedAt: null, updatedAt: new Date() })
    .where(and(eq(heartbeatRuns.id, origin.id), runScope, inArray(heartbeatRuns.status, ["succeeded", "failed"])))
    .returning({ id: heartbeatRuns.id });
  if (!run) throw conflict("This connector approval is already being retried or its voice operation was stopped.");
  return run;
}

type Operation = { method: string; path: string; resource?: "issue" | "agent" | "project" | "goal"; permission?: PermissionKey; note?: string };
export const VOICE_API_OPERATIONS: Record<string, Operation> = {
  weather_city: {method:"POST",path:"/companies/:companyId/weather/city",note:"Open-Meteo current conditions and forecast: data={city,units?:metric|us,forecastDays?:1–16,includeHourly?:boolean,countryCode?:US}. Qualify the city by state/country. Returns card-ready view, units, timestamps and sources; ambiguity returns candidates."},
  weather_geocode: {method:"POST",path:"/companies/:companyId/weather/geocode",note:"City/postcode lookup: data={name,count?,language?,countryCode?}, or {id} for a GeoNames location."},
  weather_capabilities: {method:"POST",path:"/companies/:companyId/weather/capabilities",note:"Discover all Open-Meteo APIs and parameters. data={} or {endpoint,parameter?}. No weather fetch."},
  weather_query: {method:"POST",path:"/companies/:companyId/weather/query",note:"Advanced Open-Meteo data: data={endpoint,parameters:{latitude,longitude,current?,hourly?,daily?,timezone?,...}}. Discover exact fields using weather_capabilities. Preserve units/nulls/coverage."},
  terminate_organization: { method: "POST", path: "server-admin", note: 'Permanently delete a requested organization and its managed data. Supply id from the fresh server organization inventory and data JSON {confirmationName: exact organization name}. WHOXOS itself is protected and cannot be deleted. If the spoken target is ambiguous, clarify the target; never guess. This calls the canonical termination endpoint, not DELETE /companies. Report success only if success:true; otherwise explain the specific returned reason.' },
  server_api: { method: "POST", path: "server-admin", note: 'Manage organizations and their agents/tasks/projects using canonical platform APIs as the responsible server administrator. WHOXOS root-enabled agents only. data={method:"GET"|"POST"|"PATCH"|"PUT"|"DELETE",path:"/api/...",body?:object}. Create an organization: POST /api/companies body {name,description?}. Update: PATCH /api/companies/{id}. List agents/tasks/projects: GET /api/companies/{id}/agents|issues|projects. Create: POST those collection paths. Edit: PATCH /api/agents|issues|projects/{id}. Existing route schemas and permissions apply. Inspect success/status/result; failed or pending is not completed. Do not retry writes with unknown outcomes. Use canonical APIs rather than direct database writes. Host/coding tasks use voice_workspace target production.' },
  get_server_context: { method: "GET", path: "server-admin", note: "All hosted organizations and exact counts. WHOXOS only; requires current human server admin and enabled agent production-root grant. No arguments." },
  get_server_health: { method: "GET", path: "server-admin", note: "Live entire-server CPU, memory, block storage, network and services. Same production-root authorization." },
  get_server_organization: { method: "GET", path: "server-admin", note: "Cross-organization agent, task and project summaries. Supply id from get_server_context. Same production-root authorization. Full host inspection is available through voice_workspace target production." },
  search_web: { method: "POST", path: "/companies/:companyId/web/search", note: "Public SearXNG web search. data={query, category:general|images|videos|news, count?:1–8, timeRange?:day|week|month|year, language?:en}; exactly one category. Returns titles, URLs and snippets. Never include private organization data or credentials." },
  read_web_page: { method: "POST", path: "/companies/:companyId/web/read", note: "Read a public source page. data={url}. Returns bounded page text and source citation; private/server network addresses and credentials are blocked." },
  list_connected_tools: { method: "GET", path: "/tool-gateway/tools", permission: "tools:use", note: "Discover the current agent's permitted connector tools." },
  call_connected_tool: { method: "POST", path: "/tool-gateway/tools/call", permission: "tools:use", note: "tool, parameters, idempotencyKey, approvedActionRequestId. Existing connector approvals still apply; pending means not executed." },
  overview: { method: "GET", path: "/companies/:companyId/dashboard" },
  get_organization_context: { method: "GET", path: "/companies/:companyId/organization-context", note: "Fresh authenticated human speaker, human members and roles, founders/owners, AI employees and reporting relationships; also lists permitted data discovery paths. No arguments needed." },
  list_agents: { method: "GET", path: "/companies/:companyId/agents" },
  get_agent: { method: "GET", path: "/agents/:id", resource: "agent" },
  pause_agent: { method: "POST", path: "/agents/:id/pause", resource: "agent", permission: "agents:configure" },
  list_tasks: { method: "GET", path: "/companies/:companyId/issues", note: "Returns compact task summaries (up to 100). Use overview for organization task totals and get_task with an id for full task details." },
  get_task: { method: "GET", path: "/issues/:id", resource: "issue" },
  create_task: { method: "POST", path: "/companies/:companyId/issues", permission: "tasks:assign", note: "title, description, assigneeAgentId, projectId, priority, status. Voice-owned tasks never launch another model; execute their work with voice_workspace and record results." },
  adopt_task: { method: "PATCH", path: "/issues/:id", resource: "issue", permission: "tasks:assign", note: "Explicitly take over an idle existing task for Gemini-only voice execution, without changing its status or assignee. Refuses active runs. Use only when the user requests this conversion." },
  update_task: { method: "PATCH", path: "/issues/:id", resource: "issue", permission: "tasks:assign", note: "Only voice-owned tasks can be updated through voice. Use adopt_task with the user's authorization to convert an idle existing task first." },
  list_comments: { method: "GET", path: "/issues/:id/comments", resource: "issue" },
  add_comment: { method: "POST", path: "/issues/:id/comments", resource: "issue", permission: "tasks:assign", note: "body. Voice-owned tasks only; never wakes an agent." },
  list_documents: { method: "GET", path: "/issues/:id/documents", resource: "issue" },
  get_document: { method: "GET", path: "/issues/:id/documents/:key", resource: "issue" },
  put_document: { method: "PUT", path: "/issues/:id/documents/:key", resource: "issue", permission: "tasks:assign", note: 'Required data: {body, format:"markdown"}. Optional title and changeSummary. When updating an existing document, first get_document and pass its latestRevisionId as baseRevisionId; a stale revision returns 409. Voice-owned tasks only.' },
  list_projects: { method: "GET", path: "/companies/:companyId/projects" },
  get_project: { method: "GET", path: "/projects/:id", resource: "project" },
  create_project: { method: "POST", path: "/companies/:companyId/projects", permission: "tasks:assign", note: "name, description, status" },
  update_project: { method: "PATCH", path: "/projects/:id", resource: "project", permission: "tasks:assign", note: "name, description, status" },
  list_goals: { method: "GET", path: "/companies/:companyId/goals" },
  get_goal: { method: "GET", path: "/goals/:id", resource: "goal" },
  list_skills: { method: "GET", path: "/companies/:companyId/skills" },
  list_secret_proposals: { method: "GET", path: "/agents/me/secret-proposals" },
  propose_secret: { method: "POST", path: "/agents/me/secret-proposals", permission: "tools:use", note: "kind=secret or binding and normal proposal fields. Requires admin approval; never approve your own proposal or read secret values aloud." },
};
export const voiceApiSchema = z.object({
  action: z.string().max(80), id: z.string().uuid().optional(), key: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional(),
  data: z.string().max(128_000).optional(),
}).strict();
const privateResultField = /^(adapterConfig|runtimeConfig|apiKey|accessToken|refreshToken|token|secretValue|encryptedValue|password|env)$/i;
function voiceApiSensitiveValues(value: unknown, depth = 0): string[] {
  if (depth > 16 || !value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(privateResultField.test(key) ? collectSensitiveStringValues({ credentials: item }) : []),
    ...voiceApiSensitiveValues(item, depth + 1),
  ]);
}
export function sanitizeVoiceApiResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeVoiceApiResult);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !privateResultField.test(key)).map(([key, item]) => [key, sanitizeVoiceApiResult(item)]));
}
export async function callVoiceApi(db: Db, req: Request, scope: VoiceApiScope, raw: unknown) {
  const args = voiceApiSchema.parse(raw);
  if (args.action === "capabilities") return { execution: "Gemini Live only; no Codex fallback", operations: VOICE_API_OPERATIONS, workspace: "voice_workspace: persistent private /workspace, shell, Python and Node; no host files, credentials, or network. Save deliverables to task documents using put_document.", limitations: "Only voice-owned tasks can be mutated; adopt_task can convert an idle task when explicitly requested. Agent resume and model-runtime launch are intentionally not exposed. Secret proposals require admin approval." };
  const op = Object.hasOwn(VOICE_API_OPERATIONS, args.action) ? VOICE_API_OPERATIONS[args.action] : undefined;
  if (!op) throw badRequest("Unsupported voice action. Use capabilities to discover available operations. No other model was started.");
  let data: Record<string, unknown> = {};
  try { data = z.record(z.string(), z.unknown()).parse(JSON.parse(args.data ?? "{}")); } catch { throw badRequest("data must be a JSON object"); }
  if (args.action === "terminate_organization") {
    if (req.actor.type !== "board" || req.actor.userId !== scope.userId) throw forbidden("Voice speaker identity does not match this session.");
    if (!args.id || args.key) throw badRequest("terminate_organization requires id and data containing confirmationName");
    const body = z.object({ confirmationName: z.string().min(1) }).strict().parse(data);
    return executeServerManagement(db, req, scope.companyId, scope.agentId, { method: "POST", path: `/api/companies/${args.id}/terminate`, body });
  }
  if (args.action === "server_api") {
    if (req.actor.type !== "board" || req.actor.userId !== scope.userId) throw forbidden("Voice speaker identity does not match this session.");
    if (args.id || args.key) throw badRequest("server_api takes action and data only");
    return executeServerManagement(db, req, scope.companyId, scope.agentId, data);
  }
  if (["get_server_context", "get_server_health", "get_server_organization"].includes(args.action)) {
    if (args.key || Object.keys(data).length || (args.action === "get_server_organization" ? !args.id : !!args.id)) throw badRequest("Server reads take only action; get_server_organization also requires id.");
    return readVoiceServerContext(db, req, scope, args.action, args.id);
  }
  if (isWeatherTool(args.action)) {
    if(req.actor.type!=="board"||req.actor.userId!==scope.userId)throw forbidden("Voice speaker identity does not match this session.");
    if(args.id||args.key)throw badRequest("Weather tools take only action and data.");
    return executeWeather(db,req,scope.companyId,args.action,data,scope.agentId);
  }
  if (args.action === "search_web" || args.action === "read_web_page") {
    if (req.actor.type !== "board" || req.actor.userId !== scope.userId) throw forbidden("Voice speaker identity does not match this session.");
    if (args.id || args.key) throw badRequest("Web research takes only action and data.");
    return executeWebResearch(db, req, scope.companyId, args.action, data, scope.agentId);
  }
  if (args.action === "get_organization_context") {
    // Resolve locally so the authenticated speaker is not replaced by the
    // internal agent JWT used to forward other direct API reads.
    if (req.actor.type !== "board" || req.actor.userId !== scope.userId) throw forbidden("Voice speaker identity does not match this session.");
    if (args.id || args.key || Object.keys(data).length) throw badRequest("get_organization_context takes no additional arguments.");
    return loadAgentOrganizationContext(db, {
      companyId: scope.companyId, agentId: scope.agentId, currentUserId: scope.userId,
      actors: [req.actor, { type: "agent", agentId: scope.agentId, companyId: scope.companyId }],
    });
  }
  const tables = { issue: issues, agent: agents, project: projects, goal: goals };
  let resource: any;
  if (op.resource) {
    if (!args.id) throw badRequest("id is required");
    const table = tables[op.resource];
    [resource] = await db.select().from(table).where(and(eq(table.id, args.id), eq(table.companyId, scope.companyId)));
    if (!resource || (op.resource === "issue" && resource.conversationAgentId)) throw notFound("Resource not found in this organization");
  }
  if (op.path.includes(":key") && !args.key) throw badRequest("key is required");
  const readAccess = createVoiceReadAccess(db, req.actor, scope);
  if (op.method === "GET") await readAccess.assertOperation(args.action, resource);
  const access = accessService(db);
  if (op.method !== "GET" || op.permission) {
    const context = { issueId: op.resource === "issue" ? args.id : null, projectId: resource?.projectId ?? data.projectId ?? null, assigneeAgentId: data.assigneeAgentId ?? resource?.assigneeAgentId ?? null };
    // Connector policies and native secret proposal routes enforce agent access themselves.
    // Their scoped grants are not generic principal tools:use grants.
    const actors = op.permission === "tools:use" ? [req.actor] : [req.actor, { type: "agent" as const, agentId: scope.agentId, companyId: scope.companyId }];
    for (const actor of actors) {
      const decision = await access.decide({ actor, action: op.permission ?? "tools:use", resource: { type: op.resource ?? "company", companyId: scope.companyId, ...context } as any, scope: context as any });
      if (!decision.allowed) throw forbidden(decision.explanation);
    }
    if (op.resource === "issue" && args.action !== "adopt_task" && resource.assigneeAdapterOverrides?.adapterConfig?.voiceExecutionOnly !== true) throw forbidden("This task belongs to a text execution runtime. Create a voice-owned task instead; voice will not start or take over its runtime.");
  }
  if (args.action === "adopt_task") {
    if (Object.keys(data).length) throw badRequest("adopt_task takes only the task ID");
    const result = await db.transaction(async tx => {
      const [task] = await tx.select().from(issues).where(and(eq(issues.id, args.id!), eq(issues.companyId, scope.companyId))).for("update");
      if (!task || task.conversationAgentId) throw notFound("Task not found");
      const [active] = await tx.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(eq(heartbeatRuns.companyId, scope.companyId), inArray(heartbeatRuns.status, ["queued", "running"]), sql`(${heartbeatRuns.contextSnapshot}->>'issueId' = ${task.id} OR ${heartbeatRuns.id} = ${task.executionRunId} OR ${heartbeatRuns.id} = ${task.checkoutRunId})`));
      if (active) throw forbidden("Stop or finish the current task run before converting it to voice execution.");
      const overrides = task.assigneeAdapterOverrides ?? {};
      const config = (overrides.adapterConfig ?? {}) as Record<string, unknown>;
      await tx.update(issues).set({ assigneeAdapterOverrides: { ...overrides, adapterConfig: { ...config, voiceExecutionOnly: true } }, updatedAt: new Date() }).where(eq(issues.id, task.id));
      return { id: task.id, identifier: task.identifier, execution: "gemini_live_only", status: task.status };
    });
    await logActivity(db, { companyId: scope.companyId, actorType: "user", actorId: scope.userId, action: "issue.voice_execution_enabled", entityType: "issue", entityId: args.id!, details: { agentId: scope.agentId } });
    return result;
  }
  // Never expose adapter/env/workspace configuration through the generic tool.
  const allowed = args.action.includes("project") ? ["name", "description", "status"] : ["title", "description", "status", "priority", "assigneeAgentId", "projectId", "body", "format", "changeSummary", "baseRevisionId"];
  if (op.method !== "GET" && !["propose_secret", "call_connected_tool"].includes(args.action) && Object.keys(data).some(key => !allowed.includes(key))) throw badRequest("Unsupported fields for this voice operation");
  for (const [field, table] of [["assigneeAgentId", agents], ["projectId", projects]] as const) {
    if (data[field] != null) {
      const id = z.string().uuid().parse(data[field]);
      const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.companyId, scope.companyId)));
      if (!row) throw notFound(`${field} is not in this organization`);
    }
  }
  if (args.action === "create_task") data = { ...data, status: data.status ?? "backlog", assigneeAdapterOverrides: { adapterConfig: { voiceExecutionOnly: true } } };
  if (args.action === "list_tasks") data = { ...data, limit: 100 };
  let apiPath = "/api" + op.path.replace(":companyId", scope.companyId).replace(":id", args.id ?? "").replace(":key", args.key ?? "");
  if (op.method === "GET" && Object.keys(data).length) apiPath += "?" + new URLSearchParams(Object.entries(data).map(([key, value]) => [key, String(value)]));
  const approvedActionRequestId = args.action === "call_connected_tool" && data.approvedActionRequestId != null
    ? z.string().uuid().parse(data.approvedActionRequestId) : null;
  const run = approvedActionRequestId
    ? await resumeVoiceApprovalRun(db, scope, approvedActionRequestId)
    : (await db.insert(heartbeatRuns).values({ companyId: scope.companyId, agentId: scope.agentId, status: "running", invocationSource: "on_demand", triggerDetail: "voice_direct", responsibleUserId: scope.userId, startedAt: new Date(), contextSnapshot: { issueId: scope.issueId, source: "gemini_live_direct" }, runtimeMode: "voice_direct" }).returning({ id: heartbeatRuns.id }))[0]!;
  const token = createLocalAgentJwt(scope.agentId, scope.companyId, "gemini_live", run.id, scope.userId);
  const permit = voiceDirectPermit(op.method, apiPath);
  let success = false;
  try {
    if (!token) throw new Error("Voice API authentication unavailable");
    if (args.action === "list_connected_tools" || args.action === "call_connected_tool") {
      const gateway = req.app.locals.voiceToolGateway as ToolGatewayService | undefined;
      if (!gateway) throw new Error("Connector gateway unavailable; no fallback runtime was started.");
      try {
        const session = await gateway.createSession({ ...scope, runId: run.id, actorType: "user", actorId: scope.userId, ttlMs: 60_000 });
        const result = args.action === "list_connected_tools"
          ? await gateway.listToolsForSession(session.token)
          : await gateway.executeTool({ sessionToken: session.token, tool: z.string().min(1).parse(data.tool), parameters: data.parameters ?? {}, timeoutMs: 45_000, idempotencyKey: z.string().min(1).max(200).parse(data.idempotencyKey), approvedActionRequestId });
        const envelope = result && typeof result === "object" && !Array.isArray(result)
          ? result as Record<string, unknown> : null;
        const toolResult = envelope?.result && typeof envelope.result === "object" && !Array.isArray(envelope.result)
          ? envelope.result as Record<string, unknown> : null;
        const toolData = toolResult?.data && typeof toolResult.data === "object" && !Array.isArray(toolResult.data)
          ? toolResult.data as Record<string, unknown> : null;
        if (args.action === "call_connected_tool" && envelope?.status === "completed"
          && (Boolean(toolResult?.error) || toolData?.isError === true)) {
          // A remote MCP call can return HTTP success with an error payload.
          // Keep the audit run failed and give the model an explicit outcome,
          // without exposing provider prose or implying a failed write had no
          // effects. A retry requires checking the original invocation first.
          const invocationId = z.string().uuid().safeParse(envelope.invocationId);
          return {
            status: "failed", code: "connector_tool_failed", retrySafe: false,
            ...(invocationId.success ? { invocationId: invocationId.data } : {}),
            error: "The connected tool reported an error. It may have partially completed. Inspect the recorded invocation before retrying; do not retry automatically.",
          };
        }
        success = true;
        return sanitizeVoiceApiResult(result);
      } catch (error) {
        if (!(error instanceof ToolGatewayHttpError)) throw error;
        const sensitiveValues = [...collectSensitiveStringValues(data), ...collectSensitiveStringValues(error.details), ...voiceApiSensitiveValues(data), ...voiceApiSensitiveValues(error.details)];
        const ids = Object.fromEntries(["actionRequestId", "invocationId", "interactionId", "issueId"].flatMap(key =>
          z.string().uuid().safeParse(error.details[key]).success ? [[key, error.details[key] as string]] : []));
        const code = /^[a-z][a-z0-9_]{1,80}$/.test(error.reasonCode)
          && redactSensitiveValueOccurrences(error.reasonCode, sensitiveValues) === error.reasonCode ? error.reasonCode : "connector_action_failed";
        if (code === "approval_required" && ids.actionRequestId) {
          // An approval card is an expected pending result, not a transport
          // failure. Returning it lets Gemini retain the ID without granting it
          // permission to approve or replay the action itself.
          success = true;
          return {
            status: "requires_approval", executed: false, code, ...ids,
            instructions: "This action has not run. Ask the user to review the approval card in this chat. Do not retry while approval is pending. Approval may execute the action automatically; check the recorded result before any retry. If approved but not executed, retry the same tool using approvedActionRequestId with this actionRequestId.",
          };
        }
        const message = error.status < 500
          ? redactSensitiveText(String(redactSensitiveValueOccurrences(error.message, sensitiveValues))).slice(0, 512)
          : "The connected tool could not complete this action. Try again later.";
        throw new HttpError(error.status, message || "The connected tool could not complete this action.", { code, ...ids });
      }
    }
    const response = await fetch(`http://127.0.0.1:${req.socket.localPort}${apiPath}`, { method: op.method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-overview-voice-direct": permit.token }, ...(op.method !== "GET" ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(45_000), redirect: "error" });
    let result: unknown;
    try { result = await response.json(); }
    catch {
      // Proxy/server failures can return HTML or an empty body. Preserve the
      // actionable status without exposing that body or reporting a JSON parse
      // exception as though the entire voice session failed.
      throw new HttpError(response.ok ? 502 : response.status,
        response.ok ? "WHOXOS returned an unreadable action result. Check the action before retrying a write."
          : `WHOXOS could not complete this action (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      const failure = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const fallback = `WHOXOS could not complete this action (HTTP ${response.status}).`;
      const sensitiveValues = [...collectSensitiveStringValues(data), ...collectSensitiveStringValues(result), ...voiceApiSensitiveValues(data), ...voiceApiSensitiveValues(result)];
      // Only return bounded error prose and its code. Never serialize the
      // upstream result, which can carry credential fields or provider traces.
      const message = response.status < 500 && typeof failure.error === "string"
        ? redactSensitiveText(String(redactSensitiveValueOccurrences(failure.error, sensitiveValues))).slice(0, 512) : fallback;
      const details = failure.details && typeof failure.details === "object" ? failure.details as Record<string, unknown> : {};
      const code = failure.code ?? details.code;
      const safeCode = typeof code === "string" && /^[a-z][a-z0-9_]{1,80}$/.test(code)
        && redactSensitiveValueOccurrences(code, sensitiveValues) === code ? code : undefined;
      throw new HttpError(response.status, message || fallback, safeCode ? { code: safeCode } : undefined);
    }
    if (op.method === "GET") result = await readAccess.filterResult(args.action, result);
    if (args.action === "list_tasks" && Array.isArray(result)) {
      // A list is for navigation/counting, not replaying every task's instructions
      // and execution history into the voice model. The complete authorized row
      // remains available through get_task. Project only after row authorization.
      result = result.map(({ id, identifier, title, status, priority, assigneeAgentId, projectId, updatedAt }) =>
        ({ id, identifier, title, status, priority, assigneeAgentId, projectId, updatedAt }));
    }
    success = true;
    return sanitizeVoiceApiResult(result);
  } finally {
    permit.revoke();
    await db.update(heartbeatRuns).set({ status: success ? "succeeded" : "failed", finishedAt: new Date(), usageJson: { provider: "gemini_live", modelInvocations: 0 }, resultJson: { action: args.action, success, execution: "direct_api" } }).where(eq(heartbeatRuns.id, run.id));
  }
}
