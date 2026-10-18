import { and, eq } from "drizzle-orm";
import { agents, companies, companyMemberships, issues, type Db } from "@whoxos/db";
import type { InteractionResolverGovernance } from "@whoxos/shared";
import { forbidden, notFound } from "../errors.js";
import { persistActivity } from "./activity-log.js";
import type { IssueThreadInteractionResolverActor, IssueThreadInteractionResolverAudienceInput } from "./issue-thread-interaction-resolution.js";

export type ExecutiveInteractionAuthority =
  | { kind: "organization_admin"; userId: string }
  | { kind: "delegated_ceo"; agentId: string; grantedByUserId: string; grantedAt: string };

async function membership(db: Db, companyId: string, principalType: "user" | "agent", principalId: string, lock: boolean) {
  const query = db.select({ status: companyMemberships.status, role: companyMemberships.membershipRole }).from(companyMemberships)
    .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, principalType), eq(companyMemberships.principalId, principalId)));
  const rows = await (lock ? query.for("share") : query);
  return rows[0];
}

export async function assertExecutiveDelegationAdministrator(db: Db, companyId: string, userId: string | null | undefined, lock = false) {
  if (!userId) throw forbidden("An authenticated organization owner or administrator is required");
  const member = await membership(db, companyId, "user", userId, lock);
  if (member?.status !== "active" || (member.role !== "owner" && member.role !== "admin")) {
    throw forbidden("Only an active organization owner or administrator can manage CEO delegation");
  }
}

/** Only this service writes the reserved grant. Identity and time come from the server. */
export async function setExecutiveDelegation(db: Db, input: { companyId: string; userId: string; agentId: string | null }) {
  return db.transaction(async transaction => {
    const tx = transaction as unknown as Db;
    const [company] = await tx.select().from(companies).where(eq(companies.id, input.companyId)).for("update");
    if (!company) throw notFound("Organization not found");
    await assertExecutiveDelegationAdministrator(tx, input.companyId, input.userId, true);
    const next: InteractionResolverGovernance = { ...company.interactionResolverGovernance };
    if (input.agentId) {
      const [agent] = await tx.select({ id: agents.id, role: agents.role, status: agents.status }).from(agents)
        .where(and(eq(agents.companyId, input.companyId), eq(agents.id, input.agentId))).for("share");
      const member = await membership(tx, input.companyId, "agent", input.agentId, true);
      if (!agent || agent.role !== "ceo" || !["active", "idle", "running", "error"].includes(agent.status) || member?.status !== "active") {
        throw forbidden("Delegation requires an active CEO belonging to this organization");
      }
      next.executiveDelegation = { agentId: agent.id, grantedByUserId: input.userId, grantedAt: new Date().toISOString() };
    } else {
      delete next.executiveDelegation;
    }
    const [updated] = await tx.update(companies).set({ interactionResolverGovernance: next, updatedAt: new Date() }).where(eq(companies.id, input.companyId)).returning();
    await persistActivity(tx, {
      companyId: input.companyId, actorType: "user", actorId: input.userId,
      action: input.agentId ? "company.executive_delegation_granted" : "company.executive_delegation_revoked",
      entityType: "company", entityId: input.companyId,
      details: { agentId: input.agentId, previousAgentId: company.interactionResolverGovernance.executiveDelegation?.agentId ?? null, scope: "ordinary_task_interactions" },
    });
    return updated!;
  });
}

export type ExecutiveInteractionInput = {
  companyId: string;
  issueId: string;
  actor: IssueThreadInteractionResolverActor;
  interaction: IssueThreadInteractionResolverAudienceInput["interaction"] & { kind: string; payload?: unknown; requestedResolverPolicy?: string | null };
  additionalRestriction?: IssueThreadInteractionResolverAudienceInput["additionalRestriction"];
};

/** This is an audience exception, never resource access, credential consent, or independent review authority. */
export async function resolveExecutiveInteractionAuthority(db: Db, input: ExecutiveInteractionInput, lock = false): Promise<ExecutiveInteractionAuthority | null> {
  const { interaction, actor } = input;
  if (actor.type === "system" || input.additionalRestriction || interaction.addresseeUserId) return null;
  if (!["ask_user_questions", "request_confirmation", "request_checkbox_confirmation"].includes(interaction.kind)) return null;
  const payload = interaction.payload;
  if (payload && typeof payload === "object" && ("toolAction" in payload || "secretProposal" in payload)) return null;
  if (actor.type === "agent" && (interaction.effectiveResolverPolicy !== "human_only" && interaction.effectiveResolverPolicy !== "board_only")) return null;
  // A company human-only cap can hide an originally requested not-creator
  // policy in the persisted enum. Delegation must retain that self-separation.
  if (actor.type === "agent" && interaction.requestedResolverPolicy === "not_creator"
    && (interaction.createdByAgentId === actor.agentId || (interaction.sourceRunId && interaction.sourceRunId === actor.runId))) return null;
  if (actor.type === "user" && interaction.effectiveResolverPolicy !== "not_creator" && !interaction.addresseeAgentId) return null;
  const issueQuery = db.select({ conversationAgentId: issues.conversationAgentId }).from(issues)
    .where(and(eq(issues.id, input.issueId), eq(issues.companyId, input.companyId)));
  const [issue] = await (lock ? issueQuery.for("share") : issueQuery);
  if (!issue || issue.conversationAgentId) return null;
  if (actor.type === "user") {
    const member = await membership(db, input.companyId, "user", actor.userId, lock);
    return member?.status === "active" && (member.role === "owner" || member.role === "admin") ? { kind: "organization_admin", userId: actor.userId } : null;
  }
  if (!actor.agentId || !actor.runId) return null;
  const grant = await getActiveExecutiveDelegation(db, input.companyId, lock);
  if (!grant || grant.agentId !== actor.agentId) return null;
  return { kind: "delegated_ceo", ...grant };
}

/** Fresh grant projection for authorized company context readers. */
export async function getActiveExecutiveDelegation(db: Db, companyId: string, lock = false) {
  const companyQuery = db.select({ governance: companies.interactionResolverGovernance }).from(companies).where(eq(companies.id, companyId));
  const [company] = await (lock ? companyQuery.for("share") : companyQuery);
  const grant = company?.governance?.executiveDelegation;
  if (!grant || typeof grant.agentId !== "string" || typeof grant.grantedByUserId !== "string" || !Number.isFinite(Date.parse(grant.grantedAt))) return null;
  const grantor = await membership(db, companyId, "user", grant.grantedByUserId, lock);
  if (grantor?.status !== "active" || (grantor.role !== "owner" && grantor.role !== "admin")) return null;
  const member = await membership(db, companyId, "agent", grant.agentId, lock);
  if (member?.status !== "active") return null;
  const agentQuery = db.select({ role: agents.role, status: agents.status }).from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.id, grant.agentId)));
  const [agent] = await (lock ? agentQuery.for("share") : agentQuery);
  if (!agent || agent.role !== "ceo" || !["active", "idle", "running", "error"].includes(agent.status)) return null;
  return grant;
}
