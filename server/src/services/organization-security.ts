import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { type Db, agents, companies, aiProviderDefaults, connectionGrants, toolConnections, toolConnectionInstalls } from "@whoxos/db";
import { agentService } from "./agents.js";
import { isSecurityAgent, securityTeamSize, SECURITY_AGENT_MODEL } from "./agent-model-policy.js";
import { logActivity } from "./activity-log.js";
import { conflict } from "../errors.js";

export function securityAgentIds(rows: Array<typeof agents.$inferSelect>): Set<string> {
  const ids = new Set(rows.filter(isSecurityAgent).map(agent => agent.id));
  // Existing departments may contain governance/privacy specialists without
  // "security" in their title. Their security manager defines their team.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (row.adapterType !== "typesafe" && row.reportsTo && ids.has(row.reportsTo) && !ids.has(row.id)) { ids.add(row.id); changed = true; }
  }
  return ids;
}
const positions = [
  { name: "Security Lead", title: "Organization Security Lead", match: /security lead/i },
  { name: "Application Security Engineer", title: "Application Security and Secure Design", match: /application security|appsec/i },
  { name: "Security & Incident Response Engineer", title: "Security Operations and Incident Response", match: /incident response/i },
  { name: "Security Analyst", title: "Security Assurance and Monitoring", match: /security analyst/i },
];
export async function ensureOrganizationSecurity(db: Db, companyId: string) {
  return db.transaction(async tx => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId)).for("update");
    if (!company || company.status !== "active") return { created: 0, securityAgents: 0 };
    const rows = (await tx.select().from(agents).where(eq(agents.companyId, companyId))).filter(agent => agent.status !== "terminated");
    const ids = securityAgentIds(rows);
    const team = rows.filter(agent => ids.has(agent.id));
    const business = rows.filter(agent => !ids.has(agent.id) && agent.adapterType !== "typesafe" && !agent.metadata?.builtInAgent);
    const required = securityTeamSize(company, business.length);
    const manager = business.find(agent => agent.role === "ceo") ?? business.find(agent => !agent.reportsTo);
    const txDb = tx as unknown as Db;
    const svc = agentService(txDb);
    const [account] = company.defaultResponsibleUserId ? await tx.select({ connectionId: toolConnections.id })
      .from(aiProviderDefaults).innerJoin(connectionGrants, and(eq(connectionGrants.id, aiProviderDefaults.grantId), eq(connectionGrants.companyId, companyId)))
      .innerJoin(toolConnections, and(eq(toolConnections.id, connectionGrants.connectionId), eq(toolConnections.companyId, companyId)))
      .where(and(eq(aiProviderDefaults.companyId, companyId), eq(aiProviderDefaults.userId, company.defaultResponsibleUserId), eq(aiProviderDefaults.provider, "openai"),
        eq(connectionGrants.status, "active"), eq(connectionGrants.kind, "user"), eq(connectionGrants.subjectUserId, company.defaultResponsibleUserId),
        eq(toolConnections.enabled, true), eq(toolConnections.healthStatus, "ok"))) : [];
    for (const agent of team) {
      const config = { ...agent.adapterConfig, model: SECURITY_AGENT_MODEL, engine: "acp" };
      const metadata = { ...agent.metadata, organizationSecurity: true };
      const runtimeConfig = account ? { ...agent.runtimeConfig, aiConnection: { provider: "openai", method: "subscription", mode: "responsible_user" } } : agent.runtimeConfig;
      if (agent.adapterType !== "codex_local" || !isDeepStrictEqual(config, agent.adapterConfig) || agent.metadata?.organizationSecurity !== true ||
          !isDeepStrictEqual(runtimeConfig, agent.runtimeConfig) || (!agent.reportsTo && manager)) {
        await svc.update(agent.id, { adapterType: "codex_local", adapterConfig: config, metadata, runtimeConfig,
          ...(!agent.reportsTo && manager ? { reportsTo: manager.id } : {}) }, { recordRevision: { source: "patch" } });
        await logActivity(txDb, { companyId, actorType: "system", actorId: "organization-security-policy", action: "agent.updated", entityType: "agent", entityId: agent.id,
          details: { model: SECURITY_AGENT_MODEL, engine: "acp", organizationSecurity: true } });
      }
      if (account) await tx.insert(toolConnectionInstalls).values({ companyId, connectionId: account.connectionId, targetType: "agent", targetId: agent.id, createdByUserId: company.defaultResponsibleUserId }).onConflictDoNothing();
    }
    let created = 0;
    while (team.length < required) {
      const position = required === 1 ? { name: "Security Engineer", title: "Organization Security and Incident Response", match: /security engineer/i } :
        positions.find(position => !team.some(agent => position.match.test(agent.name))) ?? positions[3];
      const lead = team.find(agent => /security lead/i.test(agent.name));
      const instructions = `You are {{agent.name}}, responsible for defensive security at ${company.name}. Review authentication, permissions, secrets, dependencies, deployment security and incident evidence within this organization. Prioritize verified findings by impact; coordinate fixes and independent validation with the owning engineers. Never expose credentials or private incident evidence in public comments. Use GPT-6 Sol with Daybreak; if required access is unavailable, report the blocker and never substitute a different model or standard access. Work on assigned tasks and authorized security reviews; do not run unsolicited scans or recurring processes. For chat, reply naturally and keep bookkeeping internal. Preserve budget, human approval, company boundaries and production data. Use ordinary organization tools; request the appropriate operator for privileged work instead of granting yourself access.`;
      const agent = await svc.create(companyId, { name: position.name, title: position.title, role: "security", adapterType: "codex_local",
        adapterConfig: { model: SECURITY_AGENT_MODEL, engine: "acp", promptTemplate: instructions, ...(manager?.adapterConfig.cwd ? { cwd: manager.adapterConfig.cwd } : {}) },
        runtimeConfig: { aiConnection: { provider: "openai", method: "subscription", mode: "responsible_user" }, heartbeat: { enabled: false, wakeOnDemand: true, maxConcurrentRuns: 1 } },
        reportsTo: position.match.source === "security lead" ? manager?.id ?? null : lead?.id ?? manager?.id ?? null,
        capabilities: position.title, metadata: { organizationSecurity: true },
      }, { skipSecurityCoverage: true, ...(account ? { aiConnectionInstall: { connectionId: account.connectionId, createdByUserId: company.defaultResponsibleUserId } } : {}) });
      team.push(agent); created += 1;
      await logActivity(txDb, { companyId, actorType: "system", actorId: "organization-security-policy", action: "agent.created", entityType: "agent", entityId: agent.id,
        details: { name: agent.name, role: "security", model: SECURITY_AGENT_MODEL, securityTeamSize: required } });
    }
    return { created, securityAgents: team.length };
  });
}
export async function assertSecurityCoverageAfterRemoval(db: Db, agent: typeof agents.$inferSelect) {
  const [company] = await db.select().from(companies).where(eq(companies.id, agent.companyId));
  if (!company || company.status !== "active") return;
  const rows = (await db.select().from(agents).where(eq(agents.companyId, agent.companyId))).filter(row => row.status !== "terminated");
  const ids = securityAgentIds(rows);
  if (!ids.has(agent.id)) return;
  const remaining = rows.filter(row => row.id !== agent.id);
  const remainingIds = securityAgentIds(remaining);
  const required = securityTeamSize(company, remaining.filter(row => !remainingIds.has(row.id) && row.adapterType !== "typesafe").length);
  if (remainingIds.size < required) throw conflict("Create replacement security coverage before removing this security agent.", { code: "organization_security_coverage_required", required });
}
