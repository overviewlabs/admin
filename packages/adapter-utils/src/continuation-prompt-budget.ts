import type { ExecutionContinuationEnvelope } from "@whoxos/shared";
// Leave headroom for instructions, task context, tools and the RPC envelope.
const MAX_HISTORY_CHARS = 262_144;
type Snapshot = Omit<ExecutionContinuationEnvelope, "resumeDelta">;
const encodedLength = (value: unknown) => JSON.stringify(value)
  .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").length;
/** Model-view selection only. Never alters admission, records or stored history. */
export function boundExecutionContinuationForPrompt(input: Snapshot, limit = MAX_HISTORY_CHARS) {
  if (encodedLength(input) <= limit) return input;
  const messages = input.messages;
  const required = new Set(input.originCommentIds);
  const latestHuman = messages.findLast(m => m.authorType === "user" && !m.createdByRunId && !m.deleted && m.body.trim());
  if (latestHuman) required.add(latestHuman.id);
  const selected = new Set(messages.filter(m => required.has(m.id)).map(m => m.id));
  const view = () => ({
    ...input,
    messages: messages.filter(m => selected.has(m.id)),
    coverage: { ...input.coverage, kind: "task_history_excerpt" as const },
    omittedMessageIds: messages.filter(m => !selected.has(m.id)).map(m => m.id),
    historyEndpoint: `/api/issues/${encodeURIComponent(input.issueId)}/comments`,
  });
  // Authority and durable effects cannot be discarded to satisfy a size limit.
  if (encodedLength(view()) > limit) throw new Error("continuation_required_context_exceeds_prompt_budget");
  for (const message of [...messages].reverse()) {
    if (selected.has(message.id)) continue;
    selected.add(message.id);
    if (encodedLength(view()) > limit) selected.delete(message.id);
  }
  return view();
}
