/** Linux limits each environment entry, not only the total launch size.
 * Full wake context remains in the prompt/API; never put an unbounded copy in env.
 */
export function boundedWakeEnvironment(json: string | null): string | null {
  if (!json || Buffer.byteLength(json, "utf8") <= 48 * 1024) return json;
  const payload = JSON.parse(json);
  const issue = payload.issue;
  return JSON.stringify({
    version: payload.version,
    reason: typeof payload.reason === "string" ? payload.reason.slice(0, 256) : undefined,
    issue: issue ? { id: issue.id, identifier: issue.identifier } : undefined,
    environmentSummaryOnly: true,
    contextSource: "Use the full wake context in the prompt and the task API for current details.",
  });
}
