export type VoiceProgressRun = { id: string; agent: string | null; status: string | null; progress: string | null };
export type VoiceProgressReply = { id: string; text: string };
export type VoiceProgressQuestion = Record<string, unknown> & { id: string };
export type VoiceProgressState = {
  status: string | null;
  conversationState: string | null;
  executionRunId: string | null;
  runs: VoiceProgressRun[];
};
export type VoiceProgressUpdate = VoiceProgressState & {
  stateChanged: boolean;
  replies: VoiceProgressReply[];
  questions: VoiceProgressQuestion[];
  pendingQuestionIds: string[];
};

const MAX_REMEMBERED_REPLIES = 256;
const VOLATILE_QUESTION_FIELDS = new Set(["createdAt", "updatedAt", "resolvedAt"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(Object.keys(object).sort().filter((key) => object[key] !== undefined)
    .map((key) => [key, canonical(object[key])]));
}

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

function stateOf(progress: Record<string, unknown>): VoiceProgressState {
  const runs = (Array.isArray(progress.runs) ? progress.runs : []).flatMap((value): VoiceProgressRun[] => {
    const run = record(value);
    const id = text(run?.id);
    return run && id ? [{ id, agent: text(run.agent), status: text(run.status), progress: text(run.progress) }] : [];
  });
  return { status: text(progress.status), conversationState: text(progress.conversationState),
    executionRunId: text(progress.executionRunId), runs: byId(runs) };
}

function repliesOf(progress: Record<string, unknown>): VoiceProgressReply[] {
  return (Array.isArray(progress.replies) ? progress.replies : []).flatMap((value): VoiceProgressReply[] => {
    const reply = record(value);
    const id = text(reply?.id);
    return reply && id && typeof reply.text === "string" ? [{ id, text: reply.text }] : [];
  });
}

function questionsOf(progress: Record<string, unknown>): VoiceProgressQuestion[] {
  return (Array.isArray(progress.questions) ? progress.questions : []).flatMap((value): VoiceProgressQuestion[] => {
    const question = record(value);
    const id = text(question?.id);
    if (!question || !id || (question.status !== undefined && question.status !== "pending")) return [];
    const stable = Object.fromEntries(Object.entries(question).filter(([key]) => !VOLATILE_QUESTION_FIELDS.has(key)));
    return [{ ...canonical(stable) as Record<string, unknown>, id }];
  });
}

/**
 * Track observations separately from transport delivery. The transport merges
 * returned deltas until it can send them, then clears that delivered queue.
 * Preserve snapshot only for an instruction refresh of this same chat session.
 */
export class VoiceProgressTracker {
  private state?: VoiceProgressState;
  private replySignatures = new Map<string, string>();
  private questionSignatures = new Map<string, string>();

  constructor(previousSnapshot?: string) {
    if (!previousSnapshot || previousSnapshot.length > 2_000_000) return;
    try {
      const previous = record(JSON.parse(previousSnapshot));
      if (previous?.version !== 1 || !record(previous.state)) return;
      this.state = stateOf(previous.state as Record<string, unknown>);
      for (const [key, target] of [["replies", this.replySignatures], ["questions", this.questionSignatures]] as const) {
        const entries = previous[key];
        if (!Array.isArray(entries)) continue;
        for (const pair of entries.slice(-MAX_REMEMBERED_REPLIES)) {
          if (Array.isArray(pair) && pair.length === 2 && text(pair[0]) && typeof pair[1] === "string") target.set(pair[0], pair[1]);
        }
      }
    } catch { /* A stale or invalid snapshot starts a fresh historical baseline. */ }
  }

  get snapshot(): string {
    return JSON.stringify({ version: 1, state: this.state ?? null,
      replies: [...this.replySignatures.entries()].sort(([a], [b]) => a.localeCompare(b)),
      questions: [...this.questionSignatures.entries()].sort(([a], [b]) => a.localeCompare(b)) });
  }

  observe(value: unknown): VoiceProgressUpdate | undefined {
    const progress = record(value);
    if (!progress) return;
    const state = stateOf(progress);
    const initial = this.state === undefined;
    const stateChanged = !initial && JSON.stringify(this.state) !== JSON.stringify(state);
    const replies: VoiceProgressReply[] = [];
    for (const reply of repliesOf(progress)) {
      if (!initial && this.replySignatures.get(reply.id) !== reply.text) replies.push(reply);
      this.replySignatures.set(reply.id, reply.text);
    }
    while (this.replySignatures.size > MAX_REMEMBERED_REPLIES) this.replySignatures.delete(this.replySignatures.keys().next().value!);
    const questions: VoiceProgressQuestion[] = [];
    const nextQuestions = new Map<string, string>();
    for (const question of questionsOf(progress)) {
      const signature = JSON.stringify(question);
      if (this.questionSignatures.get(question.id) !== signature) questions.push(question);
      nextQuestions.set(question.id, signature);
    }
    const pendingQuestionIds = [...nextQuestions.keys()].sort();
    const questionsChanged = JSON.stringify([...this.questionSignatures.keys()].sort()) !== JSON.stringify(pendingQuestionIds);
    this.state = state;
    this.questionSignatures = nextQuestions;
    if (!stateChanged && !replies.length && !questions.length && !questionsChanged) return;
    return { ...state, stateChanged, replies, questions, pendingQuestionIds };
  }
}

function mergeItems(previous: unknown, next: unknown): unknown[] {
  const merged = new Map<string, unknown>();
  for (const item of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])]) {
    const id = text(record(item)?.id);
    // Production deltas always have IDs. Preserve generic test/legacy payloads
    // without allowing them to replace distinct identified messages.
    const key = id ? `id:${id}` : `value:${JSON.stringify(canonical(item))}`;
    merged.set(key, item);
  }
  return [...merged.values()];
}

/** Keep the newest state, while retaining reply/question deltas not yet sent. */
export function mergeQueuedVoiceProgress(previous: unknown, next: unknown): unknown {
  const newer = record(next);
  if (!newer) return next;
  const older = record(previous);
  if (!older) return structuredClone(newer);
  const result: Record<string, unknown> = { ...older, ...newer };
  for (const key of ["replies", "questions"] as const) {
    if (Array.isArray(older[key]) || Array.isArray(newer[key])) result[key] = mergeItems(older[key], newer[key]);
  }
  if (Array.isArray(newer.pendingQuestionIds) && Array.isArray(result.questions)) {
    const pending = new Set(newer.pendingQuestionIds.filter((id): id is string => typeof id === "string"));
    result.questions = result.questions.filter((question) => pending.has(text(record(question)?.id) ?? ""));
  }
  if (typeof older.stateChanged === "boolean" || typeof newer.stateChanged === "boolean") {
    result.stateChanged = older.stateChanged === true || newer.stateChanged === true;
  }
  // A fresh successful observation supersedes a queued transient lookup error.
  if (Array.isArray(newer.pendingQuestionIds) && !Object.hasOwn(newer, "error")) delete result.error;
  return structuredClone(result);
}

/** A resolved-question synchronization can clear the queue without speaking. */
export function shouldAnnounceVoiceProgress(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const progress = record(value);
  if (!progress) return true;
  if (progress.error || progress.progressAvailable === true) return true;
  if (Array.isArray(progress.pendingQuestionIds) && typeof progress.stateChanged === "boolean"
    && Array.isArray(progress.replies) && Array.isArray(progress.questions)) {
    return progress.stateChanged || progress.replies.length > 0 || progress.questions.length > 0;
  }
  return true;
}
