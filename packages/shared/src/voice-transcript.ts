// Provider control markers are not spoken messages. Ordinary prose is retained.
const labels = ["no speech", "silence", "noise", "background noise", "inaudible", "unintelligible", "music"];
const markers = labels.flatMap(label => [`<${label}>`, `[${label}]`]);
export function isNonSpeechVoiceTranscript(text: string): boolean {
  const normalized = text.trim().toLowerCase().replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("_", " ");
  if (!normalized) return true;
  const remainder = normalized.replace(/(?:<|\[)(?:no speech|silence|noise|background noise|inaudible|unintelligible|music)(?:>|\])/g, "").trim();
  return !remainder || markers.some(marker => marker.startsWith(normalized));
}
