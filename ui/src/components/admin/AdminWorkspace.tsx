import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  File,
  Folder,
  MessageSquare,
  Plus,
  RefreshCw,
  Terminal,
  Upload,
} from "lucide-react";
import {
  adminJson,
  adminRequest,
  adminUrl,
  ADMIN_API,
  type AdminFile,
  type AdminFileContent,
  type AdminWorkspace as Workspace,
  type AdminTerminal,
} from "../../api/native-admin";
import { useAdminAction, useAdminQuery } from "../../hooks/useNativeAdmin";
import { useLocation, useNavigate } from "../../lib/router";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { AdminHeading, AdminError, AdminPrompt } from "./AdminControls";
import { AdminChatList } from "./AdminDashboard";
import { AdminGit } from "./AdminGit";
function joinPath(directory: string, name: string) {
  return `${directory.replace(/\/$/, "")}/${name}`;
}
function validateName(name: string) {
  if (!name || name === "." || name === ".." || /[\/\\\x00]/.test(name))
    throw new Error("Enter a file or folder name without slashes.");
}
function FileEditor({ path, onClose }: { path: string; onClose: () => void }) {
  const query = useAdminQuery<AdminFileContent>(
    `workspace/files/read?path=${encodeURIComponent(path)}`,
  );
  const action = useAdminAction();
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [discard, setDiscard] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    if (query.data && !loaded.current) {
      loaded.current = true;
      setText(query.data.content || "");
      setOriginal(query.data.content || "");
    }
  }, [query.data]);
  const dirty = text !== original;
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const close = () => (dirty ? setDiscard(true) : onClose());
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !action.busy) close();
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-full overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {query.data?.name || path.split("/").pop()}
            </DialogTitle>
            <DialogDescription className="break-all">{path}</DialogDescription>
          </DialogHeader>
          <AdminError error={query.error || action.error} />
          {query.data?.binary ? (
            <p className="text-sm text-muted-foreground">
              This file is binary. Download it to view its contents.
            </p>
          ) : (
            query.data && (
              <Textarea
                aria-label="File contents"
                className="font-mono min-h-80"
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            )
          )}
          <DialogFooter>
            <Button variant="outline" asChild>
              <a
                href={`${ADMIN_API}/workspace/files/download?path=${encodeURIComponent(path)}`}
                download
              >
                <Download className="size-4" />
                Download
              </a>
            </Button>
            <Button variant="outline" onClick={close} disabled={action.busy}>
              Close
            </Button>
            {query.data && !query.data.binary && (
              <Button
                disabled={!dirty || action.busy}
                onClick={() =>
                  void action.run(
                    () =>
                      adminRequest(
                        "workspace/files/write",
                        adminJson({ path, content: text }),
                      ),
                    () => setOriginal(text),
                  )
                }
              >
                {action.busy ? "Saving…" : "Save file"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {discard && (
        <AdminPrompt
          title="Discard unsaved changes?"
          description="Your edits have not been saved."
          label=""
          confirm="Discard changes"
          destructive
          onConfirm={async () => {
            onClose();
          }}
          onClose={() => setDiscard(false)}
        />
      )}
    </>
  );
}
export function AdminWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const root = new URLSearchParams(location.search).get("workspace") || "";
  const [directory, setDirectory] = useState(root);
  const [tab, setTab] = useState("files");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState<"file" | "directory">();
  const [renaming, setRenaming] = useState<AdminFile>();
  const [deleting, setDeleting] = useState<AdminFile>();
  const [renameWorkspace, setRenameWorkspace] = useState(false);
  const [deleteWorkspace, setDeleteWorkspace] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const action = useAdminAction();
  const workspaces = useAdminQuery<Workspace[]>("state/workspaces");
  const workspace = workspaces.data?.find((w) => w.path === root);
  const query = useAdminQuery<{ path: string; entries: AdminFile[] }>(
    `workspace/files?path=${encodeURIComponent(directory)}`,
    !!root,
  );
  useEffect(() => {
    setDirectory(root);
    setSelected("");
  }, [root]);
  if (!root) return <AdminError error="Choose a workspace from the sidebar." />;
  return (
    <div className="space-y-6">
      <AdminHeading
        title={workspace?.name || root.split("/").pop() || "Workspace"}
        description={root}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => navigate(adminUrl("chat", { workspace: root }))}
          >
            <MessageSquare className="size-4" />
            New conversation
          </Button>
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() =>
              void action.run(
                () =>
                  adminRequest<AdminTerminal>(
                    "terminal",
                    adminJson({ cwd: root }),
                  ),
                (t) =>
                  navigate(
                    adminUrl("terminal", {
                      workspace: root,
                      session: t.session_id,
                    }),
                  ),
              )
            }
          >
            <Terminal className="size-4" />
            Terminal
          </Button>
          <Button variant="ghost" onClick={() => setRenameWorkspace(true)}>
            Rename
          </Button>
          <Button variant="ghost" onClick={() => setDeleteWorkspace(true)}>
            Delete workspace
          </Button>
        </div>
      </AdminHeading>
      <AdminError error={action.error || workspaces.error} />
      <div className="flex gap-2 border-b pb-3">
        <Button
          variant={tab === "files" ? "secondary" : "ghost"}
          onClick={() => setTab("files")}
        >
          Files
        </Button>
        <Button
          variant={tab === "chats" ? "secondary" : "ghost"}
          onClick={() => setTab("chats")}
        >
          Conversations
        </Button>
        <Button
          variant={tab === "git" ? "secondary" : "ghost"}
          onClick={() => setTab("git")}
        >
          Changes
        </Button>
      </div>
      {tab === "git" ? (
        <AdminGit root={root} />
      ) : tab === "chats" ? (
        <AdminChatList workspace={root} />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Parent folder"
              disabled={directory === root}
              onClick={() =>
                setDirectory(
                  directory.substring(0, directory.lastIndexOf("/")) || "/",
                )
              }
            >
              <ArrowLeft className="size-4" />
            </Button>
            <p className="min-w-0 flex-1 break-all text-sm text-muted-foreground">
              {directory === root ? "/" : directory.slice(root.length)}
            </p>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh files"
              onClick={() => void query.refetch()}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button variant="outline" onClick={() => setCreating("file")}>
              <Plus className="size-4" />
              File
            </Button>
            <Button variant="outline" onClick={() => setCreating("directory")}>
              <Folder className="size-4" />
              Folder
            </Button>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() => upload.current?.click()}
            >
              <Upload className="size-4" />
              Upload
            </Button>
            <input
              className="hidden"
              ref={upload}
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                void action.run(async () => {
                  for (const file of files) {
                    const body = new FormData();
                    body.append("file", file);
                    body.append("directory", directory);
                    await adminRequest("workspace/files/upload", {
                      method: "POST",
                      body,
                    });
                  }
                });
              }}
            />
          </div>
          <AdminError error={query.error} retry={() => void query.refetch()} />
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Size</th>
                  <th className="p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.data?.entries.map((file) => (
                  <tr key={file.name}>
                    <td className="p-4">
                      <button
                        className="flex items-center gap-3 text-left hover:text-primary break-all"
                        onClick={() =>
                          file.type === "directory"
                            ? setDirectory(joinPath(directory, file.name))
                            : setSelected(joinPath(directory, file.name))
                        }
                      >
                        {file.type === "directory" ? (
                          <Folder className="size-4 shrink-0" />
                        ) : (
                          <File className="size-4 shrink-0" />
                        )}
                        {file.name}
                      </button>
                    </td>
                    <td className="p-4 text-muted-foreground whitespace-nowrap">
                      {file.type === "directory"
                        ? "—"
                        : `${(file.size || 0).toLocaleString()} B`}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRenaming(file)}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(file)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {query.data?.entries.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                This folder is empty.
              </p>
            )}
          </div>
        </section>
      )}
      {selected && (
        <FileEditor
          key={selected}
          path={selected}
          onClose={() => setSelected("")}
        />
      )}
      {creating && (
        <AdminPrompt
          title={`Create ${creating === "directory" ? "folder" : "file"}`}
          confirm="Create"
          onClose={() => setCreating(undefined)}
          onConfirm={(name) => {
            validateName(name);
            return adminRequest(
              "workspace/files/create",
              adminJson({ path: joinPath(directory, name), type: creating }),
            );
          }}
        />
      )}
      {renaming && (
        <AdminPrompt
          title="Rename"
          initial={renaming.name}
          onClose={() => setRenaming(undefined)}
          onConfirm={(name) => {
            validateName(name);
            return adminRequest(
              "workspace/files/move",
              adminJson({
                source: joinPath(directory, renaming.name),
                destination: joinPath(directory, name),
              }),
            );
          }}
        />
      )}
      {deleting && (
        <AdminPrompt
          title={`Delete ${deleting.type === "directory" ? "folder" : "file"}`}
          description={`Permanently delete “${deleting.name}”${deleting.type === "directory" ? " and everything inside it" : ""}?`}
          label=""
          confirm="Delete"
          destructive
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            adminRequest(
              "workspace/files/delete",
              adminJson({ path: joinPath(directory, deleting.name) }),
            )
          }
        />
      )}
      {renameWorkspace && (
        <AdminPrompt
          title="Rename workspace"
          initial={workspace?.name}
          onClose={() => setRenameWorkspace(false)}
          onConfirm={(name) =>
            adminRequest(
              `state/workspace/name?path=${encodeURIComponent(root)}`,
              adminJson({ name }, "PATCH"),
            )
          }
        />
      )}
      {deleteWorkspace && (
        <AdminPrompt
          title="Delete workspace"
          description={`Permanently delete the workspace and its files. Type “${root.split("/").pop()}” to confirm.`}
          label="Workspace name"
          confirm="Delete workspace"
          destructive
          onClose={() => setDeleteWorkspace(false)}
          onConfirm={async (name) => {
            if (name !== root.split("/").pop())
              throw new Error("The workspace name does not match.");
            await adminRequest(
              `state/workspace?path=${encodeURIComponent(root)}`,
              adminJson({ confirm_name: name }, "DELETE"),
            );
            navigate(adminUrl("dashboard"));
          }}
        />
      )}
    </div>
  );
}
