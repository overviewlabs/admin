import type { Db } from "@whoxos/db";
import { loadAgentOrganizationContext } from "./agent-organization-context.js";
import type { AuthorizationActor } from "./authorization.js";
import { DECISION_ENGINE_GUIDANCE } from "./decision-engine.js";

/** Input comments must come from buildWHOXOSWakePayload's scoped DB rows. */
export function loadRuntimeOrganizationContext(db: Db, input: {
  companyId: string;
  agentId: string;
  runId: string;
  responsibleUserId: string | null;
  keyScope?: AuthorizationActor["keyScope"];
  wakeComments: readonly Record<string, unknown>[];
  wakeAuthorWindowComplete: boolean;
}) {
  // Restricted harness credentials cannot read the organization directory.
  // Omit it rather than widening the actor or failing an otherwise valid run.
  if (input.keyScope && input.keyScope.kind !== "standard") return Promise.resolve(null);
  const comments = input.wakeComments.filter(comment => !comment.deletedAt);
  const authors = comments.map(comment => {
    const author = comment.author;
    if (!author || typeof author !== "object" || Array.isArray(author)) return null;
    const { type, id } = author as Record<string, unknown>;
    return type === "user" && typeof id === "string" && id.trim() ? id : null;
  });
  const messageAuthorUserIds = [...new Set(authors.filter((id): id is string => id !== null))];
  // A responsible execution identity may be an operator who queued someone
  // else's message. Never present that operator as the conversation speaker.
  const currentUserId = input.wakeAuthorWindowComplete && authors.length > 0 && authors.every(id => id !== null && id === authors[0])
    ? authors[0] : null;
  return loadAgentOrganizationContext(db, {
    companyId: input.companyId,
    agentId: input.agentId,
    actors: [{
      type: "agent", companyId: input.companyId, agentId: input.agentId,
      runId: input.runId, onBehalfOfUserId: input.responsibleUserId,
      ...(input.keyScope ? { keyScope: input.keyScope } : {}),
    }],
    currentUserId,
    responsibleUserId: input.responsibleUserId,
    messageAuthorUserIds,
  }).then(context => ({ ...context,
    hostAccess: {
      statusPath: `/api/companies/${input.companyId}/agents/${input.agentId}/production-root`,
      commandPath: `/api/companies/${input.companyId}/agents/${input.agentId}/production-root/commands`,
      guidance: "CEOs and top-level managers automatically receive production host root access and can hire agents and grant/revoke host access within their organization. Use your current run bearer credential: GET statusPath to check access, POST commandPath with {requestId: UUID, command: string, timeoutMs: 30000} to run a host command. The output is actual host-root execution. Keep the same requestId for a retry of the exact command; do not replay an unknown mutation. Leaders PATCH /api/companies/<companyId>/agents/<targetAgentId>/production-root with {enabled:true} or {enabled:false} to delegate or revoke. Other agents ask their CEO when they need a grant. Use this API for privileged host work; local shell commands retain the ordinary runtime user. After access or authorization is repaired, repeat the relevant capability check rather than relying on earlier blocked results.",
    },
    decisionEngine: { name: "Real-Time Decision Engine", agentOnly: true, guidance: DECISION_ENGINE_GUIDANCE } }));
}
