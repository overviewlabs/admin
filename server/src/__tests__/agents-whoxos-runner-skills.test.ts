import { describe, expect, it } from "vitest";
import {
  normalizeWHOXOSOperationalSkillPreference,
  normalizeWHOXOSRunnerAdapterConfig,
  WHOXOS_OPERATIONAL_SKILL_KEY,
  resolveLegacyWHOXOSDesiredSkillNames,
} from "@whoxos/adapter-utils/server-utils";

const legacyConfig = {
  whoxosSkillSync: {
    desiredSkills: [WHOXOS_OPERATIONAL_SKILL_KEY],
  },
};

describe("whoxos_runner operational skill normalization", () => {
  it("applies full-auto native runner defaults at persistence boundaries", () => {
    expect(normalizeWHOXOSRunnerAdapterConfig("whoxos_runner", {})).toEqual({
      provider: "codex",
      model: "gpt-5.6-sol",
      codexPermissionMode: "never",
      lifecycleMode: "per_turn",
    });
  });

  it("repairs an existing blank model without replacing an explicit model", () => {
    expect(normalizeWHOXOSRunnerAdapterConfig("whoxos_runner", { model: "" }))
      .toMatchObject({ model: "gpt-5.6-sol" });
    expect(normalizeWHOXOSRunnerAdapterConfig("whoxos_runner", { model: "gpt-5.5" }))
      .toMatchObject({ model: "gpt-5.5" });
  });

  it("does not replace a non-Codex provider model with the Codex default", () => {
    expect(normalizeWHOXOSRunnerAdapterConfig("whoxos_runner", {
      provider: "claude_managed",
      model: "claude-sonnet-5",
    })).toMatchObject({
      provider: "claude_managed",
      model: "claude-sonnet-5",
    });
  });

  it("removes the legacy operational skill while preserving optional skills", () => {
    const normalized = normalizeWHOXOSOperationalSkillPreference("whoxos_runner", {
      whoxosSkillSync: {
        desiredSkills: [WHOXOS_OPERATIONAL_SKILL_KEY, "company-1/reviewer"],
      },
    });

    expect(normalized).toEqual({
      whoxosSkillSync: { desiredSkills: ["company-1/reviewer"] },
    });
  });

  it("restores the required operational skill through the legacy resolver after switching back", () => {
    const normalized = normalizeWHOXOSOperationalSkillPreference("whoxos_runner", legacyConfig);
    expect(resolveLegacyWHOXOSDesiredSkillNames(normalized, [{
      key: WHOXOS_OPERATIONAL_SKILL_KEY,
      runtimeName: "whoxos",
    }])).toEqual([WHOXOS_OPERATIONAL_SKILL_KEY]);
  });

  it("does not change direct adapter preferences", () => {
    expect(normalizeWHOXOSOperationalSkillPreference("codex_local", legacyConfig)).toBe(legacyConfig);
  });
});
