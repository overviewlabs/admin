import { and, eq } from "drizzle-orm";
import { agents, issues, projects, type Db } from "@whoxos/db";
import { z } from "zod";
import { forbidden } from "../errors.js";
import { accessService } from "./access.js";
import type { AuthorizationActor, AuthorizationResource } from "./authorization.js";

type ResourceKind = "issue" | "agent" | "project";
type ResourceRef = { id: string; companyId?: string };
type CanonicalRow = Record<string, unknown> & { id: string; companyId: string };
const detailKinds: Record<string, ResourceKind> = {
  get_task: "issue", list_comments: "issue", list_documents: "issue", get_document: "issue",
  get_agent: "agent", get_project: "project",
};
const listKinds: Record<string, ResourceKind> = {
  list_tasks: "issue", list_agents: "agent", list_projects: "project",
};
const nullableString = (value: unknown) => typeof value === "string" ? value : null;

/**
 * Intersect the signed-in member's read boundary with the selected agent's.
 * Callers still authorize company/session ownership, and the forwarded API
 * independently rechecks the agent. Keep this factory local to one request.
 */
export function createVoiceReadAccess(
  db: Db,
  boardActor: AuthorizationActor,
  scope: { companyId: string; agentId: string },
) {
  const access = accessService(db);
  const actors: AuthorizationActor[] = [boardActor, { type: "agent", agentId: scope.agentId, companyId: scope.companyId }];
  const rows = new Map<string, Promise<CanonicalRow | undefined>>();
  const decisions = new Map<string, Promise<boolean>>();
  const companyScope = new Map<AuthorizationActor, Promise<boolean>>();

  async function canonical(kind: ResourceKind, ref: ResourceRef) {
    if (!z.string().uuid().safeParse(ref.id).success || (ref.companyId !== undefined && ref.companyId !== scope.companyId)) return undefined;
    const key = `${kind}:${ref.id}`;
    let row = rows.get(key);
    if (!row) {
      const table = { issue: issues, agent: agents, project: projects }[kind];
      row = db.select().from(table).where(and(eq(table.id, ref.id), eq(table.companyId, scope.companyId)))
        .then(result => result[0] as CanonicalRow | undefined);
      rows.set(key, row);
    }
    const result = await row;
    // Defend against missing, deleted or cross-company references even if the
    // returned projection or model-provided arguments claim otherwise.
    if (!result || result.id !== ref.id || result.companyId !== scope.companyId) return undefined;
    if (kind === "issue" && result.conversationAgentId != null) return undefined;
    return result;
  }

  async function actorCanRead(actor: AuthorizationActor, kind: ResourceKind, row: CanonicalRow) {
    if (kind !== "issue") {
      const resource: AuthorizationResource = kind === "agent"
        ? { type: "agent", companyId: scope.companyId, agentId: row.id }
        : { type: "project", companyId: scope.companyId, projectId: row.id };
      return (await access.decide({ actor, action: kind === "agent" ? "agent:read" : "project:read", resource })).allowed;
    }
    const issueScope = {
      issueId: row.id, projectId: nullableString(row.projectId), parentIssueId: nullableString(row.parentId),
      assigneeAgentId: nullableString(row.assigneeAgentId), assigneeUserId: nullableString(row.assigneeUserId),
    };
    return (await access.decide({
      actor, action: "issue:read", scope: issueScope,
      resource: { type: "issue", companyId: scope.companyId, ...issueScope, status: nullableString(row.status) },
    })).allowed;
  }

  function actorCanReadCompanyScope(actor: AuthorizationActor) {
    let decision = companyScope.get(actor);
    if (!decision) {
      decision = access.decide({ actor, action: "company_scope:read", resource: { type: "company", companyId: scope.companyId } }).then(value => value.allowed);
      companyScope.set(actor, decision);
    }
    return decision;
  }

  async function canReadResource(kind: ResourceKind, ref: ResourceRef, list = false) {
    const row = await canonical(kind, ref);
    if (!row) return false;
    const key = `${kind}:${row.id}:${list}`;
    let decision = decisions.get(key);
    if (!decision) {
      decision = Promise.all(actors.map(async actor => {
        // Match GET /companies/:id/issues: broad company read admits the
        // task list; otherwise that endpoint filters each issue individually.
        if (list && kind === "issue" && await actorCanReadCompanyScope(actor)) return true;
        return actorCanRead(actor, kind, row);
      })).then(allowed => allowed.every(Boolean));
      decisions.set(key, decision);
    }
    return decision;
  }

  async function assertOperation(action: string, resource?: ResourceRef) {
    const kind = Object.hasOwn(detailKinds, action) ? detailKinds[action] : undefined;
    if (kind && (!resource || !await canReadResource(kind, resource))) {
      throw forbidden("This resource is outside your or this agent's read access.");
    }
    // Dashboard, goals and skills use only company membership in their actual
    // read endpoints. Lists must be filtered, not denied company-wide.
  }

  async function filterResult(action: string, result: unknown): Promise<unknown> {
    const kind = Object.hasOwn(listKinds, action) ? listKinds[action] : undefined;
    if (!kind) return result;
    if (!Array.isArray(result)) throw new Error("Unexpected voice resource list response.");
    const allowed = await Promise.all(result.map(row => {
      if (!row || typeof row !== "object" || typeof row.id !== "string") return false;
      if (row.companyId !== undefined && typeof row.companyId !== "string") return false;
      return canReadResource(kind, row as ResourceRef, true);
    }));
    return result.filter((_, index) => allowed[index]);
  }

  return { canReadResource, assertOperation, filterResult };
}
