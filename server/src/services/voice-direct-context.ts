import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const context = new AsyncLocalStorage<boolean>();
const permits = new Map<string, { method: string; path: string; expires: number }>();
export const isVoiceDirectExecution = () => context.getStore() === true;
export function voiceDirectPermit(method: string, path: string) {
  for (const [key, value] of permits) if (value.expires < Date.now()) permits.delete(key);
  const token = randomUUID();
  permits.set(token, { method, path, expires: Date.now() + 60_000 });
  return { token, revoke: () => permits.delete(token) };
}
/** Only a server-issued, single-use permit can suppress runtime dispatch. */
export const voiceDirectMiddleware: RequestHandler = (req, res, next) => {
  const token = req.header("x-overview-voice-direct");
  if (!token) return next();
  const permit = permits.get(token); permits.delete(token);
  if (!permit || permit.expires < Date.now() || permit.method !== req.method || permit.path !== req.originalUrl) {
    res.status(403).json({ error: "Invalid voice execution permit" }); return;
  }
  context.run(true, next);
};
export function isGeminiLiveOnly(overrides: unknown): boolean {
  const value = overrides as { adapterConfig?: { voiceExecutionOnly?: unknown } } | null;
  return value?.adapterConfig?.voiceExecutionOnly === true;
}
