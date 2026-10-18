import { afterEach, expect, it, vi } from "vitest";
import { resolveVoiceInstructions } from "../services/agent-voice-instructions.js";

const policy = vi.hoisted(() => ({ text: "Current autonomy policy.", version: 1 }));
vi.mock("@whoxos/shared/agent-autonomy", () => ({
  get AGENT_AUTONOMY_POLICY() { return policy.text; },
  get AGENT_AUTONOMY_POLICY_VERSION() { return policy.version; },
}));
afterEach(() => { policy.text = "Current autonomy policy."; policy.version = 1; });

it("refreshes voice instructions when platform autonomy changes without modifying the agent's sources", async () => {
  const agent = { id: "agent", companyId: "company", name: "CEO", role: "ceo", adapterConfig: {
    promptTemplate: "Keep the existing role and report format.",
  } };
  const before = await resolveVoiceInstructions(agent);
  expect((await resolveVoiceInstructions(agent)).revision).toBe(before.revision);
  policy.text = "Updated autonomy policy.";
  const textChanged = await resolveVoiceInstructions(agent);
  expect(textChanged.revision).not.toBe(before.revision);
  expect(textChanged.text).toBe(before.text);
  expect(textChanged.sources).toEqual(before.sources);
  policy.version++;
  const versionChanged = await resolveVoiceInstructions(agent);
  expect(versionChanged.revision).not.toBe(textChanged.revision);
  expect(versionChanged.text).toBe(before.text);
});
