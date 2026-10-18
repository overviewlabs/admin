import { spawn } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import { resolveWHOXOSInstanceRoot } from "../home-paths.js";
import { conflict, HttpError } from "../errors.js";

export const voiceWorkspaceSchema = z.object({
  target: z.literal("workspace").optional(),
  command: z.string().trim().min(1).max(32_000),
  timeoutMs: z.number().int().min(100).max(60_000).default(30_000),
}).strict();
const running = new Set<string>();
/** No provider process, credentials, host filesystem, or host network in this executor. */
export async function executeVoiceWorkspace(scope: { companyId: string; agentId: string; userId: string; issueId?: string }, raw: unknown) {
  const input = voiceWorkspaceSchema.parse(raw);
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(JSON.stringify({ companyId: scope.companyId, agentId: scope.agentId, userId: scope.userId, issueId: scope.issueId })).digest("hex");
  if (running.has(key)) throw conflict("A workspace command is still running. Wait for its result.");
  running.add(key);
  try {
    const root = path.join(resolveWHOXOSInstanceRoot(), "voice-workspaces");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const workspace = path.join(root, key);
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    if (await realpath(workspace) !== path.join(await realpath(root), key)) throw new Error("Invalid workspace path");
    const args = ["--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin", "--symlink", "usr/lib", "/lib", "--symlink", "usr/sbin", "/sbin", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/home", "--dir", "/home/voice", "--bind", workspace, "/workspace", "--chdir", "/workspace", "--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/home/voice", "--setenv", "LANG", "C.UTF-8", "--", "/bin/sh", "-c", input.command];
    return await new Promise<{ exitCode: number | null; output: string; truncated: boolean; timedOut: boolean; workspace: string }>((resolve, reject) => {
      const child = spawn("/usr/bin/bwrap", args, { stdio: ["ignore", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin" }, detached: true });
      let output = "", truncated = false, timedOut = false;
      const timer = setTimeout(() => { timedOut = true; if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } }, input.timeoutMs);
      const stdoutDecoder = new StringDecoder("utf8"), stderrDecoder = new StringDecoder("utf8");
      const collect = (text: string) => { const remaining = 48_000 - output.length; output += text.slice(0, Math.max(0, remaining)); if (text.length > remaining) truncated = true; };
      child.stdout.on("data", (chunk: Buffer) => collect(stdoutDecoder.write(chunk)));
      child.stderr.on("data", (chunk: Buffer) => collect(stderrDecoder.write(chunk)));
      child.once("error", () => { clearTimeout(timer); reject(new HttpError(503, "Voice workspace is unavailable. No alternate runtime was started.")); });
      child.once("close", code => { clearTimeout(timer); collect(stdoutDecoder.end()); collect(stderrDecoder.end()); resolve({ exitCode: code, output, truncated, timedOut, workspace: "/workspace" }); });
    });
  } finally { running.delete(key); }
}
