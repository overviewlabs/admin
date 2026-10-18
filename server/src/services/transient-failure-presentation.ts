/** A retryable provider error is run status, not an agent reply to the user. */
export function isTransientFailureStatusReply(input: {
  failed: boolean;
  retryable: boolean;
  response: string | null;
  error: string | null;
}): boolean {
  return input.failed && input.retryable && Boolean(
    input.error?.trim() && input.response?.trim() === input.error.trim(),
  );
}
