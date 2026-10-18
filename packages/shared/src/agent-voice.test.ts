import { describe, expect, it } from "vitest";
import { MAX_AGENTS_PER_ORGANIZATION, VOICE_NAMES, readVoiceSettings, voiceSettingsSchema, voiceSessionRequestSchema } from "./agent-voice.js";
describe("agent voice settings", () => {
  it("admits 50 agents independently of the voice catalog", () => {
    expect(MAX_AGENTS_PER_ORGANIZATION).toBe(50);
    expect(MAX_AGENTS_PER_ORGANIZATION).toBeGreaterThan(VOICE_NAMES.length);
  });
  it("keeps an unassigned agent's voice disabled without losing delivery preferences", () => {
    const saved = readVoiceSettings(null);
    saved.enabled = true;
    saved.profiles[saved.model].instructions = "Speak softly.";
    expect(readVoiceSettings({ voice: saved }, null)).toMatchObject({ enabled: false, profiles: { [saved.model]: { instructions: "Speak softly." } } });
    expect(saved.enabled).toBe(true);
  });
  it("starts disabled without credentials for new agents", () => {
    expect(readVoiceSettings(null)).toMatchObject({ enabled: false, secretId: null });
  });
  it("keeps independent model profiles and rejects unsupported model, voice, and reasoning values", () => {
    const settings = readVoiceSettings(null);
    settings.profiles["gemini-3.8-live"].voice = "Puck";
    expect(voiceSettingsSchema.parse(settings).profiles["gemini-3.8-live-extended-thinking"].voice).toBe("Kore");
    expect(voiceSettingsSchema.safeParse({ model: "unrestricted-provider" }).success).toBe(false);
    settings.profiles[settings.model].thinking = "minimal" as any;
    expect(voiceSettingsSchema.safeParse(settings).success).toBe(false);
  });
  it("defaults to Extended Thinking High without changing a saved standard Live selection or its profiles", () => {
    const defaults = readVoiceSettings(null);
    expect(defaults.model).toBe("gemini-3.8-live-extended-thinking");
    expect(defaults.profiles[defaults.model].thinking).toBe("high");
    const legacy = { ...defaults, model: "gemini-3.8-live", profiles: { ...defaults.profiles,
      "gemini-3.8-live": { voice: "Puck", thinking: "low", instructions: "Speak gently." } } };
    const normalized = readVoiceSettings({ voice: legacy });
    expect(normalized.model).toBe("gemini-3.8-live");
    expect(normalized.profiles[normalized.model]).toEqual({ voice: "Puck", thinking: "low", instructions: "Speak gently." });
    expect(normalized.profiles[defaults.model]).toEqual(defaults.profiles[defaults.model]);
    expect(voiceSettingsSchema.parse(legacy)).toEqual(normalized);
  });
  it.each(["gemini-3.8-live", "gemini-3.8-live-extended-thinking"] as const)("round trips %s without overwriting independent voice preferences", model => {
    const settings = readVoiceSettings(null);
    settings.model = model;
    settings.profiles["gemini-3.8-live"] = { voice: "Puck", thinking: "medium", instructions: "Speak gently." };
    settings.profiles["gemini-3.8-live-extended-thinking"] = { voice: "Leda", thinking: "high", instructions: "Keep it concise." };
    const stored = JSON.parse(JSON.stringify(voiceSettingsSchema.parse(settings)));
    expect(readVoiceSettings({ voice: stored })).toEqual(settings);
    expect(readVoiceSettings({ voice: stored }, "Charon")).toMatchObject({model, profiles: {
      "gemini-3.8-live": { voice: "Charon", instructions: "Speak gently." },
      "gemini-3.8-live-extended-thinking": { voice: "Charon", thinking: "high", instructions: "Keep it concise." },
    }});
  });
  it("keeps the selected Extended Thinking model at High without copying the standard profile", () => {
    const settings = readVoiceSettings(null);
    settings.profiles[settings.model].thinking = "low";
    settings.profiles[settings.model].instructions = "Extended preference.";
    settings.profiles["gemini-3.8-live"].instructions = "Standard preference.";
    expect(voiceSettingsSchema.parse(settings)).toMatchObject({model: settings.model, profiles: {
      [settings.model]: { thinking: "high", instructions: "Extended preference." },
      "gemini-3.8-live": { instructions: "Standard preference." },
    }});
  });
  it("rejects duplicate participants and oversized groups", () => {
    const id = "5c6acde2-1c62-4c09-aa89-067df5be2161";
    expect(voiceSessionRequestSchema.safeParse({ agentIds: [id, id] }).success).toBe(false);
    expect(voiceSessionRequestSchema.safeParse({ agentIds: [] }).success).toBe(false);
  });
  it("uses the assigned voice even if unrelated profile metadata is malformed", () => {
    const settings = readVoiceSettings({ voice: { model: "unsupported", profiles: [] } }, "Charon");
    expect(settings.profiles["gemini-3.8-live"].voice).toBe("Charon");
    expect(settings.profiles["gemini-3.8-live-extended-thinking"].voice).toBe("Charon");
  });
  it("preserves delivery preferences when applying the canonical voice", () => {
    const settings = readVoiceSettings(null);
    settings.profiles[settings.model].instructions = "Speak softly.";
    const canonical = readVoiceSettings({ voice: settings }, "Puck");
    expect(canonical.profiles[canonical.model]).toMatchObject({ voice: "Puck", instructions: "Speak softly." });
    expect(settings.profiles[settings.model].voice).toBe("Kore");
  });
});
