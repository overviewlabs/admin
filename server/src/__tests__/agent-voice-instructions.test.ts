import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveVoiceInstructions } from "../services/agent-voice-instructions.js";
import { readVoiceSettings } from "@whoxos/shared/agent-voice";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture(content = "You are the chief of staff.\nNever narrate tools.\n") {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-instructions-"));dirs.push(root);
  await writeFile(path.join(root, "AGENTS.md"), content);
  return { root, agent: { id: "voice-agent", companyId: "voice-company", name: "CEO", role: "general", adapterType: "codex_local", adapterConfig: { instructionsBundleMode: "external", instructionsRootPath: root, instructionsEntryFile: "AGENTS.md", instructionsFilePath: path.join(root, "AGENTS.md"), env: { PRIVATE_KEY: "never-forward-this" } } } };
}
it("loads the configured source verbatim, including referenced role files, without unrelated files or secrets", async () => {
 const body = "# Role\nRead `SOUL.md`.\n  Keep this spacing.\n";const { root, agent } = await fixture(body);
 await writeFile(path.join(root, "SOUL.md"), "You are chief of staff for WHOXOS.");
 await writeFile(path.join(root, "private-notes.md"), "Unrelated private notes");
 const result = await resolveVoiceInstructions(agent);
 expect(result.text).toContain(body);expect(result.text).toContain("chief of staff for WHOXOS");
 expect(result.sources).toEqual(["AGENTS.md", "SOUL.md"]);
 expect(result.text).not.toContain("never-forward-this");expect(result.text).not.toContain("Unrelated private");
});
it("changes revision for instruction edits and identity changes, but not unrelated runtime secrets", async () => {
 const { root, agent } = await fixture();const before = await resolveVoiceInstructions(agent);
 expect((await resolveVoiceInstructions(agent)).revision).toBe(before.revision);
 agent.adapterConfig.env.PRIVATE_KEY = "rotated-secret";
 expect((await resolveVoiceInstructions(agent)).revision).toBe(before.revision);
 await writeFile(path.join(root, "AGENTS.md"), "You now lead customer operations.");
 const changed = await resolveVoiceInstructions(agent);expect(changed.revision).not.toBe(before.revision);
 expect(changed.text).toContain("customer operations");
 expect((await resolveVoiceInstructions({ ...agent, name: "Morgan" })).revision).not.toBe(changed.revision);
});
it("fails when a configured source is missing instead of silently inventing an identity", async () => {
 const { root, agent } = await fixture();await rm(path.join(root, "AGENTS.md"));
 await expect(resolveVoiceInstructions(agent)).rejects.toThrow("configured instructions");
});
it("refreshes an active session after a voice swap without changing agent instructions", async () => {
 const { agent } = await fixture();
 const settings = readVoiceSettings(null);
 const before = await resolveVoiceInstructions({ ...agent, metadata: { voice: settings } });
 const changedSettings = { ...settings, profiles: { ...settings.profiles, [settings.model]: { ...settings.profiles[settings.model], voice: "Charon" } } };
 const after = await resolveVoiceInstructions({ ...agent, metadata: { voice: changedSettings } });
 expect(after.text).toBe(before.text);
 expect(after.sources).toEqual(before.sources);
 expect(after.revision).not.toBe(before.revision);
 expect((await resolveVoiceInstructions({ ...agent, metadata: { voice: changedSettings } })).revision).toBe(after.revision);
});
it("refreshes the canonical voice even when unrelated legacy preferences are malformed", async () => {
 const { agent } = await fixture();
 const metadata = { voice: { model: "retired-model", profiles: null } };
 const before = await resolveVoiceInstructions({ ...agent, metadata, voiceName: "Charon" });
 const after = await resolveVoiceInstructions({ ...agent, metadata, voiceName: "Puck" });
 expect(after.text).toBe(before.text);
 expect(after.revision).not.toBe(before.revision);
});
it("does not follow instruction symlinks outside the bundle", async () => {
 const { root, agent } = await fixture("Read `SOUL.md`.");
 const outside = await mkdtemp(path.join(os.tmpdir(), "voice-outside-"));dirs.push(outside);
 await writeFile(path.join(outside, "SOUL.md"), "Outside secret");await symlink(path.join(outside, "SOUL.md"), path.join(root, "SOUL.md"));
 expect((await resolveVoiceInstructions(agent)).text).not.toContain("Outside secret");
});
it("uses legacy prompt identity templates without giving templates access to secrets", async () => {
 const result = await resolveVoiceInstructions({ id: "a", companyId: "c", name: "Avery", role: "engineer", adapterConfig: { promptTemplate: "I am {{agent.name}}. {{agent.adapterConfig.env.KEY}}", env: { KEY: "secret" } } });
 expect(result.text).toContain("I am Avery.");expect(result.text).not.toContain("secret");
});
