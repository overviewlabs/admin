/** Deliberately conservative: a model-supplied target is not user authorization. */
export function voiceDeletionRequested(text: string, organizationName: string): boolean {
  const normalized = text.toLowerCase().replace(/[’]/g, "'").trim();
  const name = organizationName.toLowerCase().trim();
  if (!name || !normalized.includes(name)) return false;
  if (/\b(?:not|never|stop|cancel|don't|do not|whether|if|able|possible)\b/.test(normalized)) return false;
  return /^(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:delete|terminate|remove)\b/.test(normalized)
    || /^(?:i want you to|i want to|go ahead and)\s+(?:delete|terminate|remove)\b/.test(normalized);
}

export function voiceDeletionTarget(args: Record<string, unknown>): string | undefined {
  let data: Record<string, unknown>;
  try { data = JSON.parse(typeof args.data === 'string' ? args.data : '{}'); } catch { return undefined; }
  if (!data || typeof data !== 'object') return undefined;
  if (args.action === 'terminate_organization') return typeof data.confirmationName === 'string' ? data.confirmationName : '';
  if (args.action === 'server_api' && typeof data.path === 'string'
      && (/\/companies\/[^/]+\/terminate\/?(?:\?|$)/.test(data.path) || (data.method === 'DELETE' && /\/companies\/[^/]+\/?(?:\?|$)/.test(data.path)))) {
    const body = data.body as Record<string, unknown> | undefined;
    return typeof body?.confirmationName === 'string' ? body.confirmationName : '';
  }
  return undefined;
}
