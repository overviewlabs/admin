import { VOICE_NAMES } from "@whoxos/shared/agent-voice";
// Provider metadata: https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
// Tone descriptions: https://ai.google.dev/gemini-api/docs/speech-generation
const female = new Set(["Zephyr", "Kore", "Leda", "Aoede", "Callirrhoe", "Autonoe", "Despina", "Erinome", "Laomedeia", "Achernar", "Gacrux", "Pulcherrima", "Vindemiatrix", "Sulafat"]);
const tones = ["Bright", "Upbeat", "Informative", "Firm", "Excitable", "Youthful", "Firm", "Breezy", "Easy-going", "Bright", "Breathy", "Clear", "Easy-going", "Smooth", "Smooth", "Clear", "Gravelly", "Informative", "Upbeat", "Soft", "Firm", "Even", "Mature", "Forward", "Friendly", "Casual", "Gentle", "Lively", "Knowledgeable", "Warm"];
export const VOICE_CATALOG = VOICE_NAMES.map((name, i) => ({
  name, gender: female.has(name) ? "Female" as const : "Male" as const,
  tone: tones[i], previewUrl: `https://www.gstatic.com/aistudio/voices/samples/${name}.wav`,
}));
