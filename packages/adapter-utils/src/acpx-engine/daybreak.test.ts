import { describe, expect, it } from "vitest";
import { buildCodexStartupConfig } from "./execute.js";

describe("Codex ACP Daybreak configuration", () => {
  it("sets Daybreak before the ACP process starts while retaining existing settings", () => {
    const config = buildCodexStartupConfig({ existingConfig: JSON.stringify({ daybreak: false, features: { plugins: false } }), requestedModel: "gpt-6-sol", requestedThinkingEffort: "high", fastMode: true });
    expect(JSON.parse(config.value!)).toMatchObject({ model: "gpt-6-sol", daybreak: true, model_reasoning_effort: "high", service_tier: "fast", features: { plugins: false, fast_mode: true } });
  });
  it("leaves other models' Daybreak configuration unchanged", () => {
    for (const model of ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"]) {
      const config = buildCodexStartupConfig({ existingConfig: JSON.stringify({ daybreak: false }), requestedModel: model, requestedThinkingEffort: "", fastMode: false });
      expect(JSON.parse(config.value!).daybreak).toBe(false);
    }
  });
});
