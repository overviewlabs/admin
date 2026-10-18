export const ADMIN_API = "/admin-portal/api";
let sessionReadyUntil = 0;
let sessionRequest: Promise<void> | undefined;
export async function ensureAdminSession() {
  if (Date.now() < sessionReadyUntil) return;
  if (!sessionRequest)
    sessionRequest = (async () => {
      const response = await fetch(`${ADMIN_API}/auth`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok || !(await response.json()).authenticated)
        throw new Error(
          "Your Admin session could not be verified. Sign in again.",
        );
      sessionReadyUntil = Date.now() + 30_000;
    })().finally(() => {
      sessionRequest = undefined;
    });
  return sessionRequest;
}
export async function adminRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  await ensureAdminSession();
  const response = await fetch(`${ADMIN_API}/${path}`, {
    credentials: "same-origin",
    ...init,
  });
  const json = response.headers
    .get("content-type")
    ?.includes("application/json");
  const body = json ? await response.json() : null;
  if (!response.ok)
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.error === "string"
          ? body.error
          : `Admin request failed (${response.status}). Try again.`,
    );
  if (!json && response.status !== 204)
    throw new Error(
      "Admin returned an unexpected response. Please sign in again.",
    );
  return body as T;
}
export const adminJson = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const adminUrl = (
  view: string,
  values: Record<string, string | undefined> = {},
) => {
  const params = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(values))
    if (value) params.set(key, value);
  return `/admin?${params}`;
};
export const adminSocketUrl = (path: string) =>
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/admin-portal/api/${path}`;
export interface AdminWorkspace {
  path: string;
  name: string;
  unread_count: number;
  external?: boolean;
  server_id?: string;
  remote_path?: string;
}
export interface AdminModels {
  models: Array<{ id: string; name: string }>;
  default: string | null;
}
export interface AdminTerminal {
  session_id: string;
  cwd: string;
}
export interface AdminChatInfo {
  id: string;
  title: string;
  updated_at: number;
  current_message_id: string | null;
  is_active?: boolean;
  workspace_name?: string | null;
  meta?: {
    workspace?: string;
    last_model?: string;
    params?: Record<string, unknown>;
  };
}
export interface AdminOutput {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  status?: string;
  arguments?: Record<string, unknown>;
  output?: unknown;
  content?: unknown;
  summary?: Array<{ text?: string }>;
  phase?: string;
  source_path?: string;
  images?: Array<Record<string, unknown>>;
}
export interface AdminMessage {
  id: string;
  parent_id: string | null;
  role: string;
  content: string;
  done: boolean;
  output: AdminOutput[] | null;
  meta?: { error?: string; queued?: boolean; files?: Array<Record<string, unknown>>; feedback?: { vote: "up" | "down"; reason?: string | null } };
  created_at?: number;
}
export interface AdminChat {
  chat: AdminChatInfo;
  messages: AdminMessage[];
}
export interface AdminChatEvent {
  chat_id: string;
  message_id?: string;
  delta?: string;
  output?: AdminOutput;
  done?: boolean;
  error?: string;
  title?: string;
  pending_inputs_processed?: boolean;
  async_subagent_pending?: boolean;
}
export interface AdminSchedule {
  id: string;
  name: string;
  prompt: string;
  model_id: string;
  workspace: string;
  rrule: string;
  is_active: boolean;
  next_run_at: number | null;
  last_run?: AdminScheduleRun | null;
}
export interface AdminScheduleRun {
  id: string;
  chat_id: string | null;
  status: string;
  error: string | null;
  created_at: number;
}
export interface AdminFile {
  name: string;
  type: string;
  size?: number;
  modified?: string;
}
export interface AdminFileContent {
  path: string;
  name: string;
  binary: boolean;
  content: string | null;
  size: number;
  language?: string;
}

export function defaultAdminModel(models?: AdminModels) {
  return (
    models?.models.find((m) => m.id === models.default)?.id ||
    models?.models[0]?.id ||
    ""
  );
}
