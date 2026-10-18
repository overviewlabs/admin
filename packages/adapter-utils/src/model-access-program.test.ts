import { describe, expect, it } from "vitest";
import { isDaybreakBlueDefault, isStandaloneDaybreakModel, modelAccessProgramLabel } from "./model-access-program.js";

describe("model access-program defaults", () => {
  it("requests Daybreak only for the exact GPT-6 Sol model", () => {
    expect(isDaybreakBlueDefault(" gpt-6-sol ")).toBe(true);
    expect(isStandaloneDaybreakModel("gpt-daybreak-blue-latest")).toBe(true);
    expect(isStandaloneDaybreakModel("agent:codex/gpt-daybreak-red-latest")).toBe(true);
    expect(isStandaloneDaybreakModel("gpt-6-sol")).toBe(false);
    for (const model of [undefined, "", "gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna", "gpt-daybreak-blue-latest", "openrouter/gpt-6-sol"]) {
      expect(isDaybreakBlueDefault(model)).toBe(false);
    }
  });
  it("distinguishes verified access from catalog capability", () => {
    expect(modelAccessProgramLabel("gpt-6-sol")).toBe("GPT-6 Sol · Daybreak (access required)");
    expect(modelAccessProgramLabel("gpt-6-sol", "Sol", true)).toBe("GPT-6 Sol · Daybreak");
    expect(modelAccessProgramLabel("gpt-6.1-sol", "Custom label")).toBe("Custom label");
    expect(modelAccessProgramLabel("gpt-6-sol", modelAccessProgramLabel("gpt-6-sol"))).toBe(modelAccessProgramLabel("gpt-6-sol"));
  });
});
