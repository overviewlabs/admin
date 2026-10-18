import { FolderOpen, Loader2, MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { AdminChatInfo } from "../../api/native-admin";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";

/** The public list1 table layout, adapted to real Admin conversation metadata. */
export function AdminConversationList({ chats, compact, onOpen, onRename, onDelete }: {
  chats: AdminChatInfo[];
  compact: boolean;
  onOpen: (chat: AdminChatInfo) => void;
  onRename: (chat: AdminChatInfo) => void;
  onDelete: (chat: AdminChatInfo) => void;
}) {
  const currentYear = new Date().getFullYear();
  return <div className="@container min-w-0">
    <table className="block w-full table-fixed text-left text-sm @3xl:table">
      <caption className="sr-only">Admin conversations across workspaces</caption>
      <thead className="hidden border-b border-border @3xl:table-header-group">
        <tr>
          <th scope="col" className="w-10"><span className="sr-only">Type</span></th>
          <th scope="col" className="w-40 px-3 py-3 font-semibold text-foreground">Workspace</th>
          <th scope="col" className="px-3 py-3 font-semibold text-foreground">Conversation</th>
          {!compact && <>
            <th scope="col" className="w-44 px-3 py-3 font-semibold text-foreground">Updated</th>
            <th scope="col" className="w-28 px-3 py-3 font-semibold text-foreground">Status</th>
            <th scope="col" className="w-10"><span className="sr-only">Actions</span></th>
          </>}
        </tr>
      </thead>
      <tbody className="block @3xl:table-row-group">
        {chats.map((chat) => {
          const date = new Date(chat.updated_at);
          const validDate = Number.isFinite(date.getTime());
          const updated = validDate ? date.toLocaleString(undefined, {
            month: "short", day: "numeric", ...(date.getFullYear() !== currentYear ? { year: "numeric" as const } : {}),
            hour: "numeric", minute: "2-digit",
          }) : "Unknown date";
          const timestamp = validDate ? date.toISOString() : undefined;
          const workspace = chat.meta?.workspace ? <Badge variant="outline"
            className="max-w-full gap-1 border-(--liveness-blue)/20 bg-(--liveness-blue)/10 text-(--liveness-blue) dark:text-foreground"
            title={chat.meta.workspace}>
            <span className="truncate">{chat.workspace_name || chat.meta.workspace.split("/").filter(Boolean).at(-1) || chat.meta.workspace}</span>
          </Badge> : <span className="text-muted-foreground">General</span>;
          const status = <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden className={`h-4 w-1 shrink-0 rounded-full ${chat.is_active ? "bg-(--liveness-blue)" : "bg-muted-foreground/35"}`} />
            {chat.is_active && <Loader2 aria-hidden className="size-3 animate-spin" />}
            {chat.is_active ? "Working" : "Saved"}
          </span>;
          return <tr key={chat.id} className="flex border-b border-border/70 @3xl:table-row transition-colors last:border-b-0 hover:bg-muted/35 focus-within:bg-muted/35">
            <td className="block w-10 shrink-0 px-2 py-4 align-top text-muted-foreground @3xl:table-cell @3xl:align-middle">
              {chat.meta?.workspace ? <FolderOpen aria-hidden className="size-5" /> : <MessageSquare aria-hidden className="size-5" />}
            </td>
            <td className="hidden px-3 py-4 align-middle @3xl:table-cell">{workspace}</td>
            <td className="block min-w-0 flex-1 px-3 py-4 align-middle @3xl:table-cell">
              <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 @3xl:hidden">{workspace}{status}</div>
              <button className="block w-full rounded-sm text-left font-medium leading-relaxed text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpen(chat)}>
                <span className="block break-words">{chat.title}</span>
              </button>
              {!compact && <time dateTime={timestamp} title={validDate ? date.toLocaleString() : undefined} className="mt-1.5 block text-xs text-muted-foreground @3xl:hidden">{updated}</time>}
            </td>
            {!compact && <>
              <td className="hidden px-3 py-4 align-middle text-xs text-muted-foreground @3xl:table-cell">
                <time dateTime={timestamp} title={validDate ? date.toLocaleString() : undefined}>{updated}</time>
              </td>
              <td className="hidden px-3 py-4 align-middle @3xl:table-cell">{status}</td>
              <td className="block w-10 shrink-0 py-4 text-right align-top @3xl:table-cell @3xl:align-middle">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="rounded-full text-muted-foreground" aria-label={`Actions for ${chat.title}`}><MoreHorizontal className="size-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onRename(chat)}><Pencil /> Rename</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(chat)}><Trash2 /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </>}
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}
