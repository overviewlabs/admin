import { VoiceConference, type ConferenceMember } from "@/lib/voice-conference";
import { VoiceCallTones } from "@/lib/voice-call-tones";
import { resumeVoiceAudio, voiceStartupStep } from "@/lib/voice-startup";
import { isVoiceSessionActive, setVoiceSessionActive } from "@/lib/active-voice-session";
import { configureVoiceMicrophone, voiceMicrophoneFailure } from "@/lib/voice-microphone";
import { isNonSpeechVoiceTranscript } from "@whoxos/shared/voice-transcript";
import { useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { IssueComment } from "@whoxos/shared";
import { upsertIssueCommentInPages } from "@/lib/optimistic-issue-comments";
import { readVoiceToolCallIssue, readVoiceCodeExecutionOutcome, type VoiceSession } from "@whoxos/shared/agent-voice";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/api/client";
import { agentChatsApi } from "@/api/agentChats";
import { queryKeys } from "@/lib/queryKeys";
import { createVoiceAgentTools } from "@/lib/agent-voice-agent-tools";
import { AgentVoiceLive, type VoicePhase, type VoiceTranscript, type VoiceStartupStage } from "@/lib/agent-voice-live";
import { VoicePlayback } from "@/lib/voice-playback";
import { assertVoiceToolActive } from "@/lib/voice-tool-call";
import { warmVoiceSpeechDetector } from "@/lib/voice-speech-detector";
import { mergeVoiceWebSources, type VoiceGrounding } from "@/lib/voice-grounding";
import { VoiceProgressTracker } from "@/lib/voice-progress";

const VOICE_STARTUP_LABELS: Record<VoiceStartupStage, string> = {
  loading_capture: "Preparing microphone audio",
  loading_speech: "Preparing speech detection",
  starting_playback: "Enabling speaker playback",
  playback_fallback: "Speaker playback ready",
  connecting_provider: "Opening Gemini connection",
  starting_microphone: "Starting microphone stream",
  listening: "Listening",
};
const VOICE_STARTUP_FAILURES: Record<VoiceStartupStage, string> = {
  loading_capture: "capture_load_failed", loading_speech: "speech_load_failed",
  starting_playback: "playback_failed", playback_fallback: "playback_failed", connecting_provider: "provider_failed",
  starting_microphone: "microphone_failed", listening: "unknown",
};

function voiceAccessFailure(cause: unknown, source: "session" | "operation" = "session") {
  if (!cause || typeof cause !== "object") return null;
  const body = "body" in cause ? cause.body : null;
  const code = body && typeof body === "object" && "code" in body ? body.code : undefined;
  const connectionRequired = code === "gemini_connection_required";
  const sessionUnavailable = ["voice_session_unavailable", "voice_session_changed", "voice_agent_unavailable", "voice_assignment_changed"].includes(String(code));
  const unauthorized = "status" in cause && (cause.status === 401 || (source === "session" && cause.status === 403));
  return connectionRequired || sessionUnavailable || unauthorized
    ? { connectionRequired, message: cause instanceof Error ? cause.message : "Voice access is no longer available." }
    : null;
}

function voiceToolActivityLabel(name: string, args: Record<string, unknown>) {
  const action = name === "organization_api" ? args.action : name;
  switch (action) {
    case "search_web": return "Searching the web";
    case "read_web_page": return "Reading a source";
    case "create_task": return "Creating a task";
    case "update_task": case "adopt_task": return "Updating a task";
    case "create_project": return "Creating a project";
    case "update_project": return "Updating a project";
    case "add_comment": return "Adding a comment";
    case "put_document": return "Saving a document";
    case "call_connected_tool": return "Contacting a connected service";
    case "voice_workspace": return "Working in the workspace";
    case "get_agent_progress": return "Checking agent progress";
    case "stop_agent_work": return "Stopping agent work";
    case "capabilities": case "overview": case "get_organization_context":
    case "list_agents": case "get_agent": case "list_tasks": case "get_task":
    case "list_comments": case "list_documents": case "get_document":
    case "list_projects": case "get_project": case "list_goals": case "get_goal":
    case "list_skills": case "list_connected_tools": case "list_secret_proposals":
    case "get_organization_agents": case "get_agent_context": return "Checking organization data";
    default: return "Processing a request";
  }
}

/** A denied organization operation is a tool result, not a revoked voice session. */
export async function runVoiceToolWithSessionCheck<T>(
  verifySession: () => Promise<unknown>,
  execute: () => Promise<T>,
  onSessionFailure: (cause: unknown) => unknown,
  signal?: AbortSignal,
): Promise<T> {
  assertVoiceToolActive(signal);
  try { await verifySession(); }
  catch (cause) { assertVoiceToolActive(signal); onSessionFailure(cause); throw cause; }
  assertVoiceToolActive(signal);
  try { return await execute(); }
  catch (cause) {
    assertVoiceToolActive(signal);
    if (voiceAccessFailure(cause, "operation")) onSessionFailure(cause);
    throw cause;
  }
}

export type VoiceAgent = { id: string; companyId: string; name?: string; companyName?: string; companyPrefix?: string };

/** One session owned by the app, never by the currently displayed page. */
export function useVoiceSession() {
  const client = useQueryClient();
  const conference = useRef<VoiceConference | null>(null);
  const tones = useRef<VoiceCallTones | null>(null);
  const [participants, setParticipants] = useState<ConferenceMember[]>([]);
  const [speakerId, setSpeakerId] = useState("");
  const [conferenceOpen, setConferenceOpen] = useState(false);
  const { theme } = useTheme();
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const agentRef = useRef<VoiceAgent | null>(null);
  const [active, setActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [microphones, setMicrophones] = useState<Array<{deviceId: string; label: string}>>([]);
  const [microphoneId, setMicrophoneId] = useState(() => { try { return localStorage.getItem("voice-microphone") ?? ""; } catch { return ""; } });
  const microphoneIdRef = useRef(microphoneId);
  async function changeMicrophone(id: string) {
    microphoneIdRef.current = id; setMicrophoneId(id);
    try { localStorage.setItem("voice-microphone", id); } catch {}
    const current = agentRef.current;
    if (activeRef.current && current) { release(true, true); await start(current); }
  }
  const [connectionStep, setConnectionStep] = useState("Connecting");
  const [phase, setPhase] = useState<VoicePhase>("connecting");
  const [error, setError] = useState("");
  const [connectionRequired, setConnectionRequired] = useState(false);
  const [grounding, setGrounding] = useState<VoiceGrounding | null>(null);
  const [searchUnavailable, setSearchUnavailable] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const resources = useRef<{ live?: AgentVoiceLive; playback?: VoicePlayback; stream?: MediaStream; context?: AudioContext; poll?: ReturnType<typeof setTimeout> }>({});
  const generation = useRef(0);
  const ownerGeneration = useRef(0);
  const activeRef = useRef(false);
  const flushRef = useRef<() => Promise<void> | void>(() => {});
  const discardRef = useRef<() => void>(() => {});
  const transcriptDrains = useRef(new Set<Promise<void>>());
  function release(saveTranscript = true, keepLease = false) {
    const endingConference = conference.current;
    const conferenceDrain = endingConference?.stop(saveTranscript); conference.current = null;
    setConferenceOpen(false); tones.current?.close();
    setGrounding(null);
    setSearchUnavailable("");
    setActivity(null);
    activeRef.current = false; const stoppedGeneration = ++generation.current; clearTimeout(resources.current.poll);
    const flushed = saveTranscript ? flushRef.current() : discardRef.current();
    if (flushed || conferenceDrain) {
      const drain = Promise.all([flushed, conferenceDrain]).catch(() => {}).then(() => endingConference?.finish()).catch(() => {});
      transcriptDrains.current.add(drain);
      void drain.then(() => transcriptDrains.current.delete(drain));
    }
    // Defer background app updates until the last transcript has been saved.
    // A replacement session or instruction refresh keeps the same lease.
    if (!keepLease) void Promise.all([...transcriptDrains.current]).then(() => {
      if (generation.current === stoppedGeneration && !activeRef.current) setVoiceSessionActive(false);
    });
    flushRef.current = () => {}; discardRef.current = () => {};
    const current = resources.current; resources.current = {};
    if (current.live) current.live.stop();
    else {
      current.playback?.stop();
      current.stream?.getTracks().forEach(track => track.stop());
      if (current.context && current.context.state !== "closed") void current.context.close().catch(() => {});
    }
  }
  function stop(reason?: unknown) { tones.current?.play(reason === "failure" ? "failure" : "end"); release(); setActive(false); setStream(null); }
  function dismissError() { setError(""); setConnectionRequired(false); }
  function reset() { ownerGeneration.current++; release(false); setActive(false); setStream(null); setAgent(null); agentRef.current = null; dismissError(); }
  // The provider is above all routes. Its unmount means the app/auth session ended.
  useEffect(() => () => { ownerGeneration.current++; release(false); tones.current?.close(); }, []);
  async function start(requestedAgent: VoiceAgent, previousProgress?: string) {
    if (!activeRef.current && isVoiceSessionActive()) {
      agentRef.current = { ...requestedAgent }; setAgent(agentRef.current);
      setError("End the current voice call before starting another voice conversation."); return;
    }
    tones.current ??= new VoiceCallTones(); tones.current.unlock();
    const scope = { ...requestedAgent };
    if (activeRef.current) {
      if (agentRef.current?.id === scope.id && agentRef.current?.companyId === scope.companyId) return;
      release(true, true);
    }
    activeRef.current = true; setVoiceSessionActive(true);
    agentRef.current = { ...scope }; setAgent(agentRef.current);
    const attempt = ++generation.current;
    const owner = ownerGeneration.current;
    setGrounding(null);
    setSearchUnavailable("");
    setActivity(null);
    setActive(true); setPhase("connecting"); setConnectionStep("Enabling microphone"); setError(""); setConnectionRequired(false);
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Map<string, VoiceTranscript>();
    let writes = Promise.resolve();
    let latestUser: VoiceTranscript | undefined;
    let webTurnSequence = 0;
    const pendingActivities = new Map<string, string>();
    const publishActivity = () => {
      if (attempt === generation.current && owner === ownerGeneration.current) {
        setActivity([...pendingActivities.values()].at(-1) ?? null);
      }
    };
    const receipts = new Map<string, string>();
    let persistenceError: unknown;
    let discarded = false;
    let reportFailure: (() => void) | undefined;
    discardRef.current = () => { discarded = true; clearTimeout(pendingTimer); pending.clear(); };
    function stopForAccessFailure(cause: unknown) {
      const failure = voiceAccessFailure(cause);
      if (!failure) return false;
      if (attempt === generation.current) {
        stop(); setConnectionRequired(failure.connectionRequired); setError(failure.message);
      }
      return true;
    }
    try {
      const context = new AudioContext(); resources.current.context = context;
      // Request media in the same user gesture; Safari may keep resume() pending
      // until microphone permission resolves. Never await it before getUserMedia.
      if (context.state !== "running") void context.resume().catch(() => {});
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires HTTPS and a supported browser.");
      const microphoneRequest = navigator.mediaDevices.getUserMedia({ audio: { ...(microphoneIdRef.current ? { deviceId: { exact: microphoneIdRef.current } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .catch(cause => {
          if (cause?.name !== "OverconstrainedError" || !microphoneIdRef.current) throw cause;
          microphoneIdRef.current = ""; setMicrophoneId("");
          try { localStorage.removeItem("voice-microphone"); } catch {}
          return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        })
        .catch(cause => { throw new Error(voiceMicrophoneFailure(cause)); });
      // A very early click may beat idle warmup. Start the local model alongside
      // permission/device setup without delaying the browser's microphone request.
      void warmVoiceSpeechDetector();
      void microphoneRequest.then(stream => { if (attempt !== generation.current) stream.getTracks().forEach(track => track.stop()); }, () => {});
      const microphone = await voiceStartupStep(microphoneRequest, "Microphone permission is still pending. Allow microphone access in Safari, then start voice again.", 25_000);
      if (attempt !== generation.current) return;
      resources.current.stream = microphone;
      await voiceStartupStep(configureVoiceMicrophone(microphone), "Microphone configuration timed out. Select a different microphone and try again.", 5_000);
      if (navigator.mediaDevices.enumerateDevices) {
        void navigator.mediaDevices.enumerateDevices().then(devices => {
          if (attempt === generation.current) setMicrophones(devices.filter(device => device.kind === "audioinput" && device.deviceId).map((device, index) => ({deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}`})));
        }).catch(() => {});
      }
      await resumeVoiceAudio(context);
      if (attempt !== generation.current) return;
      setStream(microphone);
      // Local audio needs no session token. Prepare it during the conversation
      // and token requests so a blocked local peer route adds no separate wait.
      const playbackFailure = (message: string) => {
        if (attempt !== generation.current) return;
        reportFailure?.(); stop(); setError(message);
      };
      const playback = new VoicePlayback(context, playbackFailure);
      resources.current.playback = playback;
      const playbackReady = playback.start();
      // Handle failure now, even when a network request is still pending. Keep
      // the original promise so AgentVoiceLive also waits on its exact result.
      void playbackReady.catch(cause => playbackFailure(cause instanceof Error ? cause.message : "Could not enable voice playback."));
      setConnectionStep("Opening conversation");
      const chat = await voiceStartupStep(agentChatsApi.ensure(scope.companyId, scope.id), "The conversation could not be opened. Try starting voice again.");
      if (attempt !== generation.current) return;
      void client.invalidateQueries({ queryKey: ["agent-chat", scope.companyId] });
      setConnectionStep("Connecting to Gemini");
      // Keep explicit speech boundaries: the configured Live model accepted
      // streaming audio without replying when provider detection was enabled.
      // Local neural VAD sends activityStart/activityEnd without push-to-talk.
      let [session] = await voiceStartupStep(api.post<VoiceSession[]>(`/companies/${scope.companyId}/voice-sessions`, { agentIds: [scope.id], issueId: chat.id, audioTurnMode: "client", voiceToolsVersion: 5 }), "Gemini voice session creation timed out. Try starting voice again.", 20_000);
      if (attempt !== generation.current) return;
      agentRef.current = { ...scope, name: session.name || scope.name }; setAgent(agentRef.current);
      const startupBegan = performance.now();
      let startupStage: VoiceStartupStage = "loading_capture";
      let failureReported = false;
      function diagnostic(stage: VoiceStartupStage | "failed", failureCode?: string) {
        // Only allowlisted state labels and timing go to this instance's logs.
        // Never include audio, transcriptions, provider errors, or credentials.
        const contextState = String(context.state);
        void api.post(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/diagnostics`, {
          stage, elapsedMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - startupBegan))),
          ...(["running", "suspended", "interrupted", "closed"].includes(contextState) ? { contextState } : {}),
          ...(failureCode ? { failureCode } : {}),
        }).catch(() => {});
      }
      reportFailure = () => {
        if (failureReported) return;
        failureReported = true;
        diagnostic("failed", VOICE_STARTUP_FAILURES[startupStage]);
      };
      function flush() {
        clearTimeout(pendingTimer); pendingTimer = undefined;
        const batch = [...pending.values()]; pending.clear();
        writes = writes.then(async () => {
          if (persistenceError || discarded || owner !== ownerGeneration.current) return;
          for (const message of batch) {
            let failure: unknown;
            for (let retry = 0; retry < 3; retry++) {
              if (discarded || owner !== ownerGeneration.current) return;
              try {
                const saved = await api.put<IssueComment | null>(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/messages/${message.id}`, { role: message.role, text: message.text });
                if (discarded || owner !== ownerGeneration.current) return;
                if (!saved) { failure = undefined; break; }
                client.setQueryData<InfiniteData<IssueComment[]>>(queryKeys.issues.comments(chat.id), current => ({ pages: upsertIssueCommentInPages(current?.pages, saved), pageParams: current?.pageParams ?? [null] }));
                failure = undefined; break;
              } catch (cause) { if (voiceAccessFailure(cause)) throw cause; failure = cause; }
            }
            if (failure) throw failure;
          }
          if (batch.length && !discarded && owner === ownerGeneration.current) await client.invalidateQueries({ queryKey: queryKeys.issues.comments(chat.id) });
        }).catch((cause) => {
          persistenceError = cause;
          if (discarded || owner !== ownerGeneration.current) return;
          if (attempt === generation.current && stopForAccessFailure(cause)) return;
          if (attempt === generation.current) {
            stop(); setError("Voice stopped because a transcript could not be saved. Check your connection before continuing.");
          } else {
            setError("A final voice transcript could not be saved. Check your connection before continuing.");
          }
        });
        return writes;
      }
      flushRef.current = flush;
      const tools = createVoiceAgentTools(chat.id, chat.conversationSessionGeneration ?? 0, async () => {
        flush(); await writes;
        if (persistenceError) throw new Error("Transcript could not be saved; agent was not started.");
        if (attempt !== generation.current) throw new Error("Voice session has ended.");
      }, async (text, callId) => {
        if (!receipts.has(callId)) {
          const utterance = latestUser;
          if (utterance?.text.trim() === text) {
            await api.put(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/messages/${utterance.id}`, { role: "user", text: utterance.text, dispatch: true });
            receipts.set(callId, `voice-${session.sessionId}-${utterance.id}`);
          } else receipts.set(callId, crypto.randomUUID());
        }
        return receipts.get(callId)!;
      }, {
        assertActive: () => { if (attempt !== generation.current || owner !== ownerGeneration.current) throw new Error("Voice session has ended."); },
        direct: (name, args, callId, signal) => api.post(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/tools`, { name, args, callId }, signal ? { signal } : undefined),
        context: () => api.get(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/context`),
        authorizeTask: fields => api.post(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/task-access`, fields),
      });
      const voiceToolsEnabled = Boolean((session.setup?.tools as unknown[] | undefined)?.length);
      // Progress is useful context, but its four API reads must not delay the
      // microphone. Permission loss still stops the session immediately.
      const initialProgress = (voiceToolsEnabled
        ? voiceStartupStep(tools.progress(), "Agent progress lookup timed out.", 5_000)
        : Promise.resolve({ replies: [], questions: [] })).catch(cause => {
          if (attempt === generation.current) stopForAccessFailure(cause);
          return undefined;
        });
      const progressTracker = new VoiceProgressTracker(previousProgress);
      let progressObserved = false;
      const live = new AgentVoiceLive(session, microphone, context,
        value => { if (attempt === generation.current) { if (conference.current) conference.current.phase(scope.id, value); else setPhase(value); } },
        message => {
          if (attempt !== generation.current || isNonSpeechVoiceTranscript(message.text)) return;
          conference.current?.observe(scope.id, message);
          if (message.role === "user") latestUser = message;
          pending.set(message.id, message);
          if (!pendingTimer) pendingTimer = setTimeout(flush, 250);
        },
        message => { if (attempt === generation.current) { reportFailure?.(); stop("failure"); setError(message); } },
        async (name, args, id, signal) => {
          if (attempt !== generation.current) throw new Error("Voice session has ended.");
          assertVoiceToolActive(signal);
          if (conference.current && conference.current.speaker !== scope.id) throw new Error("Wait for your speaking turn.");
          if (name === "conference_call") {
            if (!conference.current) throw new Error("The call is still connecting.");
            setConferenceOpen(true);
            return conference.current.control(scope.id, args);
          }
          pendingActivities.set(id, voiceToolActivityLabel(name, args));
          publishActivity();
          const finishActivity = () => { pendingActivities.delete(id); publishActivity(); };
          signal?.addEventListener("abort", finishActivity, { once: true });
          try {
            const webTurn = webTurnSequence;
            const webTurnId = `${session.sessionId}:web-${webTurn}`;
            const result = await runVoiceToolWithSessionCheck(async () => {
              await api.get(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/instructions-revision`, signal ? { signal } : undefined);
              if (attempt !== generation.current) throw new Error("Voice session has ended.");
            }, () => tools.execute(name, args, `${session.sessionId}:${id}`, signal), stopForAccessFailure, signal);
            assertVoiceToolActive(signal);
            if (attempt !== generation.current || owner !== ownerGeneration.current) throw new Error("Voice session has ended.");
            const action = name === "organization_api" ? args.action : name;
            if ((action === "search_web" || action === "read_web_page") && webTurn === webTurnSequence) {
              setGrounding(previous => mergeVoiceWebSources(previous, result, webTurnId, action) ?? previous);
            }
            if (name === "organization_api" && action !== "search_web" && action !== "read_web_page") void client.invalidateQueries();
            void client.invalidateQueries({ queryKey: queryKeys.issues.comments(chat.id) });
            void client.invalidateQueries({ queryKey: queryKeys.issues.interactions(chat.id) });
            return result;
          } finally {
            signal?.removeEventListener("abort", finishActivity);
            finishActivity();
          }
        }, stage => {
          if (attempt !== generation.current) return;
          startupStage = stage; setConnectionStep(VOICE_STARTUP_LABELS[stage]); diagnostic(stage);
        }, { playback, ready: playbackReady }, event => {
          if (attempt !== generation.current) return;
          void api.post(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/diagnostics`, {
            stage: event.stage, tool: event.tool, sequence: event.sequence, elapsedMs: event.elapsedMs,
          }).catch(() => {});
        }, async signal => {
          const assertCurrent = () => {
            assertVoiceToolActive(signal);
            if (attempt !== generation.current || owner !== ownerGeneration.current) throw new DOMException("Voice session ended.", "AbortError");
          };
          assertCurrent();
          try {
            const roster = await api.get<{ organization: { id: string } }>(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/roster`, { signal, cache: "no-store" });
            assertCurrent();
            if (roster.organization?.id !== scope.companyId) throw new Error("Voice roster belongs to a different organization.");
            return roster;
          } catch (cause) {
            assertCurrent();
            stopForAccessFailure(cause);
            throw cause;
          }
        }, (value, reason) => {
          if (attempt === generation.current && owner === ownerGeneration.current) {
            if (reason === "new_turn") {
              webTurnSequence++; setGrounding(null); pendingActivities.clear(); setActivity(null); return;
            }
            // A late legacy Google reset must not erase new tool evidence.
            setGrounding(previous => value ?? (previous?.provider === "searxng" || previous?.provider === "web" ? previous : null));
          }
        }, async signal => {
          const assertCurrent = () => {
            assertVoiceToolActive(signal);
            if (attempt !== generation.current || owner !== ownerGeneration.current) throw new DOMException("Voice session ended.", "AbortError");
          };
          assertCurrent();
          if ((conference.current?.size ?? 1) > 1) throw new Error("The provider disconnected this conference. Start voice again to reconnect the participants.");
          const previous = session;
          setConnectionStep("Connecting voice without Google Search");
          try {
            const [replacement] = await voiceStartupStep(api.post<VoiceSession[]>(`/companies/${scope.companyId}/voice-sessions`, {
              agentIds: [scope.id], issueId: chat.id, audioTurnMode: "client", voiceToolsVersion: 5, searchGrounding: false,
            }, { signal }), "Google voice reconnection timed out. Try starting voice again.", 15_000);
            assertCurrent();
            // Minting a new token must not adopt a chat reset in another tab.
            // Revalidate the original generation and access before rebinding APIs.
            const authorization = await api.get<{ revision: string }>(`/companies/${scope.companyId}/voice-sessions/${previous.sessionId}/instructions-revision`, { signal, cache: "no-store" });
            assertCurrent();
            const generationConfig = (value: VoiceSession) => value.setup?.generationConfig as { thinkingConfig?: unknown } | undefined;
            if (!replacement || authorization.revision !== previous.instructionsRevision
              || replacement.agentId !== scope.id || replacement.issueId !== chat.id
              || replacement.setup?.model !== previous.setup?.model || replacement.instructionsRevision !== previous.instructionsRevision
              || JSON.stringify(generationConfig(replacement)?.thinkingConfig) !== JSON.stringify(generationConfig(previous)?.thinkingConfig)
              || (Array.isArray(replacement.setup.tools) && replacement.setup.tools.some(tool => tool && typeof tool === "object" && ("googleSearch" in tool || "google_search" in tool)))) {
              throw new Error("The voice configuration changed during recovery. Start voice again.");
            }
            session = replacement;
            conference.current?.replaceRootSession(replacement);
            setSearchUnavailable("Google rejected the Search-enabled connection with a quota error. Search is off for this session; voice and organization tools remain available.");
            return replacement;
          } catch (cause) {
            assertCurrent();
            stopForAccessFailure(cause);
            throw cause;
          }
        }, event => {
          if (attempt !== generation.current || owner !== ownerGeneration.current) return;
          void api.post(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/diagnostics`, {
            stage: event.stage, sequence: event.sequence, elapsedMs: event.elapsedMs,
            activeTools: event.activeTools, inputActive: event.inputActive,
            ...(event.sinceToolResponseMs === undefined ? {} : { sinceToolResponseMs: event.sinceToolResponseMs }),
            ...(event.turnCompleteReason === undefined ? {} : { turnCompleteReason: event.turnCompleteReason }),
            ...(event.waitingForInput === undefined ? {} : { waitingForInput: event.waitingForInput }),
            ...(event.stage === "provider_tool_call_invalid" ? { toolCallIssue: readVoiceToolCallIssue(event.toolCallIssue) } : {}),
            ...(event.stage === "provider_code_execution" ? { codeExecutionOutcome: readVoiceCodeExecutionOutcome(event.codeExecutionOutcome) } : {}),
          }).catch(() => {});
        }, async (text, signal, previousLocation) => {
          const assertCurrent = () => {
            assertVoiceToolActive(signal);
            if (attempt !== generation.current || owner !== ownerGeneration.current) throw new DOMException("Voice session ended.", "AbortError");
          };
          assertCurrent();
          try {
            const result = await api.post(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/news-context`, {
              text, instructionsRevision: session.instructionsRevision, ...(previousLocation ? { previousLocation } : {}),
            }, { signal });
            assertCurrent();
            return result;
          } catch (cause) {
            assertCurrent();
            // A denied public lookup is an operation failure, not necessarily
            // loss of voice-session access. Typed revocation/revision failures
            // still stop the session; ordinary search policy denials do not.
            if (voiceAccessFailure(cause, "operation")) stopForAccessFailure(cause);
            throw cause;
          }
        });
      resources.current.live = live;
      resources.current.playback = undefined; // Ownership transfers to live.
      setConnectionStep("Starting audio connection");
      await voiceStartupStep(live.start(), "The audio connection timed out. Click Start voice to retry.", 75_000);
      if (attempt !== generation.current) return;
      conference.current = new VoiceConference({ companyId: scope.companyId, session, live, stream: microphone,
        generation: chat.conversationSessionGeneration ?? 0, tones: tones.current!,
        change: (members, speaker) => { if (attempt === generation.current) { setParticipants(members); setSpeakerId(speaker); } },
        phase: value => { if (attempt === generation.current) setPhase(value); },
        saved: saved => {
          if (owner !== ownerGeneration.current) return;
          client.setQueryData<InfiniteData<IssueComment[]>>(queryKeys.issues.comments(chat.id), current => ({ pages: upsertIssueCommentInPages(current?.pages, saved), pageParams: current?.pageParams ?? [null] }));
        }, error: message => { if (attempt === generation.current) setError(message); }, end: () => stop(),
      });
      tones.current?.unlock(); tones.current?.play("start");
      void initialProgress.then(progress => {
        if (!progress || attempt !== generation.current || progressObserved) return;
        progressObserved = true;
        const update = progressTracker.observe(progress);
        if (update) live.updateAgentProgress(update);
      });
      let pollFailures = 0;
      let revisionFailures = 0;
      async function poll() {
        if (attempt !== generation.current) return;
        try {
          if (session.instructionsRevision) {
            let revision: { revision: string };
            try {
              revision = await api.get(`/companies/${scope.companyId}/voice-sessions/${session.sessionId}/instructions-revision`);
              revisionFailures = 0;
            } catch (cause) {
              if (attempt !== generation.current) return;
              if (stopForAccessFailure(cause)) return;
              if (++revisionFailures >= 3) {
                stop(); setError("Voice stopped because updated agent instructions could not be verified. Restart voice to reconnect."); return;
              }
              throw cause;
            }
            if (attempt !== generation.current) return;
            if (revision.revision !== session.instructionsRevision && live.canRefreshInstructions) {
              // Gemini fixes its system instruction at connection setup. Save
              // this turn and rebuild from the canonical source between turns.
              flush(); await writes;
              if (attempt !== generation.current || persistenceError) return;
              if (live.canRefreshInstructions && (conference.current?.size ?? 1) > 1) { stop("failure"); setError("Agent instructions changed. Start a new conference to load the updated permissions."); return; }
              if (live.canRefreshInstructions) { release(true, true); await start(scope, progressTracker.snapshot); return; }
            }
          }
          const progress = voiceToolsEnabled ? await tools.progress() : { replies: [], questions: [] };
          if (attempt !== generation.current) return;
          progressObserved = true;
          const recovered = pollFailures >= 3;
          pollFailures = 0;
          const update = progressTracker.observe(progress);
          if (update) live.updateAgentProgress(update);
          else if (recovered) live.updateAgentProgress({ error: null, progressAvailable: true });
        } catch (cause) {
          if (attempt !== generation.current) return;
          if (stopForAccessFailure(cause)) return;
          if (++pollFailures === 3) live.updateAgentProgress({ error: "Cannot currently fetch agent progress. Do not claim work is complete." });
        }
        if (attempt === generation.current) resources.current.poll = setTimeout(poll, 3000);
      }
      resources.current.poll = setTimeout(poll, 3000);
    } catch (cause) {
      if (attempt !== generation.current) return;
      reportFailure?.();
      if (stopForAccessFailure(cause)) return;
      stop("failure"); setError(cause instanceof Error ? cause.message : "Could not enable voice.");
    }
  }
  return { participants, speakerId, conferenceOpen, setConferenceOpen,
    availableAgents: () => conference.current?.available() ?? Promise.resolve([]),
    addToCall: async (id: string) => { if (!conference.current) throw new Error("Wait for the call to connect."); setConferenceOpen(true); return conference.current.add(id); },
    removeFromCall: (id: string) => conference.current?.remove(id),
    handoffCall: (id: string) => conference.current?.handoff(id),
    agent, active, stream, phase, error, connectionRequired, start, stop, reset, dismissError, theme, microphones, microphoneId, changeMicrophone, connectionStep, grounding, searchUnavailable, activity };
}
