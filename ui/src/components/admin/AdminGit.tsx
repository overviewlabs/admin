import { useState } from "react";
import { adminRequest, adminJson } from "../../api/native-admin";
import { useAdminAction, useAdminQuery } from "../../hooks/useNativeAdmin";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AdminError } from "./AdminControls";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
type GitFile = {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
};
export function AdminGit({ root }: { root: string }) {
  const query = useAdminQuery<{
    is_repo: boolean;
    branch: string;
    ahead: number;
    behind: number;
    files: GitFile[];
  }>(`git/status?root=${encodeURIComponent(root)}`, true, 15_000);
  const action = useAdminAction();
  const [message, setMessage] = useState("");
  const [diff, setDiff] = useState<GitFile>();
  const changes = useAdminQuery<{
    diff?: string;
    files?: Array<{
      path: string;
      hunks: Array<{
        header: string;
        lines: Array<{ type: string; content: string }>;
      }>;
    }>;
  }>(
    `git/diff?root=${encodeURIComponent(root)}&file=${encodeURIComponent(diff?.path || "")}&staged=${!!diff?.staged}&untracked=${diff?.status === "untracked"}`,
    !!diff,
  );
  if (query.data && !query.data.is_repo)
    return (
      <p className="text-sm text-muted-foreground">
        This workspace is not a Git repository yet. Ask Admin to initialize or
        clone one in this workspace.
      </p>
    );
  return (
    <section className="space-y-4">
      <AdminError error={query.error || action.error} />
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm">
          {query.data?.branch} · {query.data?.ahead || 0} ahead ·{" "}
          {query.data?.behind || 0} behind
        </p>
        {["fetch", "pull", "push"].map((command) => (
          <Button
            key={command}
            variant="outline"
            disabled={action.busy}
            onClick={() =>
              void action.run(() =>
                adminRequest(`git/${command}`, adminJson({ root })),
              )
            }
          >
            {command.charAt(0).toUpperCase() + command.slice(1)}
          </Button>
        ))}
      </div>
      <div className="rounded-xl border divide-y">
        {query.data?.files.map((file) => (
          <div
            key={file.path}
            className="flex flex-wrap items-center gap-3 p-3 text-sm"
          >
            <button
              className="flex-1 min-w-0 break-all text-left hover:text-primary"
              onClick={() => setDiff(file)}
            >
              {file.status} · {file.path}
            </button>
            {file.staged && (
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() =>
                    adminRequest(
                      "git/unstage",
                      adminJson({ root, files: [file.path] }),
                    ),
                  )
                }
              >
                Unstage
              </Button>
            )}
            {file.unstaged && (
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() =>
                    adminRequest(
                      "git/stage",
                      adminJson({ root, files: [file.path] }),
                    ),
                  )
                }
              >
                Stage
              </Button>
            )}
          </div>
        ))}
        {query.data?.files.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            Working tree is clean.
          </p>
        )}
      </div>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(
            () => adminRequest("git/commit", adminJson({ root, message })),
            () => setMessage(""),
          );
        }}
      >
        <Input
          className="flex-1"
          aria-label="Commit message"
          placeholder="Commit message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button
          disabled={
            action.busy ||
            !message.trim() ||
            !query.data?.files.some((f) => f.staged)
          }
        >
          Commit staged changes
        </Button>
      </form>
      {diff && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDiff(undefined);
          }}
        >
          <DialogContent className="sm:max-w-4xl max-h-full overflow-auto">
            <DialogHeader>
              <DialogTitle>Changes</DialogTitle>
              <DialogDescription>{diff.path}</DialogDescription>
            </DialogHeader>
            <AdminError error={changes.error} />
            <pre className="text-xs whitespace-pre-wrap break-all">
              {changes.data
                ? (changes.data.diff ??
                  changes.data.files
                    ?.map(
                      (f) =>
                        `${f.path}\n${f.hunks.map((h) => `${h.header}\n${h.lines.map((l) => `${l.type === "added" ? "+" : l.type === "removed" ? "-" : " "}${l.content}`).join("\n")}`).join("\n")}`,
                    )
                    .join("\n\n"))
                : ""}
            </pre>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
