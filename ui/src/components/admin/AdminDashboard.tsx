import { useRef, useState } from "react";
import {
  FolderOpen,
  MessageSquare,
  Terminal,
  Plus,
  CalendarClock,
  Search,
} from "lucide-react";
import { useNavigate } from "../../lib/router";
import { useAdminAction, useAdminQuery } from "../../hooks/useNativeAdmin";
import {
  adminJson,
  adminRequest,
  adminUrl,
  type AdminWorkspace,
  type AdminChatInfo,
  type AdminTerminal,
  type AdminSchedule,
} from "../../api/native-admin";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AdminConversationList } from "./AdminConversationList";
import { AdminHeading, AdminError, AdminPrompt } from "./AdminControls";

export function CreateAdminWorkspace({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const created = useRef<string>("");
  return (
    <AdminPrompt
      title="Create workspace"
      description="Create a folder for this project's files, chats, and terminals."
      confirm="Create workspace"
      onClose={() => {
        if (created.current)
          navigate(adminUrl("workspace", { workspace: created.current }));
        else onClose();
      }}
      onConfirm={async (name) => {
        const result = await adminRequest<AdminWorkspace>(
          "state/workspaces",
          adminJson({ name }),
        );
        created.current = result.path;
      }}
    />
  );
}
export function AdminChatList({
  workspace,
  compact = false,
}: {
  workspace?: string;
  compact?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<AdminChatInfo>();
  const [deleting, setDeleting] = useState<AdminChatInfo>();
  const navigate = useNavigate();
  const limit = compact ? 8 : 30;
  const query = useAdminQuery<{
    chats: AdminChatInfo[];
    total: number;
    has_more: boolean;
  }>(
    `chats?limit=${limit}&offset=${page * limit}${workspace ? `&workspace=${encodeURIComponent(workspace)}` : "&all_workspaces=true"}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`,
    true,
    30_000,
  );
  const chats = query.data?.chats ?? [];
  const total = query.data?.total;
  return (
    <section className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className={compact ? "text-lg font-medium" : "text-2xl font-semibold tracking-tight"}>
            {compact ? "Recent conversations" : "Conversations"}
          </h2>
          {!compact && <p className="text-sm text-muted-foreground">
            {total == null ? "Your conversations, all in one place." : `${total} conversation${total === 1 ? "" : "s"}${workspace ? " in this workspace" : " across all workspaces"}`}
          </p>}
        </div>
        <Button className="rounded-xl" onClick={() => navigate(adminUrl("chat", { workspace }))}>
          <Plus className="size-4" />
          New conversation
        </Button>
      </div>
      {!compact && (
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 rounded-xl bg-card pl-10 shadow-none"
          aria-label="Filter conversations"
          placeholder="Search conversations or workspaces…"
          value={search}
          maxLength={200}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        </div>
      )}
      <AdminError error={query.error} retry={() => void query.refetch()} />
      <div>
        <AdminConversationList chats={chats} compact={compact}
          onOpen={(chat) => navigate(adminUrl("chat", { chatId: chat.id, workspace: chat.meta?.workspace || workspace }))}
          onRename={setRenaming} onDelete={setDeleting}
        />
        {!chats.length && !query.isPending && !query.isError && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-12 text-center">
            <MessageSquare aria-hidden className="size-8 text-muted-foreground/50" />
            <p className="font-medium">{search ? "No matching conversations" : "Start a conversation"}</p>
            <p className="text-sm text-muted-foreground">{search ? "Try a different title or workspace name." : "Your conversations will appear here."}</p>
          </div>
        )}
      </div>
      {!compact && (page > 0 || query.data?.has_more) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            disabled={!query.data?.has_more}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {compact && !!query.data?.has_more && (
        <Button
          variant="ghost"
          onClick={() => navigate(adminUrl("chats", { workspace }))}
        >
          All conversations
        </Button>
      )}
      {renaming && (
        <AdminPrompt
          title="Rename conversation"
          initial={renaming.title}
          onClose={() => setRenaming(undefined)}
          onConfirm={(title) =>
            adminRequest(`chats/${renaming.id}`, adminJson({ title }, "PATCH"))
          }
        />
      )}
      {deleting && (
        <AdminPrompt
          title="Delete conversation"
          description={`Delete “${deleting.title}” and its messages?`}
          label=""
          confirm="Delete"
          destructive
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            adminRequest(`chats/${deleting.id}`, { method: "DELETE" })
          }
        />
      )}
    </section>
  );
}
export function AdminDashboard() {
  const navigate = useNavigate();
  const action = useAdminAction();
  const [creating, setCreating] = useState(false);
  const workspaces = useAdminQuery<AdminWorkspace[]>("state/workspaces");
  const chats = useAdminQuery<{ total: number }>("chats?limit=1&all_workspaces=true");
  const terminals = useAdminQuery<AdminTerminal[]>("terminal", true, 30_000);
  const scheduled = useAdminQuery<{ total: number; items: AdminSchedule[] }>(
    "automations",
  );
  const metrics = [
    { label: "Workspaces", value: workspaces.data?.length, icon: FolderOpen },
    { label: "Conversations", value: chats.data?.total, icon: MessageSquare },
    { label: "Open terminals", value: terminals.data?.length, icon: Terminal },
    {
      label: "Scheduled tasks",
      value: scheduled.data?.total,
      icon: CalendarClock,
    },
  ];
  return (
    <div className="space-y-6">
      <AdminHeading
        title="Admin"
        description="Manage your server, projects, and scheduled work."
      >
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Create workspace
        </Button>
      </AdminHeading>
      <AdminError
        error={
          workspaces.error ||
          chats.error ||
          terminals.error ||
          scheduled.error ||
          action.error
        }
        retry={() => {
          void workspaces.refetch();
          void chats.refetch();
          void terminals.refetch();
          void scheduled.refetch();
        }}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>{label}</span>
              <Icon className="size-4 shrink-0" />
            </div>
            <p className="text-3xl font-semibold tabular-nums">
              {value ?? "—"}
            </p>
          </div>
        ))}
      </div>
      <section className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => navigate(adminUrl("chat"))}>
          <MessageSquare className="size-4" />
          New conversation
        </Button>
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={() =>
            void action.run(
              () => adminRequest<AdminTerminal>("terminal", adminJson({})),
              (session) =>
                navigate(adminUrl("terminal", { session: session.session_id })),
            )
          }
        >
          <Terminal className="size-4" />
          New terminal
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate(adminUrl("scheduled"))}
        >
          <CalendarClock className="size-4" />
          Scheduled tasks
        </Button>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Workspaces</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workspaces.data?.map((workspace) => (
            <button
              key={workspace.path}
              className="flex gap-3 items-center rounded-xl border p-4 text-left hover:bg-accent transition-colors min-w-0"
              onClick={() =>
                navigate(adminUrl("workspace", { workspace: workspace.path }))
              }
            >
              <FolderOpen className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block font-medium truncate">
                  {workspace.name}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  {workspace.path}
                </span>
              </span>
            </button>
          ))}
        </div>
        {workspaces.data?.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
            <FolderOpen className="size-7 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Create a workspace to organize your files and conversations.
            </p>
            <Button variant="outline" onClick={() => setCreating(true)}>
              Create workspace
            </Button>
          </div>
        )}
      </section>
      <AdminChatList compact />
      {creating && <CreateAdminWorkspace onClose={() => setCreating(false)} />}
    </div>
  );
}
