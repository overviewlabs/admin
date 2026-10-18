import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { buildAgentMentionHref, buildIssueReferenceHref, buildProjectMentionHref, buildUserMentionHref } from "@whoxos/shared";
import type { MarkdownEditor, MarkdownEditorRef, MentionOption } from "./MarkdownEditor";
import { ChatInput, ChatInputEditor, type ChatInputHandle, type BaseMentionItem } from "./ui/chat-input";
import { useEditorAutocomplete, type SlashCommandOption } from "@/context/EditorAutocompleteContext";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof MarkdownEditor> & { children?: ReactNode; imageAttachmentOnly?: boolean };

function mentionItem(option: MentionOption): BaseMentionItem {
  const label = option.kind === "issue" ? option.issueIdentifier ?? option.name : `@${option.name}`;
  const href = option.kind === "issue" && option.issueIdentifier ? buildIssueReferenceHref(option.issueIdentifier)
    : option.kind === "project" && option.projectId ? buildProjectMentionHref(option.projectId, option.projectColor ?? null)
    : option.kind === "user" && option.userId ? buildUserMentionHref(option.userId)
    : buildAgentMentionHref(option.agentId ?? option.id.replace(/^agent:/, ""), option.agentIcon ?? null);
  return { id: option.id, name: option.name, text: `[${label.replace(/[\[\]]/g, "\\$&")}](${href})` };
}

function commandItem(option: SlashCommandOption): BaseMentionItem {
  if (option.kind === "action") return { id: option.id, name: option.command, text: `/${option.command}` };
  const name = option.kind === "routine" ? `routine:${option.name}` : option.slug;
  return { id: option.id, name, text: `[/${name}](${option.href})` };
}

/** App bridge for the simple-ai input: retain existing Markdown payloads,
 * identity links, draft refs, attachments and slash-command dispatch. */
export const ChatMessageEditor = forwardRef<MarkdownEditorRef, Props>(function ChatMessageEditor({
  value, onChange, placeholder = "Message…", readOnly = false, mentions = [], actionCommands = [],
  onSubmit, submitOnEnter = false, imageUploadHandler, onDropFile, fileDropTarget = "editor",
  bordered = true, className, contentClassName, onBlur, children, imageAttachmentOnly = false,
}, ref) {
  const inputRef = useRef<ChatInputHandle>(null);
  const { slashCommands } = useEditorAutocomplete();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const configs = useMemo(() => ({
    entities: { trigger: "@", items: (query: string) => mentions.filter(item => item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 20).map(mentionItem) },
    commands: { trigger: "/", items: (query: string) => [...actionCommands, ...slashCommands].filter(item => !(item.kind === "action" && item.disabled)).filter(item => [item.name, ...item.aliases].some(name => name.toLowerCase().includes(query.toLowerCase()))).slice(0, 20).map(commandItem) },
  }), [mentions, actionCommands, slashCommands]);
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => inputRef.current?.clear(),
    insertMarkdown: text => inputRef.current?.insertText(text),
  }), []);

  async function acceptFiles(files: File[]) {
    setUploadError(null);
    for (const file of files) {
      try {
        if (file.type.startsWith("image/") && imageUploadHandler) {
          const url = await imageUploadHandler(file);
          if (!imageAttachmentOnly) inputRef.current?.insertText(`![${file.name.replace(/[\[\]]/g, "\\$&")}](${url})`);
        } else if (onDropFile) await onDropFile(file);
      } catch (error) { setUploadError(error instanceof Error ? error.message : "The file could not be uploaded."); }
    }
  }

  return <ChatInput
    ref={inputRef}
    value={value}
    onChange={onChange}
    disabled={readOnly}
    mentions={configs}
    onSubmit={() => onSubmit?.()}
    submitKey={submitOnEnter ? "enter" : "mod-enter"}
    onBlur={onBlur}
    className={cn("simple-chat-input", !bordered && "border-0 bg-transparent shadow-none dark:bg-transparent", className)}
  >
    <ChatInputEditor
      placeholder={placeholder}
      className={cn(bordered ? "px-3" : "px-0", contentClassName)}
      onPaste={event => {
        if (readOnly || event.defaultPrevented) return false;
        // The owning composer captures document paste. Handle only images here
        // so mixed image/document clipboard data cannot attach a document twice.
        const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith("image/") && Boolean(imageUploadHandler));
        if (!files.length) return false;
        void acceptFiles(files);return true;
      }}
      onDrop={event => {
        if (readOnly || event.defaultPrevented || fileDropTarget === "parent") return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith("image/") ? Boolean(imageUploadHandler) : Boolean(onDropFile));
        if (!files.length) return false;
        void acceptFiles(files);return true;
      }}
    />
    {uploadError ? <p role="alert" className="px-3 text-xs text-destructive">{uploadError}</p> : null}
    {children}
  </ChatInput>;
});
