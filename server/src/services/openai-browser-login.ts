import { spawn, type ChildProcess } from "node:child_process";
import { parseDeviceLoginPrompt } from "@whoxos/adapter-codex-local/server";

export function supportsOpenAiBrowserLogin() {
  return process.env.OVERVIEW_OPENAI_BROWSER_LOGIN === "true";
}
type Attempt = { child: ChildProcess; prompt?: { url: string; code: string }; error?: string; timer: ReturnType<typeof setTimeout>; ready: Promise<void> };
const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 8;
export function stopOpenAiBrowserLogin(id: string) {
  const attempt = attempts.get(id);
  if (!attempt) return;
  clearTimeout(attempt.timer);
  attempt.child.kill("SIGTERM");
  const killer = setTimeout(() => { if (attempt.child.exitCode === null) attempt.child.kill("SIGKILL"); }, 2000);
  killer.unref();
  attempts.delete(id);
}
export function openAiBrowserLoginState(id: string) {
  const attempt = attempts.get(id);
  return { deviceUrl: attempt?.prompt?.url, deviceCode: attempt?.prompt?.code, browserError: attempt?.error };
}
/** Fixed login command only. No request-supplied executable, arguments, or environment. */
export async function startOpenAiBrowserLogin(id: string, directory: string) {
  if (!supportsOpenAiBrowserLogin()) throw new Error("Browser sign-in is disabled.");
  const existing = attempts.get(id);
  if (existing) { await existing.ready; return openAiBrowserLoginState(id); }
  if (attempts.size >= MAX_ATTEMPTS) throw new Error("Too many sign-in attempts. Finish an existing attempt or try again later.");
  const child = spawn(process.env.OVERVIEW_CODEX_BINARY || "/usr/local/bin/codex", ["-c", 'cli_auth_credentials_store="file"', "login", "--device-auth"], {
    cwd: directory, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: directory, CODEX_HOME: directory, TERM: "dumb", LANG: "C.UTF-8" },
  });
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const timer = setTimeout(() => stopOpenAiBrowserLogin(id), 15 * 60 * 1000);
  timer.unref();
  const attempt: Attempt = { child, timer, ready };
  attempts.set(id, attempt);
  let output = "";
  const consume = (chunk: Buffer) => {
    if (attempt.prompt) return;
    output = (output + chunk.toString()).slice(-16384);
    const prompt = parseDeviceLoginPrompt(output);
    if (prompt) { attempt.prompt = prompt; output = ""; resolveReady(); }
  };
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  child.on("error", () => { attempt.error = "Could not start OpenAI sign-in. Please try again."; resolveReady(); });
  child.on("exit", code => {
    if (code !== 0) attempt.error = "OpenAI sign-in ended or expired. Enable device code login in your ChatGPT security settings, then start sign-in again.";
    resolveReady();
  });
  const promptTimeout = setTimeout(() => {
    if (!attempt.prompt) {
      attempt.error = "OpenAI did not return a sign-in code. Please start sign-in again.";
      child.kill("SIGTERM");
    }
    resolveReady();
  }, 20000);
  promptTimeout.unref();
  await ready;
  clearTimeout(promptTimeout);
  return openAiBrowserLoginState(id);
}
process.once("exit", () => { for (const id of attempts.keys()) stopOpenAiBrowserLogin(id); });
