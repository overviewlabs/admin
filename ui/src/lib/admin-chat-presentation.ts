import type { AdminMessage, AdminOutput } from "../api/native-admin";
import type { TaskChatAttachment } from "../components/task-chat/TaskChatBubble";
import type { TaskChatTurnChildItem } from "../components/task-chat/task-chat-model";
import {imagePreviewUrl} from "./image-preview";

/** Only authenticated Admin file routes may become attachment URLs. */
export function adminFileUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const url = value.startsWith("/admin-portal/") ? value.slice("/admin-portal".length) : value;
  return /^\/api\/(?:files|agent-files)\/[a-zA-Z0-9_.-]+(?:\?download=true)?$/.test(url) ? `/admin-portal${url}` : undefined;
}
function textBlocks(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.flatMap((block) => block && typeof block === "object" && typeof block.text === "string" ? [block.text] : []) : [];
}
export function adminProgress(output: AdminOutput[]): string {
  return output.filter((item) => item.type === "message" && item.phase === "commentary")
    .flatMap((item) => textBlocks(item.content)).at(-1) || "";
}
export function adminRuntimeActivity(output: AdminOutput[]): string | undefined {
  const active = output.findLast((item) => item.type === "activity" && item.status === "in_progress");
  return typeof active?.content === "string" ? active.content : undefined;
}
export function adminThinking(item: AdminOutput, message: AdminMessage, index: number): TaskChatTurnChildItem | null {
  if (item.type !== "reasoning") return null;
  const lines = textBlocks(item.summary?.length ? item.summary : item.content);
  return { id: `${message.id}:thinking:${item.id || index}`, kind: "thinking", lines,
    streaming: !message.done && item.status !== "completed", channel: "summary" };
}
export function adminMessagePresentation(message: AdminMessage): { text: string; attachments: TaskChatAttachment[] } {
  const attachments: TaskChatAttachment[] = [];
  const sources = new Map<string, string>();
  const add = (file: Record<string, unknown>, generated: boolean) => {
    const url = adminFileUrl(file.url);
    const id = typeof file.file_id === "string" ? file.file_id : typeof file.id === "string" ? file.id : undefined;
    if (!url || !id || attachments.some((a) => a.contentPath === url)) return;
    attachments.push({ id, issueCommentId: message.id, contentPath: url, openPath: url,
      downloadPath: generated ? `${url.split("?")[0]}?download=true` : url,
      originalFilename: typeof file.name === "string" ? file.name : "attachment",
      contentType: typeof file.content_type === "string" ? file.content_type : typeof file.type === "string" && file.type.includes("/") ? file.type : "application/octet-stream",
      byteSize: typeof file.size === "number" ? file.size : 0,
      previewPath: imagePreviewUrl(file.preview) });
    if (typeof file.source_path === "string") sources.set(file.source_path, url);
  };
  for (const file of message.meta?.files || []) add(file, false);
  for (const item of message.output || []) {
    if (item.type === "file") add(item as unknown as Record<string, unknown>, true);
    if (item.type === "image") for (const file of item.images || []) add({ ...file, source_path: item.source_path }, true);
  }
  const text = message.content.replace(/\]\(([^\n]+?)\)/g, (match, href: string) => {
    const local = href.replace(/^sandbox:/, "");
    const url = adminFileUrl(href) || sources.get(local);
    return url ? `](${url})` : match;
  });
  return { text, attachments };
}
