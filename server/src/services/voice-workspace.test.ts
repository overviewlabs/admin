import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeVoiceWorkspace } from "./voice-workspace.js";
let home: string;
beforeAll(async () => { home = await mkdtemp(path.join(os.tmpdir(), "voice-tools-")); vi.stubEnv("WHOXOS_HOME", home); vi.stubEnv("WHOXOS_INSTANCE_ID", "fixture"); vi.stubEnv("SECRET_TEST_MARKER", "must-not-leak"); });
afterAll(async () => { vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }); });
const scope = { companyId: "org", agentId: "agent", userId: "user" };
it("runs code without a model and persists only the scoped workspace", async () => {
  expect(await executeVoiceWorkspace(scope, { command: "printf 'print(6*7)' > answer.py; python3 answer.py" })).toMatchObject({ exitCode: 0, output: "42\n" });
  expect(await executeVoiceWorkspace(scope, { command: "cat answer.py" })).toMatchObject({ exitCode: 0, output: "print(6*7)" });
  expect((await executeVoiceWorkspace({ ...scope, companyId: "other" }, { command: "test ! -f answer.py" })).exitCode).toBe(0);
});
it("does not expose host credentials, filesystem, or network", async () => {
  const result = await executeVoiceWorkspace(scope, { command: "test -z \"$SECRET_TEST_MARKER\" && test ! -e /var/lib/whoxos && test ! -e /root/.codex && test ! -e /etc/shadow && python3 -c 'import socket; s=socket.socket(); s.settimeout(.2); assert s.connect_ex((\"127.0.0.1\",3100)) != 0'" });
  expect(result.exitCode).toBe(0);
});
it("terminates timed out work and bounds returned output", async () => {
  expect((await executeVoiceWorkspace(scope, { command: "sleep 5", timeoutMs: 100 })).timedOut).toBe(true);
  const result = await executeVoiceWorkspace(scope, { command: "python3 -c 'print(\"x\"*100000)'" });
  expect(result.output.length).toBe(48000); expect(result.truncated).toBe(true);
});
it("runs JavaScript tests locally and preserves scope regardless of property insertion order", async () => {
  const scoped = { ...scope, issueId: "chat-one" };
  const result = await executeVoiceWorkspace(scoped, { command: "printf 'const assert = require(\"node:assert/strict\"); assert.equal(6 * 7, 42); console.log(\"passed\")' > check.cjs; node check.cjs" });
  expect(result).toMatchObject({ exitCode: 0, output: "passed\n" });
  expect(await executeVoiceWorkspace({ issueId: "chat-one", userId: scope.userId, agentId: scope.agentId, companyId: scope.companyId }, { command: "test -f check.cjs" })).toMatchObject({ exitCode: 0 });
  for (const isolated of [{ ...scoped, agentId: "other" }, { ...scoped, userId: "other" }, { ...scoped, issueId: "chat-two" }]) {
    expect(await executeVoiceWorkspace(isolated, { command: "test ! -f check.cjs" })).toMatchObject({ exitCode: 0 });
  }
});
it("returns a recoverable conflict for concurrent commands and releases a failed command's lock", async () => {
  const pending = executeVoiceWorkspace(scope, { command: "sleep .2; exit 7" });
  await expect(executeVoiceWorkspace(scope, { command: "echo duplicate" })).rejects.toMatchObject({ status: 409 });
  expect(await pending).toMatchObject({ exitCode: 7, timedOut: false });
  expect(await executeVoiceWorkspace(scope, { command: "printf recovered" })).toMatchObject({ exitCode: 0, output: "recovered" });
});
it("decodes UTF-8 output split across subprocess chunks without corrupting the text", async () => {
  const result = await executeVoiceWorkspace(scope, { command: "python3 -c 'import os,time; b=\"✓🌍\".encode(); os.write(1,b[:1]); time.sleep(.1); os.write(1,b[1:5]); time.sleep(.1); os.write(1,b[5:])'" });
  expect(result).toMatchObject({ exitCode: 0, output: "✓🌍" });
});
it("kills timed out descendant work instead of leaving a later workspace mutation", async () => {
  const isolated = { ...scope, issueId: "timeout-descendant" };
  expect(await executeVoiceWorkspace(isolated, { command: "(sleep .6; printf escaped > after-timeout) & wait", timeoutMs: 100 })).toMatchObject({ timedOut: true });
  await new Promise(resolve => setTimeout(resolve, 700));
  expect(await executeVoiceWorkspace(isolated, { command: "test ! -f after-timeout" })).toMatchObject({ exitCode: 0 });
});
