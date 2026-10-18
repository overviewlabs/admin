import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { agents, agentWakeupRequests, companies, companyMemberships, heartbeatRuns, issueThreadInteractions, issues, type Db } from "@whoxos/db";
import { logger } from "../middleware/logger.js";
import { accessService } from "./access.js";
import { getActiveExecutiveDelegation, resolveExecutiveInteractionAuthority } from "./executive-delegation.js";
import { evaluateIssueThreadInteractionResolverAudience } from "./issue-thread-interaction-resolution.js";
import { isIssueReviewVerdictInteraction } from "./issue-review-policy.js";
import { isGeminiLiveOnly } from "./voice-direct-context.js";
import type { heartbeatService } from "./heartbeat.js";

// Creation commits the durable pending row before notifying. Notifications are
// only a latency optimization: startup/periodic reconciliation recovers a crash.
const listeners = new WeakMap<Db, () => void>();
export function registerDelegatedInteractionWakeup(db: Db, listener: () => void) {
  listeners.set(db, listener);
  return () => { if (listeners.get(db) === listener) listeners.delete(db); };
}
export function notifyDelegatedInteractionCreated(db: Db) {
  try { listeners.get(db)?.(); } catch { /* The periodic sweep owns recovery. */ }
}

export function delegatedInteractionWakeupService(
  db: Db,
  options: Pick<ReturnType<typeof heartbeatService>, "wakeup">,
) {
  let cursor: string | undefined;
  let running: Promise<{ checked: number; woken: number }> | undefined;

  async function route(interactionId: string) {
    // Serialize concurrent process/sweep delivery without locking issue/agent
    // rows needed by heartbeat admission. Its durable receipt survives restart.
    return db.transaction(async tx => {
      const locked = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${`delegated-interaction:${interactionId}`}, 0)) as acquired`);
      if (!locked[0]?.acquired) return false;
      const [row] = await tx.select({ interaction: issueThreadInteractions, issue: issues })
        .from(issueThreadInteractions).innerJoin(issues, and(eq(issues.id, issueThreadInteractions.issueId), eq(issues.companyId, issueThreadInteractions.companyId)))
        .where(eq(issueThreadInteractions.id, interactionId));
      if (!row) return false;
      const { interaction, issue } = row;
      if (interaction.status !== "pending" || ["done", "cancelled"].includes(issue.status) || issue.conversationAgentId || interaction.addresseeUserId) return false;
      if (isGeminiLiveOnly(issue.assigneeAdapterOverrides)) return false;
      if (interaction.sourceRunId) {
        const [origin] = await tx.select({ mode: heartbeatRuns.runtimeMode }).from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.id, interaction.sourceRunId), eq(heartbeatRuns.companyId, issue.companyId)));
        if (origin?.mode === "voice_direct") return false;
      }
      const payload = interaction.payload;
      if (payload && typeof payload === "object" && ("toolAction" in payload || "secretProposal" in payload)) return false;
      const grant = await getActiveExecutiveDelegation(tx as unknown as Db, issue.companyId);
      const agentId = interaction.addresseeAgentId ?? grant?.agentId;
      if (!agentId) return false;
      const [recipient] = await tx.select({ status: agents.status }).from(agents)
        .innerJoin(companyMemberships, and(eq(companyMemberships.companyId, agents.companyId),
          eq(companyMemberships.principalType, "agent"), eq(companyMemberships.principalId, agentId),
          eq(companyMemberships.status, "active")))
        .where(and(eq(agents.companyId, issue.companyId), eq(agents.id, agentId)));
      if (!recipient || !["active", "idle", "running", "error"].includes(recipient.status)) return false;
      // Automatic routing never sends an agent its own newly created question.
      // Manual resolution remains governed by the existing audience rules.
      if (interaction.createdByAgentId === agentId) return false;
      if (issue.status === "in_review" && ["request_confirmation", "request_checkbox_confirmation"].includes(interaction.kind)
        && await isIssueReviewVerdictInteraction(tx as unknown as Db, { issue, interaction })) return false;
      const actor = { type: "agent" as const, companyId: issue.companyId, agentId, runId: "delegated-interaction-attention" };
      const authority = await resolveExecutiveInteractionAuthority(tx as unknown as Db, { companyId: issue.companyId, issueId: issue.id, actor, interaction });
      // Ordinary anyone/not_creator cards already permit agent review and do
      // not need the human-only delegation exception. Unaddressed cards still
      // need a live CEO grant; explicit peers must satisfy the saved audience.
      if (!evaluateIssueThreadInteractionResolverAudience({ actor, interaction, executiveAuthority: authority }).allowed) return false;
      const scope = { issueId: issue.id, projectId: issue.projectId, parentIssueId: issue.parentId, assigneeAgentId: issue.assigneeAgentId, assigneeUserId: issue.assigneeUserId };
      const access = accessService(tx as unknown as Db);
      for (const action of ["issue:read", "issue:mutate"] as const) {
        if (!(await access.decide({ actor: { type: "agent", companyId: issue.companyId, agentId }, action, scope,
          resource: { type: "issue", companyId: issue.companyId, ...scope, status: issue.status } })).allowed) return false;
      }
      const idempotencyKey = interaction.addresseeAgentId
        ? `interaction-pending:${interaction.id}`
        : `interaction:${interaction.id}:delegated:${agentId}`;
      const [receipt] = await tx.select({ id: agentWakeupRequests.id }).from(agentWakeupRequests)
        .where(and(eq(agentWakeupRequests.companyId, issue.companyId), eq(agentWakeupRequests.idempotencyKey, idempotencyKey))).limit(1);
      // Even a skipped/failed admission is not permission for an automatic retry
      // loop. The existing explicit recovery paths own those decisions.
      if (receipt) return false;
      let responsibleUserId = issue.responsibleUserId;
      let parentId = issue.parentId;
      const parents = new Set([issue.id]);
      while (!responsibleUserId && parentId) {
        if (parents.has(parentId) || parents.size >= 100) return false;
        parents.add(parentId);
        const [parent] = await tx.select({ responsibleUserId: issues.responsibleUserId, parentId: issues.parentId })
          .from(issues).where(and(eq(issues.id, parentId), eq(issues.companyId, issue.companyId)));
        if (!parent) return false;
        responsibleUserId = parent.responsibleUserId;
        parentId = parent.parentId;
      }
      await options.wakeup(agentId, {
        source: "automation", triggerDetail: "system", reason: "interaction_pending", idempotencyKey,
        requestedByActorType: "system", requestedByActorId: interaction.addresseeAgentId ? "system:interaction-routing" : "system:executive-delegation",
        allowRunCoalescing: false,
        payload: { decisionIssueId: issue.id, interactionId: interaction.id, interactionKind: interaction.kind, mutation: "interaction", delegatedDecision: !interaction.addresseeAgentId },
        contextSnapshot: { decisionIssueId: issue.id, interactionId: interaction.id, interactionKind: interaction.kind, sourceRunId: interaction.sourceRunId,
          responsibleUserId, projectId: issue.projectId,
          wakeReason: "interaction_pending", source: "issue.interaction.delegated", delegatedDecision: !interaction.addresseeAgentId,
          whoxosAgentMessage: { source: interaction.addresseeAgentId ? "team_interaction" : "executive_delegation", text: [
            interaction.addresseeAgentId ? "A teammate has addressed a task question or decision to you." : "An ordinary task decision is awaiting your delegated CEO review.",
            `Organization: ${issue.companyId}. Task: ${issue.id}. Interaction: ${interaction.id}.`,
            `Read GET /api/issues/${issue.id} and GET /api/issues/${issue.id}/interactions; inspect this exact pending interaction.`,
            "Gather the needed information through your authorized tools, then resolve this card if current authority and actual evidence permit. Fetch organization context if authority is unclear.",
            "This is a decision-only wake: do not check out, reassign, execute, or bypass dependencies on the underlying task. Do not impersonate the owner or approve credentials, personal requests, governed actions, or independent review gates.",
            "If the card is no longer pending or your access/delegation was revoked, take no action. Do not create a duplicate question or wake yourself again.",
          ].join("\n") },
        },
      });
      return true;
    });
  }

  function sweepPending() {
    if (running) return running;
    running = (async () => {
      // Keyset pagination prevents old ineligible questions starving newer ones.
      const rows = await db.select({ id: issueThreadInteractions.id }).from(issueThreadInteractions)
        .innerJoin(companies, eq(companies.id, issueThreadInteractions.companyId))
        .where(and(eq(issueThreadInteractions.status, "pending"), isNull(issueThreadInteractions.addresseeUserId),
          inArray(issueThreadInteractions.kind, ["ask_user_questions", "request_confirmation", "request_checkbox_confirmation"]),
          inArray(issueThreadInteractions.effectiveResolverPolicy, ["anyone", "not_creator", "human_only"]),
          or(isNotNull(issueThreadInteractions.addresseeAgentId), sql`${companies.interactionResolverGovernance}->'executiveDelegation' IS NOT NULL`),
          cursor ? gt(issueThreadInteractions.id, cursor) : undefined))
        .orderBy(asc(issueThreadInteractions.id)).limit(100);
      cursor = rows.length === 100 ? rows[rows.length - 1]!.id : undefined;
      let woken = 0;
      for (const row of rows) {
        try { if (await route(row.id)) woken += 1; }
        catch { logger.warn({ interactionId: row.id }, "delegated interaction wake admission failed; reconciliation will check again"); }
      }
      return { checked: rows.length, woken };
    })().finally(() => { running = undefined; });
    return running;
  }
  return { sweepPending };
}
