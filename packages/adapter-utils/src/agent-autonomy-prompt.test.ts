import { describe, expect, it } from "vitest";
import { AGENT_AUTONOMY_POLICY } from "@whoxos/shared/agent-autonomy";
import { AGENT_COMMUNICATION_STYLE } from "@whoxos/shared/agent-communication";
import { joinAgentPromptSections, renderWHOXOSWakePrompt } from "./server-utils.js";

describe("platform autonomy at the final runtime prompt seam", () => {
  it.each([false, true])("applies silent skill use after conflicting reusable instructions (resumed %s)", resumedSession => {
    const custom = "When applying a skill, announce its name before starting.";
    const prompt = joinAgentPromptSections([renderWHOXOSWakePrompt(undefined, { resumedSession }), custom]);
    expect(prompt).toContain("The user explicitly requests silent skill use across Overview Labs.");
    expect(prompt.indexOf("This user preference overrides reusable skill/template instructions")).toBeGreaterThan(prompt.indexOf(custom));
    expect(prompt).toContain("Describe the actual task, verified results and actionable blockers instead");
    expect(prompt).toContain("preserve required actions, auditing, permissions and approvals");
  });
  it.each([false, true])("applies to custom no-wake prompts without suppressing agent instructions (resumed %s)", resumedSession => {
    const wake = renderWHOXOSWakePrompt(undefined, { resumedSession });
    expect(wake).toBe("");
    const custom = "Run the configured maintenance procedure. Ask the owner before every routine step.";
    const prompt = joinAgentPromptSections([wake, custom]);
    expect(prompt.startsWith(custom)).toBe(true);
    expect(prompt.split(AGENT_AUTONOMY_POLICY)).toHaveLength(2);
    expect(prompt.indexOf(AGENT_AUTONOMY_POLICY)).toBeGreaterThan(prompt.indexOf(custom));
    expect(prompt).toContain("older generic agent instructions say to ask a human for every routine step");
    expect(prompt).toContain("This policy creates no root access, new credential grant, budget override or delegation");
    expect(prompt).not.toContain("<overview_labs_organization_data>");
  });

  it("adds autonomy even when communication defaults already exist, once across nested assembly", () => {
    const first = joinAgentPromptSections(["Keep the required report format.", AGENT_COMMUNICATION_STYLE]);
    const resumed = joinAgentPromptSections([first, "Continue from the verified handoff."]);
    expect(resumed.split(AGENT_AUTONOMY_POLICY)).toHaveLength(2);
    expect(resumed.split(AGENT_COMMUNICATION_STYLE)).toHaveLength(2);
    expect(resumed).toContain("Keep the required report format.");
    expect(resumed).toContain("Continue from the verified handoff.");
    expect(resumed).toContain("Do not ask them to approve the same spending again");
    expect(resumed).toContain("Dedicated funds do not establish provider entitlements");
  });

  it("preserves scoped current authority without deriving a delegation from human roles or agent titles", () => {
    const current = { asOf: "2026-09-28T00:00:00Z", organization: { id: "company-a" },
      currentHuman: { id: "viewer", membershipRole: "viewer" },
      responsibleHuman: { id: "owner", membershipRole: "owner" },
      agents: [{ id: "ceo", title: "CEO" }], executiveDelegation: null };
    const prompt = joinAgentPromptSections(["Perform the assigned task."], { organizationContext: current });
    const data = JSON.parse(prompt.split("<overview_labs_organization_data>\n")[1].split("\n</overview_labs_organization_data>")[0]);
    expect(data).toEqual(current);
    expect(prompt).toContain("do not infer a grant when current evidence is absent or revoked");
    expect(prompt).toContain("Existing cards still require an eligible resolver");
    expect(prompt).toContain("never ask for raw keys or passwords in chat");
    expect(prompt).toContain("ask the smallest clear question in plain language");
  });
});
