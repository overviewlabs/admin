/** Translate media-device failures into actionable browser/device guidance. */
export function voiceMicrophoneFailure(cause: unknown, userAgent = navigator.userAgent): string {
  const name = cause && typeof cause === "object" && "name" in cause ? cause.name : "";
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(String(name))) {
    const safariMac = /Macintosh/.test(userAgent) && /Safari/.test(userAgent) && !/Chrome|Chromium|Edg|OPR/.test(userAgent);
    return safariMac
      ? "Microphone access is blocked. In Safari, open Settings → Websites → Microphone and set overviewlabs.ai to Allow. Then click Try voice again."
      : "Microphone access is blocked. Allow the microphone for this site in your browser’s website permissions, then click Try voice again.";
  }
  if (["NotFoundError", "DevicesNotFoundError"].includes(String(name))) return "No microphone was found. Connect or enable a microphone, then click Try voice again.";
  if (["NotReadableError", "TrackStartError"].includes(String(name))) return "Your microphone could not be opened. Check your system microphone settings and other apps using it, then click Try voice again.";
  if (["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(String(name))) return "The selected microphone is unavailable. Reconnect it or select another microphone, then try voice again.";
  return cause instanceof Error ? cause.message : "Could not enable the microphone. Check microphone access and try voice again.";
}

/** Prefer system-wide AEC when advertised; true still covers remote WebRTC audio. */
export async function configureVoiceMicrophone(stream: MediaStream) {
  for (const track of stream.getAudioTracks()) {
    const modes = track.getCapabilities?.().echoCancellation as Array<boolean | string> | undefined;
    if (!modes?.includes('all')) continue;
    try {
      await track.applyConstraints({ echoCancellation: { exact: 'all' } as MediaTrackConstraints['echoCancellation'] });
    } catch { /* Keep the echoCancellation:true constraint granted by getUserMedia. */ }
  }
}
