import { useState } from "react";
import {
  Plus,
  Play,
  Pause,
  Pencil,
  History,
  Trash2,
  CalendarClock,
} from "lucide-react";
import {
  defaultAdminModel,
  adminJson,
  adminRequest,
  adminUrl,
  type AdminSchedule,
  type AdminScheduleRun,
  type AdminWorkspace,
  type AdminModels,
} from "../../api/native-admin";
import { useAdminAction, useAdminQuery } from "../../hooks/useNativeAdmin";
import { useNavigate } from "../../lib/router";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  AdminHeading,
  AdminError,
  AdminModelSelect,
  AdminPrompt,
} from "./AdminControls";
function ScheduleEditor({
  schedule,
  onClose,
}: {
  schedule?: AdminSchedule;
  onClose: () => void;
}) {
  const workspaces = useAdminQuery<AdminWorkspace[]>("state/workspaces");
  const models = useAdminQuery<AdminModels>("chats/models");
  const action = useAdminAction();
  const [name, setName] = useState(schedule?.name || "");
  const [prompt, setPrompt] = useState(schedule?.prompt || "");
  const [model, setModel] = useState(schedule?.model_id || "");
  const [workspace, setWorkspace] = useState(schedule?.workspace || "");
  const [rule, setRule] = useState(
    schedule?.rrule || "RRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
  );
  const [frequency, setFrequency] = useState(schedule ? "custom" : "daily");
  const [time, setTime] = useState("09:00");
  const [active, setActive] = useState(schedule?.is_active ?? true);
  const effectiveRule =
    frequency === "custom"
      ? rule
      : frequency === "hourly"
        ? "RRULE:FREQ=HOURLY;BYMINUTE=0"
        : `RRULE:FREQ=${frequency === "weekly" ? "WEEKLY;BYDAY=MO" : "DAILY"};BYHOUR=${Number(time.split(":")[0])};BYMINUTE=${Number(time.split(":")[1])}`;
  const selectedWorkspace = workspace || workspaces.data?.[0]?.path || "";
  const selectedModel = model || defaultAdminModel(models.data);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
    >
      <DialogContent className="max-h-full overflow-auto">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(
              () =>
                adminRequest(
                  `automations${schedule ? `/${schedule.id}` : ""}`,
                  adminJson({
                    name,
                    prompt,
                    model_id: selectedModel,
                    workspace: selectedWorkspace,
                    rrule: effectiveRule,
                    is_active: active,
                  }),
                ),
              onClose,
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {schedule ? "Edit scheduled task" : "Create scheduled task"}
            </DialogTitle>
            <DialogDescription>
              Run an Admin conversation automatically on a recurring schedule.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm">
            Name
            <Input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Instructions
            <Textarea
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </label>
          <div className="grid gap-2 text-sm">
            <span>Model</span>
            <AdminModelSelect value={model} onChange={setModel} />
          </div>
          <div className="grid gap-2 text-sm">
            <span>Workspace</span>
            <Select value={selectedWorkspace} onValueChange={setWorkspace}>
              <SelectTrigger aria-label="Workspace">
                <SelectValue placeholder="Create a workspace first" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.data?.map((w) => (
                  <SelectItem key={w.path} value={w.path}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 text-sm">
            <span>Repeat</span>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger aria-label="Repeat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Every day</SelectItem>
                <SelectItem value="hourly">Every hour</SelectItem>
                <SelectItem value="weekly">Every Monday</SelectItem>
                <SelectItem value="custom">Custom schedule</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frequency === "custom" ? (
            <label className="grid gap-2 text-sm">
              Schedule rule
              <Textarea
                required
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                rows={2}
              />
              <span className="text-xs text-muted-foreground">
                Supports iCalendar RRULE schedules in server time (UTC).
              </span>
            </label>
          ) : (
            frequency !== "hourly" && (
              <label className="grid gap-2 text-sm">
                Time (UTC)
                <Input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            )
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Enable scheduled runs
          </label>
          <AdminError error={action.error || workspaces.error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={action.busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={action.busy || !selectedWorkspace || !selectedModel}
            >
              {action.busy ? "Saving…" : "Save task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function RunHistory({
  schedule,
  onClose,
}: {
  schedule: AdminSchedule;
  onClose: () => void;
}) {
  const query = useAdminQuery<AdminScheduleRun[]>(
    `automations/${schedule.id}/runs`,
    true,
    5000,
  );
  const navigate = useNavigate();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-full overflow-auto">
        <DialogHeader>
          <DialogTitle>Run history</DialogTitle>
          <DialogDescription>{schedule.name}</DialogDescription>
        </DialogHeader>
        <AdminError error={query.error} />
        {query.data?.map((run) => (
          <div className="rounded-lg border p-3 space-y-2" key={run.id}>
            <p className="text-sm">
              {run.status} · {new Date(run.created_at).toLocaleString()}
            </p>
            {run.error && (
              <p className="text-sm text-destructive break-words">
                {run.error}
              </p>
            )}
            {run.chat_id && (
              <Button
                variant="outline"
                onClick={() =>
                  navigate(
                    adminUrl("chat", {
                      chatId: run.chat_id!,
                      workspace: schedule.workspace,
                    }),
                  )
                }
              >
                Open conversation
              </Button>
            )}
          </div>
        ))}
        {query.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function AdminScheduled() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminSchedule | "new">();
  const [deleting, setDeleting] = useState<AdminSchedule>();
  const [history, setHistory] = useState<AdminSchedule>();
  const [running, setRunning] = useState<AdminSchedule>();
  const action = useAdminAction();
  const query = useAdminQuery<{ items: AdminSchedule[]; total: number }>(
    `automations?page=${page}&query=${encodeURIComponent(filter)}`,
    true,
    15_000,
  );
  return (
    <div className="space-y-6">
      <AdminHeading
        title="Scheduled tasks"
        description="Automate recurring work across your Admin workspaces."
      >
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Create scheduled task
        </Button>
      </AdminHeading>
      <Input
        aria-label="Filter scheduled tasks"
        placeholder="Filter scheduled tasks…"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setPage(1);
        }}
      />
      <AdminError
        error={query.error || action.error}
        retry={() => void query.refetch()}
      />
      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-4 font-medium">Task</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Next run</th>
              <th className="p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {query.data?.items.map((s) => (
              <tr key={s.id}>
                <td className="p-4">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.model_id}</p>
                </td>
                <td className="p-4">{s.is_active ? "Active" : "Paused"}</td>
                <td className="p-4 whitespace-nowrap">
                  {s.is_active && s.next_run_at
                    ? new Date(s.next_run_at / 1e6).toLocaleString()
                    : "—"}
                </td>
                <td className="p-4">
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing(s)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={action.busy}
                      title={s.is_active ? "Pause" : "Resume"}
                      aria-label={`${s.is_active ? "Pause" : "Resume"} ${s.name}`}
                      onClick={() =>
                        void action.run(() =>
                          adminRequest(`automations/${s.id}/toggle`, {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      {s.is_active ? (
                        <Pause className="size-4" />
                      ) : (
                        <Play className="size-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Run now"
                      aria-label={`Run ${s.name} now`}
                      onClick={() => setRunning(s)}
                    >
                      <CalendarClock className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Run history"
                      aria-label={`History of ${s.name}`}
                      onClick={() => setHistory(s)}
                    >
                      <History className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Delete"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.data?.items.length === 0 && (
          <p className="p-8 text-center text-muted-foreground">
            No scheduled tasks yet.
          </p>
        )}
      </div>
      {(query.data?.total ?? 0) > 30 && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page * 30 >= (query.data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {editing && (
        <ScheduleEditor
          schedule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {history && (
        <RunHistory schedule={history} onClose={() => setHistory(undefined)} />
      )}
      {deleting && (
        <AdminPrompt
          title="Delete scheduled task"
          label=""
          description={`Delete “${deleting.name}” and stop its future runs?`}
          destructive
          confirm="Delete"
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            adminRequest(`automations/${deleting.id}`, { method: "DELETE" })
          }
        />
      )}
      {running && (
        <AdminPrompt
          title="Run scheduled task now"
          label=""
          description={`Start “${running.name}” now with its saved instructions?`}
          confirm="Run now"
          onClose={() => setRunning(undefined)}
          onConfirm={() =>
            adminRequest(`automations/${running.id}/run`, { method: "POST" })
          }
        />
      )}
    </div>
  );
}
