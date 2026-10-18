import type { Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { agents, companies, issues, projects, type Db } from "@whoxos/db";
import { forbidden } from "../errors.js";
import { assertProductionRootExecution, callRootExecutor, type RootAccessStatus } from "./production-root.js";
import { getServerMonitor } from "./server-monitor.js";

type Scope = { companyId: string; agentId: string; userId: string };
export async function assertVoiceServerAccess(db: Db, req: Request, scope: Scope) {
  if (req.actor.type !== "board" || req.actor.userId !== scope.userId) throw forbidden("Voice speaker identity does not match this session.");
  await assertProductionRootExecution(db, req, scope.companyId, scope.agentId, true);
  const grant = await callRootExecutor<RootAccessStatus>({ operation: "status", companyId: scope.companyId, agentId: scope.agentId });
  if (!grant.available || !grant.enabled) throw forbidden("This agent's production root grant is not enabled.");
}
/** Explicit server-admin read path. Never expand ordinary tenant-scoped APIs. */
export async function readVoiceServerContext(db: Db, req: Request, scope: Scope, action: string, organizationId?: string) {
  await assertVoiceServerAccess(db, req, scope);
  let result: unknown;
  if (action === "get_server_health") result = await getServerMonitor();
  else if (action === "get_server_organization" && organizationId) {
    const [organization] = await db.select({ id: companies.id, name: companies.name, status: companies.status }).from(companies).where(eq(companies.id, organizationId));
    const [team, tasks, work] = await Promise.all([
      db.select({ id: agents.id, name: agents.name, role: agents.role, status: agents.status, reportsTo: agents.reportsTo }).from(agents).where(eq(agents.companyId, organizationId)).limit(101),
      db.select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status, assigneeAgentId: issues.assigneeAgentId }).from(issues).where(and(eq(issues.companyId, organizationId), isNull(issues.conversationAgentId))).limit(101),
      db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).where(eq(projects.companyId, organizationId)).limit(101),
    ]);
    result = { organization: organization ?? null, agents: team.slice(0,100), tasks: tasks.slice(0,100), projects: work.slice(0,100), truncated: team.length > 100 || tasks.length > 100 || work.length > 100 };
  } else {
    const organizations = await db.select({ id: companies.id, name: companies.name, status: companies.status }).from(companies).orderBy(companies.name);
    result = { organizations, totalOrganizations: organizations.length, activeOrganizations: organizations.filter(item => item.status === "active").length,
      capabilities: "Server-wide administrator visibility AND management. You CAN create organizations and manage their agents, tasks and projects using organization_api action server_api. To create: data JSON with method POST, path /api/companies, body containing name. To delete a clearly requested organization, call organization_api action terminate_organization with its id and data JSON containing confirmationName (exact name from this inventory). WHOXOS itself is protected. Never infer a destructive target from uncertain speech. No deletion occurred unless a tool result confirms success. Use capabilities for the complete contract. Use get_server_organization with id for any organization, get_server_health for live host metrics and services, and voice_workspace target production for authorized host inspection, code and system changes. Ordinary organization tools remain scoped to the selected organization." };
  }
  // Recheck revocation before releasing cross-organization information.
  await assertVoiceServerAccess(db, req, scope);
  return { available: true, scope: "server", asOf: new Date().toISOString(), ...result as object };
}
