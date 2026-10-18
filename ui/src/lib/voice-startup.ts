/** Bound browser/media promises that Safari can leave pending indefinitely. */
export async function voiceStartupStep<T>(operation: Promise<T>, message: string, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}
export async function resumeVoiceAudio(context: AudioContext) {
  if (context.state === "running") return;
  await voiceStartupStep(context.resume(), "Safari has not enabled audio. Click Start voice again to allow microphone audio.", 8_000);
}
