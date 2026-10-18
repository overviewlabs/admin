// @vitest-environment node

import { describe, expect, it } from "vitest";
import { codexReasoningEffortOptions } from "./codex-reasoning-effort";

describe("codexReasoningEffortOptions", () => {
  it("exposes only the supported GPT-6 Astra reasoning efforts", () => {
    expect(codexReasoningEffortOptions("gpt-6-astra")).toEqual([
      { value: "", label: "Default" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "X-High" },
      { value: "max", label: "Max" },
      { value: "ultra", label: "Ultra" },
    ]);
  });

  it("matches the new Codex model capabilities", () => {
    expect(codexReasoningEffortOptions("gpt-6-sol")).toEqual(codexReasoningEffortOptions("gpt-6-astra"));
    expect(codexReasoningEffortOptions("gpt-6-luna").map((option) => option.value))
      .toEqual(["", "low", "medium", "high", "xhigh", "max"]);
  });

  it("preserves the existing choices for other and manual models", () => {
    expect(codexReasoningEffortOptions("manual-model").map((option) => option.value)).toEqual([
      "",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });
});
