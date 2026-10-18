import { describe, expect, it } from "vitest";
import { stripSkillAnnouncements } from "./quiet-agent-text.js";

describe("quiet assistant skill use", () => {
  it.each([
    "I’m using the WHOXOS skill to coordinate the handoff.",
    "I'm using the **website-builder** skill for this task.",
    "I'll use the deployment skill.",
    "We are applying the `WHOXOS` skill.",
    "Using the PDF skill to read the document.",
    "- I’m loading the WHOXOS skill.",
    "I’m using the WHOXOS\nskill to coordinate the handoff.",
    "**Skills in use:** WHOXOS",
  ])("removes a routine announcement: %s", (text) => {
    expect(stripSkillAnnouncements(text)).toBe("");
  });
  it("preserves substantive work alongside an announcement", () => {
    expect(stripSkillAnnouncements("I'll check the app. I’m using the WHOXOS skill to coordinate the handoff. Then I'll assign implementation."))
      .toBe("I'll check the app. Then I'll assign implementation.");
    expect(stripSkillAnnouncements("Checking onboarding.\n\nI'm using the WHOXOS skill.\n\n**Verified:** the invitation works."))
      .toBe("Checking onboarding.\n\n**Verified:** the invitation works.");
    expect(stripSkillAnnouncements("Checking onboarding\n\nI’m using the WHOXOS skill\n\nVerified invitations."))
      .toBe("Checking onboarding\n\nVerified invitations.");
  });
  it.each([
    "The WHOXOS skill was installed successfully.",
    "I'll review the skill permissions.",
    "I'm using the debugger to verify onboarding.",
    "The skill failed to load: permission denied.",
    '> I’m using the WHOXOS skill to coordinate the handoff.',
    '```text\nI’m using the WHOXOS skill to coordinate the handoff.\n```',
    '    I’m using the WHOXOS skill to coordinate the handoff.',
    'Example: "I’m using the WHOXOS skill."',
    "[SKILL.md](/files/SKILL.md) was updated.",
  ])("preserves task results and examples: %s", (text) => {
    expect(stripSkillAnnouncements(text)).toBe(text);
  });
  it("holds unfinished announcements while streaming and releases legitimate updates", () => {
    expect(stripSkillAnnouncements("I’m using the WHOXOS", true)).toBe("");
    expect(stripSkillAnnouncements("Checking the app. I’m using the WHOXOS", true)).toBe("Checking the app.");
    expect(stripSkillAnnouncements("I’m using the debugger", false)).toBe("I’m using the debugger");
    expect(stripSkillAnnouncements("I’m checking onboarding", true)).toBe("I’m checking onboarding");
  });
  it("preserves code whitespace when another paragraph is removed", () => {
    const code = "```text\nI'm using the WHOXOS skill.\n\n\n\nkeep these blank lines\n```";
    expect(stripSkillAnnouncements(`I'm using the PDF skill.\n\n${code}`)).toBe(code);
    const indented = "    I'm using the WHOXOS skill.\n";
    expect(stripSkillAnnouncements(`${indented}\nI'm using the PDF skill.`)).toBe(`${indented}\n`);
  });
});
