import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { agents, issues, issueThreadInteractions, type Db } from "@whoxos/db";
import type { IssueCommentMetadata } from "@whoxos/shared";
import { accessService } from "./access.js";
import type { AuthorizationActor } from "./authorization.js";

// Server-owned marker: the user message and its answer commit together. The
// durable conversation outbox must never enqueue this already answered turn.
export const QUICK_ANSWER_REASON = "conversation_direct_read_answer";
export const quickAnswerMetadata: IssueCommentMetadata = {
  version: 1,
  authorizationReason: QUICK_ANSWER_REASON,
  sections: [{ rows: [{ type: "text", label: "Source", text: "Current organization data" }] }],
};

export function quickAnswerIntent(body: string): "agent_count" | "agent_list" | "assignments" | null {
  // Full-string matches deliberately leave compound instructions, corrections,
  // named third parties, and execution requests to the agent. Never use an LLM
  // or substring match to silently drop part of a user's request.
  const text = body.trim().toLowerCase().replace(/[’]/g, "'").replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  if (/^(?:how many agents (?:are there|do we have|are in (?:this|our|the) (?:organization|company))|(?:what is|what's) (?:the |our )?(?:agent count|number of agents))(?: (?:right now|currently))?$/.test(text)) return "agent_count";
  if (/^(?:(?:list|show|show me) (?:all |the |our )?agents|who are (?:the |our )?agents|which agents do we have)$/.test(text)) return "agent_list";
  if (/^(?:what are you working on(?: (?:right now|currently))?|(?:what|which) tasks (?:are assigned to you|do you have)|(?:list|show|show me) your (?:tasks|assignments))$/.test(text)) return "assignments";
  return null;
}

/** Read-only answers under the same authorization rules as the normal APIs. */
export async function conversationQuickAnswer(
  db: Db,
  input: { body: string; companyId: string; issueId: string; agentId: string; actor: AuthorizationActor; attachmentIds?: string[] },
): Promise<string | null> {
  const intent = quickAnswerIntent(input.body);
  if (!intent || input.attachmentIds?.length) return null;
  const [pending] = await db.select({ id: issueThreadInteractions.id }).from(issueThreadInteractions).where(and(
    eq(issueThreadInteractions.companyId, input.companyId), eq(issueThreadInteractions.issueId, input.issueId),
    eq(issueThreadInteractions.status, "pending"),
  )).limit(1);
  if (pending) return null; // A reply may belong to an outstanding clarification.
  const access = accessService(db);
  if (intent === "agent_count" || intent === "agent_list") {
    const rows = await db.select({ id: agents.id, name: agents.name, status: agents.status }).from(agents)
      .where(and(eq(agents.companyId, input.companyId), ne(agents.status, "terminated")))
      .orderBy(asc(agents.name), asc(agents.id));
    const decisions = await Promise.all(rows.map((agent) => access.decide({
      actor: input.actor, action: "agent:read",
      resource: { type: "agent", companyId: input.companyId, agentId: agent.id },
    })));
    const visible = rows.filter((_, i) => decisions[i].allowed);
    const restricted = visible.length !== rows.length;
    const count = visible.length;
    const summary = restricted
      ? `You can access ${count} agent${count === 1 ? "" : "s"} in this organization.`
      : `There ${count === 1 ? "is" : "are"} ${count} agent${count === 1 ? "" : "s"} in this organization.`;
    if (count === 0) return summary;
    const shown = visible.slice(0, intent === "agent_count" ? 5 : 50);
    const details = shown.map((a) => `${plain(a.name)} — ${a.status.replaceAll("_", " ")}`).join("\n");
    return `${summary}\n\n${details}${shown.length < count ? `\n\nShowing ${shown.length} of ${count}.` : ""}`;
  }

  // Keep the response bounded; don't turn a large backlog into a long chat or
  // imply the limit is the complete assignment count.
  const rows = await db.select({
    id: issues.id, title: issues.title, identifier: issues.identifier, status: issues.status,
    projectId: issues.projectId, parentId: issues.parentId, assigneeAgentId: issues.assigneeAgentId,
    assigneeUserId: issues.assigneeUserId,
  }).from(issues).where(and(
    eq(issues.companyId, input.companyId), eq(issues.assigneeAgentId, input.agentId),
    isNull(issues.conversationAgentId), isNull(issues.hiddenAt),
    inArray(issues.status, ["backlog", "todo", "in_progress", "blocked", "in_review"]),
  )).orderBy(asc(issues.createdAt), asc(issues.id)).limit(101);
  // Fall back rather than reporting an incomplete or misleading work summary.
  if (rows.length > 100) return null;
  const decisions = await Promise.all(rows.map((row) => access.decide({
    actor: input.actor, action: "issue:read",
    resource: { type: "issue", companyId: input.companyId, issueId: row.id, projectId: row.projectId,
      parentIssueId: row.parentId, assigneeAgentId: row.assigneeAgentId, assigneeUserId: row.assigneeUserId, status: row.status },
    scope: { issueId: row.id, projectId: row.projectId, parentIssueId: row.parentId,
      assigneeAgentId: row.assigneeAgentId, assigneeUserId: row.assigneeUserId },
  })));
  const visible = rows.filter((_, i) => decisions[i].allowed);
  const qualifier = visible.length !== rows.length ? " that you can access" : "";
  if (!visible.length) return `I have no open assigned tasks${qualifier} right now.`;
  const running = visible.filter((row) => row.status === "in_progress").length;
  const labels: Record<string, string> = { backlog: "backlog", todo: "to do", in_progress: "in progress", blocked: "blocked", in_review: "in review" };
  const details = visible.slice(0, 20).map((row) => `${plain(row.identifier ?? "Task")}: ${plain(row.title)} — ${labels[row.status]}`).join("\n");
  return `I have ${visible.length} open assigned task${visible.length === 1 ? "" : "s"}${qualifier}; ${running} ${running === 1 ? "is" : "are"} marked in progress.\n\n${details}${visible.length > 20 ? `\n\nShowing 20 of ${visible.length}.` : ""}`;
}

function plain(value: string): string {
  return value.replace(/[\r\n]/g, " ").replace(/[\\`*_{}\[\]<>#|!]/g, "\\$&");
}
