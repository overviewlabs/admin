import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/api/client";
import { adminRequest, adminJson, type AdminChat } from "@/api/native-admin";
import { AgentVoiceLive, type VoicePhase, type VoiceTranscript } from "@/lib/agent-voice-live";
import { configureVoiceMicrophone, voiceMicrophoneFailure } from "@/lib/voice-microphone";
import { resumeVoiceAudio, voiceStartupStep } from "@/lib/voice-startup";
import { isVoiceSessionActive, setVoiceSessionActive, subscribeVoiceSessionReset } from "@/lib/active-voice-session";
import type { VoiceSession } from "@whoxos/shared/agent-voice";

/** Admin keeps its own chat, authorization and native tools; audio is shared. */
export function useAdminVoice(options: { chatId: string; workspace?: string; model: string; mode: string;
  onSaved: (chatId: string) => void }) {
  const { theme } = useTheme();
  const [active, setActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("connecting");
  const [error, setError] = useState("");
  const latest = useRef(options); latest.current = options;
  const resource = useRef<{ generation: number; live?: AgentVoiceLive; stream?: MediaStream; context?: AudioContext;
    sessionId?: string; poll?: ReturnType<typeof setTimeout>; scope?: typeof options; turns: Map<string, VoiceTranscript> }>({ generation: 0, turns: new Map() });
  async function save(current: typeof resource.current) {
    if (!current.sessionId || !current.turns.size || !current.scope) return;
    const result = await adminRequest<{ chat_id: string }>("audio/live/transcript", adminJson({
      session_id: current.sessionId, chat_id: current.scope.chatId || null, workspace: current.scope.workspace || "",
      model: "gemini-3.8-live-extended-thinking",
      turns: [...current.turns.values()].filter(turn => turn.text.trim()).map(turn => ({ role: turn.role === "model" ? "assistant" : "user", text: turn.text })),
    }));
    current.scope.onSaved(result.chat_id);
  }
  function stop(saveTranscript = true) {
    const current = resource.current;
    if (!current.scope) return;
    resource.current = { generation: current.generation + 1, turns: new Map() };
    clearTimeout(current.poll);
    current.live?.stop(); current.stream?.getTracks().forEach(track => track.stop());
    if (current.context?.state !== "closed") void current.context?.close().catch(() => {});
    setActive(false); setStream(null);
    void (saveTranscript ? save(current) : Promise.resolve()).catch(cause => setError(cause instanceof Error ? cause.message : "Could not save the voice transcript.")).finally(() => {
      if (!resource.current.live) setVoiceSessionActive(false);
    });
    if (current.sessionId) void api.delete(`/instance/admin-voice-sessions/${current.sessionId}`).catch(() => {});
  }
  useEffect(() => () => stop(true), []);
  useEffect(() => subscribeVoiceSessionReset(() => stop(false)), []);
  // A different Admin conversation must never receive this session's tools/history.
  useEffect(() => { if (resource.current.scope && resource.current.scope.chatId !== options.chatId) stop(true); }, [options.chatId]);
  async function start() {
    if (resource.current.live || resource.current.context) return;
    if (isVoiceSessionActive()) { setError("End the current voice call before starting Admin voice."); return; }
    const current = resource.current;
    current.scope = { ...latest.current };
    const isCurrent = () => resource.current === current;
    setError(""); setActive(true); setPhase("connecting"); setVoiceSessionActive(true);
    const fail = (message: string) => { if (isCurrent()) { stop(); setError(message); } };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires HTTPS and a supported browser.");
      current.context = new AudioContext();
      void current.context.resume().catch(() => {});
      const media = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      void media.then(value => { if (!isCurrent()) value.getTracks().forEach(track => track.stop()); }, () => {});
      current.stream = await voiceStartupStep(media.catch(cause => { throw new Error(voiceMicrophoneFailure(cause)); }), "Allow microphone access, then start voice again.", 25_000);
      if (!isCurrent()) return;
      await configureVoiceMicrophone(current.stream); await resumeVoiceAudio(current.context);
      if (!isCurrent()) return;
      setStream(current.stream);
      const prepared = await voiceStartupStep(adminRequest<{ setup: VoiceSession["setup"]; history: VoiceSession["context"] }>("audio/live/prepare", adminJson({ purpose: "assistant", chat_id: current.scope.chatId || null })), "Admin voice preparation timed out.");
      if (!isCurrent()) return;
      const session = await voiceStartupStep(api.post<VoiceSession>("/instance/admin-voice-sessions", { setup: prepared.setup }), "Gemini voice session creation timed out.");
      current.sessionId = session.sessionId;
      if (!isCurrent()) { void api.delete(`/instance/admin-voice-sessions/${session.sessionId}`).catch(() => {}); return; }
      session.context = prepared.history;
      const tool = async (name: string, args: Record<string, unknown>, id: string, signal?: AbortSignal) => {
        if (!isCurrent() || signal?.aborted) throw new Error("Voice call ended.");
        await api.get(`/instance/admin-voice-sessions/${session.sessionId}`, { signal });
        if (name !== "whox_action") return adminRequest("audio/live/admin-tools", { ...adminJson({ name, arguments: args, request_id: id }), signal });
        if (typeof args.request !== "string" || !args.request.trim()) throw new Error("A complete request is required.");
        if (!current.scope!.model) throw new Error("Connect a text model in Admin settings to run this task. Gemini voice conversation remains available.");
        const before = current.scope!.chatId ? await adminRequest<AdminChat>(`chats/${current.scope!.chatId}?include_context=false`, { signal }) : null;
        const result = await adminRequest<{ chat_id: string; message_id: string }>("chats", { ...adminJson({
          content: args.request, model_id: current.scope!.model, workspace: current.scope!.workspace,
          chat_id: current.scope!.chatId || undefined, parent_id: before?.chat.current_message_id || null, params: { tool_approval_mode: current.scope!.mode },
        }), signal });
        current.scope!.chatId = result.chat_id;
        current.scope!.onSaved(result.chat_id);
        const deadline = Date.now() + 5 * 60_000;
        while (isCurrent() && !signal?.aborted && Date.now() < deadline) {
          const chat = await adminRequest<AdminChat>(`chats/${result.chat_id}?include_context=false`, { signal });
          const message = chat.messages.find(message => message.id === result.message_id);
          if (message?.done) return { result: message.content || "The operation finished; inspect the chat for its tool results." };
          if (message?.output?.some(item => item.type === "function_call" && item.status === "pending")) return { pending: true, message: "The Admin task is waiting for input or approval in this chat." };
          await new Promise<void>(resolve => setTimeout(resolve, 1000));
        }
        return { pending: true, message: "The Admin task continues in this chat. Completion has not been confirmed." };
      };
      current.live = new AgentVoiceLive(session, current.stream, current.context, value => { if (isCurrent()) setPhase(value); }, turn => { if (isCurrent()) current.turns.set(turn.id, turn); }, fail, tool);
      await current.live.start();
      if (!isCurrent()) return;
      const poll = async () => {
        try { await api.get(`/instance/admin-voice-sessions/${session.sessionId}`); }
        catch (cause) { fail(cause instanceof Error ? cause.message : "Admin voice access expired."); return; }
        if (isCurrent()) current.poll = setTimeout(poll, 5000);
      };
      current.poll = setTimeout(poll, 5000);
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Could not start Admin voice."); }
  }
  return { active, stream, phase, error, connectionRequired: /connect.*gemini/i.test(error), start, stop: () => stop(true), dismissError: () => setError(""), theme };
}
