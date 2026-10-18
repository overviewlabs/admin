import { describe, expect, it } from "vitest";
import { mergeQueuedVoiceProgress, shouldAnnounceVoiceProgress, VoiceProgressTracker, type VoiceProgressUpdate } from "./voice-progress";

function snapshot(overrides: Record<string, unknown> = {}) {
  return { status: "in_progress", conversationState: "active", executionRunId: "run-1",
    runs: [{ id: "run-1", agent: "Researcher", status: "running", progress: "Checking the sources" }],
    replies: [{ id: "old", text: "A previous answer", updatedAt: "2026-09-27T12:00:00Z" }],
    questions: [], ...overrides };
}

function question(id = "question-1", prompt = "Which region?") {
  return { id, kind: "ask_user_questions", status: "pending", title: "Choose a region", payload: { prompt },
    createdAt: "2026-09-27T12:00:00Z", updatedAt: "2026-09-27T12:00:00Z" };
}

describe("VoiceProgressTracker", () => {
  it("baselines historical replies and running state without unsolicited narration", () => {
    const tracker = new VoiceProgressTracker();
    expect(tracker.observe(snapshot())).toBeUndefined();
    expect(tracker.observe(snapshot())).toBeUndefined();
  });

  it("emits initial pending questions once, without repeating old replies", () => {
    const tracker = new VoiceProgressTracker();
    const update = tracker.observe(snapshot({ questions: [question()] }));
    expect(update).toMatchObject({ stateChanged: false, replies: [], questions: [{ id: "question-1" }], pendingQuestionIds: ["question-1"] });
    expect(update?.questions[0]).not.toHaveProperty("updatedAt");
    expect(tracker.observe(snapshot({ questions: [question()] }))).toBeUndefined();
  });

  it.each([
    { status: "blocked" },
    { conversationState: "waiting" },
    { executionRunId: "run-2" },
    { runs: [{ id: "run-1", agent: "Researcher", status: "running", progress: "Waiting for approval" }] },
    { runs: [{ id: "run-1", agent: "Researcher", status: "queued", progress: "Checking the sources" }] },
    { runs: [] },
  ])("reports material runtime changes %j without replaying previous answers", (change) => {
    const tracker = new VoiceProgressTracker();
    tracker.observe(snapshot());
    const update = tracker.observe(snapshot(change));
    expect(update).toMatchObject({ ...change, stateChanged: true, replies: [], questions: [] });
    expect(tracker.observe(snapshot(change))).toBeUndefined();
  });

  it("ignores run order and volatile timestamps while preserving a stable snapshot", () => {
    const tracker = new VoiceProgressTracker();
    const runs = [
      { id: "run-2", agent: "Builder", status: "queued", progress: "Waiting for a worker", lastEventAt: "old" },
      { id: "run-1", agent: "Researcher", status: "running", progress: "Checking the sources", updatedAt: "old" },
    ];
    tracker.observe(snapshot({ runs, questions: [question()] }));
    const previous = tracker.snapshot;
    expect(tracker.observe(snapshot({ runs: runs.toReversed().map((run) => ({ ...run, lastEventAt: "new", updatedAt: "new" })),
      replies: [{ id: "old", text: "A previous answer", updatedAt: "new" }],
      questions: [{ ...question(), updatedAt: "new", createdAt: "new" }] }))).toBeUndefined();
    expect(tracker.snapshot).toBe(previous);
  });

  it("emits only new or genuinely edited replies and questions", () => {
    const tracker = new VoiceProgressTracker();
    tracker.observe(snapshot({ questions: [question()] }));
    const update = tracker.observe(snapshot({
      replies: [{ id: "new", text: "Verified the result" }, { id: "old", text: "A previous answer" }],
      questions: [question("question-1", "Which city?"), question("question-2", "Which year?")],
    }));
    expect(update?.replies).toEqual([{ id: "new", text: "Verified the result" }]);
    expect(update?.questions.map(({ id }) => id)).toEqual(["question-1", "question-2"]);
    expect(tracker.observe(snapshot({ replies: [{ id: "old", text: "Corrected prior answer" }], questions: [] }))?.replies)
      .toEqual([{ id: "old", text: "Corrected prior answer" }]);
  });

  it("does not repeat previously observed replies when they leave and reenter the latest page", () => {
    const tracker = new VoiceProgressTracker();
    tracker.observe(snapshot());
    tracker.observe(snapshot({ replies: [{ id: "new", text: "New answer" }] }));
    expect(tracker.observe(snapshot())).toBeUndefined();
  });

  it("preserves baselines and already observed questions through instruction refresh", () => {
    const original = new VoiceProgressTracker();
    original.observe(snapshot({ questions: [question()] }));
    const refreshed = new VoiceProgressTracker(original.snapshot);
    expect(refreshed.observe(snapshot({ questions: [question()] }))).toBeUndefined();
    const update = refreshed.observe(snapshot({ conversationState: "waiting", questions: [question()] }));
    expect(update).toMatchObject({ stateChanged: true, conversationState: "waiting", replies: [], questions: [] });
  });

  it("tracks removal and reopening of a pending question", () => {
    const tracker = new VoiceProgressTracker();
    tracker.observe(snapshot({ questions: [question()] }));
    const removal = tracker.observe(snapshot({ questions: [{ ...question(), status: "answered" }] }));
    expect(removal).toMatchObject({ pendingQuestionIds: [], questions: [], replies: [], stateChanged: false });
    expect(tracker.observe(snapshot({ questions: [question()] }))?.questions).toHaveLength(1);
  });

  it("ignores key ordering but retains actual date answers inside question content", () => {
    const tracker = new VoiceProgressTracker();
    tracker.observe(snapshot({ questions: [{ ...question(), payload: { prompt: "Choose date", updatedAt: "Monday" } }] }));
    expect(tracker.observe(snapshot({ questions: [{ ...question(), payload: { updatedAt: "Monday", prompt: "Choose date" } }] }))).toBeUndefined();
    expect(tracker.observe(snapshot({ questions: [{ ...question(), payload: { updatedAt: "Tuesday", prompt: "Choose date" } }] }))?.questions).toHaveLength(1);
  });

  it("treats corrupt refresh data as a fresh historical baseline", () => {
    for (const invalid of ["bad JSON", "null", '{"version":42}', '{"version":1,"state":null}']) {
      expect(new VoiceProgressTracker(invalid).observe(snapshot())).toBeUndefined();
    }
  });
});

describe("mergeQueuedVoiceProgress", () => {
  function updates() {
    const tracker = new VoiceProgressTracker();
    tracker.observe(snapshot());
    const first = tracker.observe(snapshot({ replies: [{ id: "new", text: "Verified result" }], questions: [question()] }))!;
    const second = tracker.observe(snapshot({ conversationState: "waiting", replies: [{ id: "new", text: "Verified result" }], questions: [question()] }))!;
    return { tracker, first, second };
  }

  it("retains unseen replies/questions when a newer state-only update arrives while speaking", () => {
    const { first, second } = updates();
    const merged = mergeQueuedVoiceProgress(first, second) as VoiceProgressUpdate;
    expect(merged.conversationState).toBe("waiting");
    expect(merged.stateChanged).toBe(true);
    expect(merged.replies).toEqual([{ id: "new", text: "Verified result" }]);
    expect(merged.questions.map(({ id }) => id)).toEqual(["question-1"]);
    expect(first.conversationState).toBe("active");
    merged.replies[0]!.text = "Mutated";
    expect(first.replies[0]!.text).toBe("Verified result");
  });

  it("replaces edited queued messages by ID and removes questions already resolved", () => {
    const { tracker, first } = updates();
    const latest = tracker.observe(snapshot({ replies: [{ id: "new", text: "Corrected result" }], questions: [] }))!;
    const merged = mergeQueuedVoiceProgress(first, latest) as VoiceProgressUpdate;
    expect(merged.replies).toEqual([{ id: "new", text: "Corrected result" }]);
    expect(merged.questions).toEqual([]);
    expect(merged.pendingQuestionIds).toEqual([]);
  });

  it("keeps queued replies when polling fails and clears a stale error when fresh state arrives", () => {
    const { first, second } = updates();
    const failed = mergeQueuedVoiceProgress(first, { error: "Cannot fetch progress" }) as Record<string, unknown>;
    expect(failed.replies).toEqual(first.replies);
    expect(failed.questions).toEqual(first.questions);
    expect(failed.error).toBe("Cannot fetch progress");
    const recovered = mergeQueuedVoiceProgress(failed, second) as Record<string, unknown>;
    expect(recovered.replies).toEqual(first.replies);
    expect(recovered.error).toBeUndefined();
  });

  it("preserves generic transport payload compatibility and takes the newest state", () => {
    expect(mergeQueuedVoiceProgress({ result: "previous" }, { result: "latest" })).toEqual({ result: "latest" });
    expect(mergeQueuedVoiceProgress(undefined, { replies: ["new result"] })).toEqual({ replies: ["new result"] });
    expect(mergeQueuedVoiceProgress({ status: "running" }, null)).toBeNull();
  });

  it("silently synchronizes resolved questions but announces errors, recovery and legacy updates", () => {
    const sync = { stateChanged: false, replies: [], questions: [], pendingQuestionIds: [] };
    expect(shouldAnnounceVoiceProgress(sync)).toBe(false);
    expect(shouldAnnounceVoiceProgress({ ...sync, error: "Could not fetch progress" })).toBe(true);
    expect(shouldAnnounceVoiceProgress({ ...sync, error: null, progressAvailable: true })).toBe(true);
    expect(shouldAnnounceVoiceProgress({ result: "latest" })).toBe(true);
    expect(shouldAnnounceVoiceProgress({ error: "Offline" })).toBe(true);
    expect(shouldAnnounceVoiceProgress(undefined)).toBe(false);
  });

  it("still announces queued results or runtime changes after a question-only synchronization", () => {
    const sync = { stateChanged: false, replies: [], questions: [], pendingQuestionIds: [] };
    const withReply = mergeQueuedVoiceProgress({ ...sync, replies: [{ id: "reply", text: "Verified result" }] }, sync);
    const withState = mergeQueuedVoiceProgress({ ...sync, stateChanged: true, status: "blocked" }, sync);
    const onlyQuestion = mergeQueuedVoiceProgress({ ...sync, questions: [question()], pendingQuestionIds: ["question-1"] }, sync);
    expect(shouldAnnounceVoiceProgress(withReply)).toBe(true);
    expect(shouldAnnounceVoiceProgress(withState)).toBe(true);
    expect(shouldAnnounceVoiceProgress(onlyQuestion)).toBe(false);
  });
});
