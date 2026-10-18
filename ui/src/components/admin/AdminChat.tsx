import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Plus, ArrowDown } from "lucide-react";
import { useStreamlinedUiEnabled } from "@/hooks/useStreamlinedUiEnabled";
import { TaskChatPresentationProvider } from "../task-chat/presentation-mode";
import { useSidebar } from "@/context/SidebarContext";
import {useChatFollow} from "@/hooks/useChatFollow";
import { TaskChatComposer } from "../task-chat/TaskChatComposer";
import { TaskChatBubble } from "../task-chat/TaskChatBubble";
import { TaskChatBubbleActions } from "../task-chat/TaskChatBubbleActions";
import { useAdminPortalAccess } from "../../hooks/useAdminPortalAccess";
import { loadDraftAttachments } from "../../lib/composer-draft";
import { adminMessagePresentation, adminProgress, adminRuntimeActivity, adminThinking } from "../../lib/admin-chat-presentation";
import { TaskChatThinking } from "../task-chat/TaskChatThinking";
import { TaskChatTurn } from "../task-chat/TaskChatTurn";
import { toolCountSummaryFromEntries } from "../task-chat/TaskChatLiveRunPill";
import { currentActivityLabel } from "../task-chat/current-activity";
import type { TaskChatToolItem, TaskChatTurnChildItem } from "../task-chat/task-chat-model";
import { TaskChatToolCard } from "../task-chat/TaskChatToolCard";
import { humanizeToolName } from "../task-chat/tool-taxonomy";
import {
  defaultAdminModel,
  adminJson,
  adminRequest,
  adminUrl,
  ensureAdminSession,
  type AdminChat as Chat,
  type AdminChatEvent,
  type AdminMessage,
  type AdminModels,
  type AdminOutput,
} from "../../api/native-admin";
import {
  activeAdminMessages,
  applyAdminChatEvent,
  mergeAdminOutput,
} from "../../lib/admin-chat-state";
import { useAdminAction, useAdminQuery } from "../../hooks/useNativeAdmin";
import { VoiceIndicator } from "../GlobalVoiceIndicator";
import { useAdminVoice } from "../../hooks/useAdminVoice";
import { useLocation, useNavigate } from "../../lib/router";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AdminError } from "./AdminControls";
type Attachment = { id: string; url: string; name: string; type: string };
function toolResult(call: AdminOutput, message: AdminMessage) {
  return message.output?.find((o) => o.type === "function_call_output" && o.call_id === call.call_id);
}
function needsInput(call: AdminOutput, message: AdminMessage) {
  return !message.done && call.status === "pending" && !toolResult(call, message);
}
function toolItem(call: AdminOutput, message: AdminMessage): TaskChatToolItem {
  const result = toolResult(call, message);
  const outputText = result ? typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2) : "";
  return {
    id: `${message.id}:${call.call_id || call.id || call.name}`,
    kind: "tool", name: humanizeToolName(call.name || "Tool"), rawName: call.name,
    status: call.status?.toLowerCase() === "failed" || result?.status?.toLowerCase() === "failed" ? "failed" : result || call.status?.toLowerCase() === "completed" ? "completed" : message.done ? "interrupted" : needsInput(call, message) ? "pending" : "in_progress",
    detail: [JSON.stringify(call.arguments, null, 2), outputText].filter(Boolean).join("\n\n"),
  };
}
function AdminActivity({ message, timestamp, actions }: { message: AdminMessage; timestamp?: string; actions?: React.ReactNode }) {
  const calls = (message.output || []).filter((o) => o.type === "function_call");
  const items: TaskChatTurnChildItem[] = (message.output || []).flatMap((item, index) => {
    if (item.type === "function_call" && !needsInput(item, message)) return [toolItem(item, message)];
    const thinking = adminThinking(item, message, index);
    return thinking ? [thinking] : [];
  });
  const activity = adminRuntimeActivity(message.output || []) || currentActivityLabel([
    ...items,
    ...calls.filter((call) => needsInput(call, message)).map((call) => toolItem(call, message)),
  ], items.length === 0 && message.content ? "Responding" : "Working");
  return <TaskChatTurn
    liveStatusStyle="overview"
    item={{
      id: `admin-turn:${message.id}`, kind: "turn", settled: message.done, items,
      summary: { toolCount: calls.length, added: 0, removed: 0, failed: items.some((item) => item.kind === "tool" && (item.status === "failed" || item.status === "interrupted")) },
      liveStatus: message.done ? undefined : { id: `admin-status:${message.id}`, kind: "status", status: "working", label: activity, selfTalk: adminProgress(message.output || []), startedAtMs: message.created_at,
        detail: toolCountSummaryFromEntries(calls.map((call) => ({ kind: "tool_call", ts: "", name: call.name || "Tool", input: call.arguments || {}, toolUseId: call.call_id || call.id }))) || undefined },
    }}
    timestampPrefix={message.done ? timestamp : undefined}
    leading={actions}
    renderChild={(child) => child.kind === "tool" ? <TaskChatToolCard item={child} /> : child.kind === "thinking" ? <TaskChatThinking item={child} /> : null}
  />;
}
function ToolCall({
  call,
  message,
  chatId,
  reload,
}: {
  call: AdminOutput;
  message: AdminMessage;
  chatId: string;
  reload: () => void;
}) {
  const action = useAdminAction();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const pending = needsInput(call, message);
  const questions = Array.isArray(call.arguments?.questions)
    ? (call.arguments.questions as Array<{
        id: string;
        question: string;
        options?: Array<{ label: string; description?: string }>;
      }>)
    : [];
  const endpoint = `chats/${chatId}/messages/${message.id}`;
  return (
    <div className="space-y-3 text-sm">
      <TaskChatToolCard item={toolItem(call, message)} />
      {pending && call.name === "ask_user" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(
              () =>
                adminRequest(
                  `${endpoint}/answer`,
                  adminJson({
                    call_id: call.call_id,
                    answers,
                    timed_out: false,
                  }),
                ),
              reload,
            );
          }}
        >
          {questions.map((q) => (
            <div className="grid gap-2" key={q.id}>
              <label htmlFor={`admin-answer-${message.id}-${q.id}`}>{q.question}</label>
              {q.options?.map((option) => (
                <Button
                  key={option.label}
                  type="button"
                  variant={
                    answers[q.id] === option.label ? "secondary" : "outline"
                  }
                  onClick={() =>
                    setAnswers((a) => ({ ...a, [q.id]: option.label }))
                  }
                >
                  {option.label}
                </Button>
              ))}
              <Input
                id={`admin-answer-${message.id}-${q.id}`}
                aria-label={q.question}
                placeholder="Your answer"
                value={answers[q.id] || ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                }
              />
            </div>
          ))}
          <Button
            type="submit"
            disabled={
              action.busy || questions.some((q) => !answers[q.id]?.trim())
            }
          >
            Send answer
          </Button>
        </form>
      ) : (
        pending && (
          <div className="flex gap-2">
            <Button
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () =>
                    adminRequest(
                      `${endpoint}/approve`,
                      adminJson({ call_id: call.call_id, approved: true }),
                    ),
                  reload,
                )
              }
            >
              Allow
            </Button>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () =>
                    adminRequest(
                      `${endpoint}/approve`,
                      adminJson({ call_id: call.call_id, approved: false }),
                    ),
                  reload,
                )
              }
            >
              Decline
            </Button>
          </div>
        )
      )}
      <AdminError error={action.error} />
    </div>
  );
}
export function AdminChat() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const chatId = params.get("chatId") || "";
  const workspace = params.get("workspace") || undefined;
  const viewKey = `${chatId}:${workspace || ""}:${params.get("request") || ""}`;
  const currentView = useRef(viewKey);
  currentView.current = viewKey;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const models = useAdminQuery<AdminModels>("chats/models");
  const action = useAdminAction();
  const { currentUserId } = useAdminPortalAccess();
  const draftKey = currentUserId ? `whox:admin-chat-draft:${currentUserId}:${chatId || workspace || "home"}:${chatId ? "" : params.get("request") || "new"}` : undefined;
  const [chat, setChat] = useState<Chat | null>(null);
  const [error, setError] = useState("");
  const [streamError, setStreamError] = useState("");
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const { isMobile } = useSidebar();
  const { enabled: streamlined } = useStreamlinedUiEnabled();
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("full");
  const uploadedFiles = useRef(new Map<string, Attachment>());
  const scroller = useRef<HTMLDivElement>(null);
  const {away: awayFromBottom, onScroll, resume: followLatest} = useChatFollow(scroller, chat, chatId);
  const revision = useRef(0);
  const requestNumber = useRef(0);
  const currentId = useRef(chatId);
  currentId.current = chatId;
  const load = useCallback(async () => {
    if (!chatId) return;
    const requestedView = currentView.current;
    const number = ++requestNumber.current;
    const version = revision.current;
    try {
      const data = await adminRequest<Chat>(`chats/${chatId}?include_context=false`);
      if (!mounted.current || currentView.current !== requestedView || currentId.current !== chatId || number !== requestNumber.current)
        return;
      setChat((current) => {
        if (
          !current ||
          current.chat.id !== chatId ||
          version === revision.current
        )
          return data;
        return {
          ...data,
          messages: data.messages.map((message) => {
            const live = current.messages.find((m) => m.id === message.id);
            if (!live) return message;
            // A settled server snapshot contains the final authoritative output.
            // Never overwrite it with the earlier in-progress socket state.
            if (message.done) return message;
            return {
              ...message,
              content:
                live.content.length > message.content.length
                  ? live.content
                  : message.content,
              output: (live.output || []).reduce(
                mergeAdminOutput,
                message.output || [],
              ),
              done: message.done || live.done,
            };
          }),
        };
      });
      setError("");
    } catch (e) {
      if (mounted.current && currentView.current === requestedView && currentId.current === chatId)
        setError(
          e instanceof Error ? e.message : "Could not load conversation.",
        );
    }
  }, [chatId]);
  useEffect(() => {
    setChat(null);
    setError("");
    setStreamError("");
    action.setError("");
    setSending(false);
    setModel("");
    setMode("full");
    uploadedFiles.current.clear();
    revision.current = 0;
    void load();
  }, [viewKey, load]);
  useEffect(() => {
    uploadedFiles.current.clear();
    if (draftKey) for (const file of loadDraftAttachments(draftKey)) {
      const imageMime: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", heic: "image/heic", svg: "image/svg+xml" };
      const extension = file.name.split(".").at(-1)?.toLowerCase() || "";
      uploadedFiles.current.set(file.attachmentId, { id: file.attachmentId, url: file.contentPath.replace(/^\/admin-portal/, ""), name: file.name, type: file.contentType || imageMime[extension] || "application/octet-stream" });
    }
  }, [draftKey]);
  useEffect(() => {
    if (chat?.chat.id === chatId) {
      setModel((value) => value || chat.chat.meta?.last_model || "");
      setMode(String(chat.chat.meta?.params?.tool_approval_mode || "full"));
    }
  }, [chat?.chat.id]);
  useEffect(() => {
    let disposed = false;
    let socket: ReturnType<typeof io> | undefined;
    const viewId = crypto.randomUUID();
    const visibility = () => {
      if (!chatId) return;
      socket?.emit("chat:view", {
        chat_id: chatId,
        view_id: viewId,
        visible: !document.hidden,
      });
      if (!document.hidden) socket?.emit("chat:read", { chat_id: chatId });
    };
    void ensureAdminSession()
      .then(() => {
        if (disposed) return;
        socket = io({
          path: "/admin-portal/socket.io",
          withCredentials: true,
          transports: ["websocket", "polling"],
          tryAllTransports: true,
          reconnectionDelay: 1000,
        });
        socket.on("connect", () => {
          setConnected(true);
          visibility();
          void load();
        });
        socket.on("disconnect", () => setConnected(false));
        socket.on("connect_error", () => setConnected(false));
        socket.on("events:chat", (event: AdminChatEvent) => {
          if (event.chat_id !== chatId || disposed) return;
          revision.current++;
          setChat((data) => applyAdminChatEvent(data, event));
          if (event.error) setStreamError(event.error);

          if (
            event.done ||
            event.pending_inputs_processed ||
            event.async_subagent_pending
          )
            void load();
        });
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      socket?.emit("chat:view", {
        chat_id: chatId,
        view_id: viewId,
        visible: false,
      });
      socket?.disconnect();
    };
  }, [chatId, load]);
  useEffect(() => {
    if (!chatId) return;
    // Snapshots also recover messages created by another tab while connected.
    const timer = setInterval(() => void load(), connected ? 15000 : 5000);
    return () => clearInterval(timer);
  }, [connected, chatId, load]);
  const branch = activeAdminMessages(chat);
  const messages = [
    ...branch,
    ...(chat?.messages.filter(
      (m) => m.meta?.queued && !branch.some((b) => b.id === m.id),
    ) || []),
  ];
  const last = branch.at(-1);
  const working = last?.role === "assistant" && !last.done;
  const selectedModel = models.data?.models.some((item) => item.id === model) ? model : defaultAdminModel(models.data);
  const voice = useAdminVoice({ chatId, workspace: chat?.chat.meta?.workspace || workspace, model: selectedModel || "", mode,
    onSaved: id => { if (!mounted.current || currentView.current !== viewKey) return; if (id !== currentId.current) navigate(adminUrl("chat", { chatId: id, workspace })); else void load(); } });
  async function send(content: string, attachmentIds?: string[], retryParentId?: string) {
    if ((!content.trim() && !attachmentIds?.length && !retryParentId) || !selectedModel || sending) return;
    const submittedView = currentView.current;
    setStreamError(""); setSending(true);
    followLatest();
    try {
      const result = await adminRequest<{ chat_id: string; message_id: string }>("chats", adminJson({
        content, model_id: selectedModel,
        workspace: chat?.chat.meta?.workspace || workspace,
        chat_id: chatId || undefined, parent_id: retryParentId || chat?.chat.current_message_id || null,
        files: (attachmentIds || []).map(id => uploadedFiles.current.get(id)).filter(Boolean),
        params: { ...chat?.chat.meta?.params, tool_approval_mode: mode },
      }));
      if (!mounted.current || currentView.current !== submittedView) return;
      if (result.chat_id !== chatId) navigate(adminUrl("chat", { chatId: result.chat_id, workspace }));
      else await load();
    } catch (error) {
      if (mounted.current && currentView.current === submittedView) setStreamError(error instanceof Error ? error.message : "Could not send message.");
      throw error; // Shared composer retains the draft when sending fails.
    } finally { if (mounted.current && currentView.current === submittedView) setSending(false); }
  }
  function messageActions(message: AdminMessage) {
    return <TaskChatBubbleActions copyText={message.content} feedback={message.done ? {
      activeVote: message.meta?.feedback?.vote || null, sharingPreference: "not_allowed", termsUrl: null,
      onVote: async (vote, options) => {
        try {
          await adminRequest(`chats/${chatId}/messages/${message.id}/feedback`, adminJson({ vote, reason: options?.reason }));
          await load();
        } catch (error) {
          setStreamError(error instanceof Error ? error.message : "Could not save feedback.");
          throw error;
        }
      },
    } : undefined} />;
  }
  async function attach(file: File) {
    const body = new FormData(); body.append("file", file);
    const saved = await adminRequest<{ id: string; url: string }>("files", { method: "POST", body });
    uploadedFiles.current.set(saved.id, { ...saved, name: file.name, type: file.type });
    return { id: saved.id, contentPath: saved.url.startsWith("/api/files/") ? `/admin-portal${saved.url}` : saved.url, originalFilename: file.name };
  }
  return (
    <TaskChatPresentationProvider mode={streamlined ? "streamlined" : "production"}>
    <VoiceIndicator voice={{ ...voice, agent: { id: "admin", companyId: "instance", name: "Admin", companyName: "Instance" } }} />
    <div className="relative flex flex-1 min-h-0 min-w-0 flex-col" data-testid="admin-shared-chat" data-generative-chat-scope="true">
      <div className="flex h-10 shrink-0 items-center justify-end px-3">
        <Button variant="ghost" size="icon" aria-label="New conversation" title="New conversation"
          onClick={() => navigate(adminUrl("chat", { workspace, request: crypto.randomUUID() }))}>
          <Plus className="size-4" />
        </Button>
      </div>
      <AdminError
        error={streamError || error || action.error || last?.meta?.error || (models.error instanceof Error ? models.error.message : "")}
        retry={sending || working ? undefined : () => {
          if (last?.role === "assistant" && last.done && last.meta?.error && last.parent_id)
            void send("", [], last.parent_id).catch(() => {});
          else { setStreamError(""); action.setError(""); void load(); }
        }}
      />
      <div
        ref={scroller}
        onScroll={onScroll}
        className="chat-stream-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-auto-hide"
      >
        <div className={`mx-auto flex w-full max-w-(--tc-shell-max-w) flex-col gap-6 px-4 pb-6 pt-3 ${streamlined ? "md:px-0" : ""}`}>
          {messages.map((message) => {
            const presentation = adminMessagePresentation(message);
            return <article key={message.id} className="min-w-0 space-y-3">
              <TaskChatBubble item={{
                id: message.id, kind: "message", author: message.role === "user" ? "human" : "agent",
                authorName: message.role === "user" ? undefined : "Admin",
                text: presentation.text,
                timestamp: message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : undefined,
                streaming: message.role === "assistant" && !message.done,
                optimistic: message.meta?.queued ? "queued" : undefined,
              }} attachments={presentation.attachments} animateEntry={false} actions={message.role === "assistant" && message.content ? messageActions(message) : undefined}
                attachedTurn={message.role === "assistant" && (message.output?.some((o) => o.type === "function_call" || o.type === "reasoning") || !message.done) ?
                  <AdminActivity message={message}
                    timestamp={message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : undefined}
                    actions={message.content ? messageActions(message) : undefined}
                  /> : undefined}
              />
              {message.meta?.queued && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(
                        () =>
                          adminRequest(
                            `chats/${chatId}/queue/${message.id}/send`,
                            { method: "POST" },
                          ),
                        () => void load(),
                      )
                    }
                  >
                    Send now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(
                        () =>
                          adminRequest(`chats/${chatId}/queue/${message.id}`, {
                            method: "DELETE",
                          }),
                        () => void load(),
                      )
                    }
                  >
                    Remove from queue
                  </Button>
                </div>
              )}
              {message.output
                ?.filter((o) => o.type === "function_call" && needsInput(o, message))
                .map((call, i) => (
                  <ToolCall
                    key={call.call_id || i}
                    call={call}
                    message={message}
                    chatId={chatId}
                    reload={() => void load()}
                  />
                ))}
            </article>;
          })}
          {!messages.length && !chatId && (
            <div className="py-12 text-center">
              <h2 className="text-lg font-medium">
                What would you like to work on?
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Manage your server and projects from this conversation.
              </p>
            </div>
          )}
        </div>
      </div>
      <div data-chat-composer-dock className={`relative mx-auto w-full max-w-(--tc-shell-max-w) shrink-0 px-1 pb-1 pt-2 md:px-4 md:pb-2 ${streamlined ? "md:px-0 md:pb-0" : ""}`}>
        {awayFromBottom ? <Button variant="outline" size="icon" className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full bg-background" aria-label="Scroll to latest message" onClick={followLatest}><ArrowDown className="size-4" /></Button> : null}
        <TaskChatComposer
          key={draftKey || chatId || "new"}
          draftKey={draftKey}
          voiceControl={voice}
          voiceDisabled={sending}
          onAdd={(body, _reopen, _reassignment, attachmentIds) => send(body, attachmentIds)}
          onStop={working ? async () => { await adminRequest(`chats/${chatId}/messages/${last.id}/cancel`, { method: "POST" }); await load(); } : undefined}
          workMode="standard"
          modeMenu={{ value: mode, onChange: setMode, options: [{ value: "full", label: "Full access" }, { value: "auto", label: "Auto approval" }, { value: "ask", label: "Ask before tools" }] }}
          placeholder="Message Admin — describe what you want done…"
          disabled={sending || !selectedModel}
          disabledReason={sending ? "Sending…" : "Loading model…"}
          onAttachImage={attach}
          mobile={isMobile}
        />
      </div>
    </div>
    </TaskChatPresentationProvider>
  );
}
