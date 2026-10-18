import { z } from "zod";
import { issuesApi } from "@/api/issues";
import { projectsApi } from "@/api/projects";
import { agentsApi } from "@/api/agents";
import { dashboardApi } from "@/api/dashboard";

const id = z.string().uuid();
const text = z.string().trim().min(1).max(12000);
const taskFields = z.object({ title: text.optional(), description: text.optional(), status: z.enum(["backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"]).optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional(), assigneeAgentId: id.nullable().optional(), projectId: id.nullable().optional() }).strict();
const projectFields = z.object({ name: text.optional(), description: text.optional(), status: z.enum(["backlog", "planned", "in_progress", "completed", "cancelled"]).optional() }).strict();
const requestSchema = z.object({ action: z.enum(["overview", "list_agents", "get_agent", "pause_agent", "resume_agent", "list_tasks", "get_task", "create_task", "update_task", "list_projects", "get_project", "create_project", "update_project"]), id: id.optional(), data: z.string().max(16000).optional() }).strict();
const mutationCallId = z.string().trim().min(1).max(249);
// No model-selected URLs or credentials. All calls use the signed-in user's normal API permissions.
export async function executeOrganizationVoiceTool(companyId: string, raw: unknown, callId: string, authorizeTask?: (fields: { id?: string; assigneeAgentId?: string | null; projectId?: string | null }) => Promise<unknown>, assertActive?: () => void) {
 assertActive?.();
 const args = requestSchema.parse(raw);
 const requireId = () => id.parse(args.id);
 const scoped = <T extends { companyId: string }>(entity: T): T => {
  if (entity.companyId !== companyId) throw new Error("Resource is outside this voice session's organization.");
  return entity;
 };
 const safeAgent = (a: any) => ({ id: a.id, name: a.name, role: a.role, title: a.title, status: a.status, capabilities: a.capabilities });
 const safeTask = (t: any) => ({ id: t.id, identifier: t.identifier, title: t.title, description: t.description, status: t.status, priority: t.priority, projectId: t.projectId, assigneeAgentId: t.assigneeAgentId });
 const safeProject = (p: any) => ({ id: p.id, name: p.name, description: p.description, status: p.status });
 const data = () => {
  try { return JSON.parse(args.data ?? "{}"); }
  catch { throw new Error("Provide a valid JSON object in data."); }
 };
 const creationKey = () => `voice:${mutationCallId.parse(callId)}`;
 const requireChanges = (fields: Record<string, unknown>) => {
  if (!Object.keys(fields).length) throw new Error("Provide at least one field to update.");
 };
 switch (args.action) {
  case "overview": return dashboardApi.summary(companyId);
  case "list_agents": return (await agentsApi.list(companyId)).map(scoped).map(safeAgent);
  case "get_agent": return safeAgent(scoped(await agentsApi.get(requireId(), companyId)));
  case "pause_agent": case "resume_agent": {
   scoped(await agentsApi.get(requireId(), companyId));
   assertActive?.();
   return safeAgent(await agentsApi[args.action === "pause_agent" ? "pause" : "resume"](requireId(), companyId));
  }
  case "list_tasks": {
   const filters = z.object({ assigneeAgentId: id.optional(), status: z.enum(["backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"]).optional() }).strict().parse(data());
   const tasks = Object.keys(filters).length ? await issuesApi.list(companyId, { ...filters, limit: 100 }) : await issuesApi.list(companyId);
   return tasks.map(scoped).filter(t => !t.conversationAgentId).slice(0, 100).map(safeTask);
  }
  case "get_task": { const task = scoped(await issuesApi.get(requireId())); if (task.conversationAgentId) throw new Error("Use chat tools for conversations."); return safeTask(task); }
  case "create_task": case "update_task": {
   const fields = taskFields.parse(data());
   if (fields.assigneeAgentId) scoped(await agentsApi.get(fields.assigneeAgentId, companyId));
   if (fields.projectId) scoped(await projectsApi.get(fields.projectId, companyId));
   if (args.action === "create_task") {
    if (!fields.title) throw new Error("Task title is required.");
    assertActive?.();
    await authorizeTask?.({ assigneeAgentId: fields.assigneeAgentId, projectId: fields.projectId });
    assertActive?.();
    return safeTask(await issuesApi.create(companyId, { ...fields, status: fields.status ?? "backlog", idempotencyKey: creationKey() }));
   }
   requireChanges(fields);
   const task = scoped(await issuesApi.get(requireId()));
   if (task.conversationAgentId) throw new Error("Use chat tools for conversations.");
   assertActive?.();
   await authorizeTask?.({ id: task.id, assigneeAgentId: fields.assigneeAgentId, projectId: fields.projectId });
   assertActive?.();
   return safeTask(await issuesApi.update(task.id, fields));
  }
  case "list_projects": return (await projectsApi.list(companyId)).map(scoped).map(safeProject);
  case "get_project": return safeProject(scoped(await projectsApi.get(requireId(), companyId)));
  case "create_project": {
   const fields = projectFields.parse(data()); if (!fields.name) throw new Error("Project name is required.");
   assertActive?.();
   return safeProject(await projectsApi.create(companyId, { ...fields, idempotencyKey: creationKey() }));
  }
  case "update_project": {
   const fields = projectFields.parse(data()); requireChanges(fields); scoped(await projectsApi.get(requireId(), companyId));
   assertActive?.();
   return safeProject(await projectsApi.update(requireId(), fields, companyId));
  }
 }
}
