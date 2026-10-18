import type { TaskChatItem } from "./task-chat-model";
import { toolActivityPresentation } from "./tool-taxonomy";
import { protocolActivityIsRunning, protocolActivityLabel, protocolActivityPresentation } from "./task-chat-activity-presentation";

/** Labels describe observed execution events, never guesses from prompt text. */
export function currentActivityLabel(items: readonly TaskChatItem[], fallback = "Working"): string {
  const flat: TaskChatItem[] = items.flatMap((item) => item.kind === "activity_phase" ? item.items : [item]);
  const seen = new Set<string>();
  for (let i = flat.length - 1; i >= 0; i--) {
    const item = flat[i];
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.kind === "protocol" && item.surface === "runtime_request" && item.status === "pending") {
      return item.requestType === "input" ? "Waiting for your answer" : "Waiting for approval";
    }
    if (item.kind === "tool" && (item.status === "in_progress" || item.status === "pending")) {
      const tool = toolActivityPresentation({ name: item.rawName || item.name, operation: item.toolKind });
      return tool.family === "question" ? "Waiting for your answer" : item.status === "pending" ? "Waiting for approval" : tool.runningLabel;
    }
    if (item.kind === "protocol" && protocolActivityIsRunning(item)) {
      const activity = protocolActivityPresentation(item);
      if (activity) return protocolActivityLabel(item, activity);
    }
  }
  // Completed activity ends its label. Do not resurrect earlier reasoning/text.
  for (let i = flat.length - 1; i >= 0; i--) {
    const item = flat[i];
    if (item.kind === "thinking") return item.streaming ? "Thinking" : fallback;
    if (item.kind === "message") return item.streaming ? "Responding" : fallback;
    if (item.kind === "tool" || item.kind === "protocol") return fallback;
  }
  return fallback;
}
