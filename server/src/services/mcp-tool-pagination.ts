// MCP tools/list uses protocol pagination, independently of tool result schemas.
// Collect every page before callers mutate the persisted catalog.
export async function collectMcpToolPages(
  firstPayload: unknown,
  fetchNext: (cursor: string, page: number) => Promise<unknown>,
): Promise<unknown[]> {
  const tools: unknown[] = [];
  const cursors = new Set<string>();
  let payload = firstPayload;
  for (let page = 1; page <= 100; page += 1) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Remote MCP tool catalog response is invalid");
    }
    const envelope = payload as Record<string, unknown>;
    if (envelope.error != null) throw new Error("Remote MCP tool catalog returned an error");
    const result = envelope.result ?? envelope;
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Remote MCP tool catalog result is invalid");
    }
    const record = result as Record<string, unknown>;
    if (!Array.isArray(record.tools)) throw new Error("Remote MCP tool catalog has no tools array");
    tools.push(...record.tools);
    if (tools.length > 10_000) throw new Error("Remote MCP tool catalog exceeds the tool limit");
    // Per MCP, omission denotes the terminal tools/list page. This does not
    // establish terminal semantics for a provider's tools/call payload.
    if (record.nextCursor === undefined) return tools;
    if (typeof record.nextCursor !== "string" || !record.nextCursor || record.nextCursor.length > 16_384) {
      throw new Error("Remote MCP tool catalog cursor is invalid");
    }
    if (cursors.has(record.nextCursor)) throw new Error("Remote MCP tool catalog cursor repeated");
    if (page === 100) throw new Error("Remote MCP tool catalog exceeds the page limit");
    cursors.add(record.nextCursor);
    payload = await fetchNext(record.nextCursor, page + 1);
  }
  throw new Error("Remote MCP tool catalog exceeds the page limit");
}
