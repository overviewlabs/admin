import type {
  AdminChat,
  AdminChatEvent,
  AdminMessage,
  AdminOutput,
} from "../api/native-admin";
export function activeAdminMessages(data?: AdminChat | null): AdminMessage[] {
  if (!data) return [];
  const byId = new Map(data.messages.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const result: AdminMessage[] = [];
  let id = data.chat.current_message_id;
  while (id && !seen.has(id)) {
    seen.add(id);
    const message = byId.get(id);
    if (!message) break;
    result.unshift(message);
    id = message.parent_id;
  }
  return result;
}
export function mergeAdminOutput(
  outputs: AdminOutput[],
  next: AdminOutput,
): AdminOutput[] {
  const index = outputs.findIndex(
    (o) =>
      o.type === next.type &&
      (next.call_id
        ? o.call_id === next.call_id
        : next.type === "reasoning"
          ? o.id === next.id
          : !!next.id && o.id === next.id),
  );
  return index < 0
    ? [...outputs, next]
    : outputs.map((o, i) => (i === index ? { ...o, ...next } : o));
}
export function applyAdminChatEvent(
  data: AdminChat | null,
  event: AdminChatEvent,
): AdminChat | null {
  if (!data || data.chat.id !== event.chat_id) return data;
  return {
    ...data,
    chat: { ...data.chat, ...(event.title ? { title: event.title } : {}) },
    messages: data.messages.map((message) =>
      message.id !== event.message_id
        ? message
        : {
            ...message,
            content: message.content + (event.delta || ""),
            output: event.output
              ? mergeAdminOutput(message.output || [], event.output)
              : message.output,
            done: event.done ?? message.done,
          },
    ),
  };
}
