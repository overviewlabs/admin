/** Cancelling a model tool call is separate from revoking the voice session. */
export function assertVoiceToolActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Voice tool call was cancelled.', 'AbortError');
}
