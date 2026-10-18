import { mkdtemp, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateItDiagnosticsHistory, parseItDiagnosticsWindow, readItDiagnosticsHistory } from "./it-diagnostics.js";

const now = Date.parse("2026-09-28T12:00:00Z");
const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
const window = { since: at(-30), until: at(-20) };
function snapshot(start = -30, end = -20, options: { truncated?: boolean; available?: boolean; timestamp?: string } = {}) {
  const available = options.available ?? true;
  return { version: 1, generatedAt: at(end), window: { since: at(start), until: at(end), minutes: end - start },
    sources: [{ id: "whoxos", available, status: available ? "ok" : "timeout", scannedEntries: 5,
      matchedEvents: 1, truncated: options.truncated ?? false, coverageProvenance: "bounded_scan", retentionVerified: false, events: [{ timestamp: options.timestamp ?? at(-25),
        severity: "error", code: "connection_refused", unit: "whoxos.service", count: 1 }] }] };
}

describe("bounded historical diagnostics", () => {
  it("accepts only paired bounded ISO timestamps and keeps no-query default", () => {
    expect(parseItDiagnosticsWindow({}, now)).toBeUndefined();
    expect(parseItDiagnosticsWindow(window, now)).toEqual(window);
    for (const bad of [{ since: at(-2) }, { ...window, path: "/etc/shadow" }, { since: [at(-2)], until: at(-1) },
      { since: at(-121), until: at(0) }, { since: at(-1441), until: at(-1440) },
      { since: at(-1), until: at(1) }, { since: at(0), until: at(-1) },
      { since: at(-1), until: at(-1) }, { since: "yesterday", until: "now" },
      { since: "2026-02-30T00:00:00Z", until: at(-1) }]) {
      expect(() => parseItDiagnosticsWindow(bad, now)).toThrow();
    }
  });
  it("unions complete intervals and deduplicates overlapping evidence without losing coincident events", () => {
    const one = snapshot(-30, -24), two = snapshot(-26, -20);
    one.sources[0]!.events.push({ ...one.sources[0]!.events[0]! });
    two.sources[0]!.events.push({ ...two.sources[0]!.events[0]! });
    const result = aggregateItDiagnosticsHistory([one, two], window, now);
    expect(result.sources[0]).toMatchObject({ scanCoverage: { complete: true, gaps: [] }, coverage: { complete: false, retentionVerified: false }, matchedEvents: 2 });
    expect(result.sources[0]!.events).toHaveLength(1);
    expect(result.sources[0]!.events[0]!.count).toBe(2);
    expect(result.sources[1]).toMatchObject({ available: false, scanCoverage: { complete: false, gaps: [window] }, coverage: { complete: false } });
  });
  it("does not claim coverage from capped, timed-out, missing or malformed snapshots", () => {
    const result = aggregateItDiagnosticsHistory([snapshot(-30, -27), snapshot(-27, -24, { truncated: true }),
      snapshot(-24, -22, { available: false }), snapshot(-22, -20), { private: "never expose" }], window, now);
    expect(result.sources[0]).toMatchObject({ scanCoverage: { complete: false, gaps: [{ since: at(-27), until: at(-22) }] }, coverage: { complete: false },
      incompleteSnapshots: 1, failedSnapshots: 1 });
    expect(result.ignoredSnapshots).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("rejects forged coverage, duplicates and outside-window evidence, and reports inventory bounds", () => {
    const valid = snapshot();
    const badDuration = { ...valid, window: { ...valid.window, minutes: 120 } };
    const future = { ...valid, generatedAt: at(2) };
    const duplicatedSources = { ...valid, sources: [...valid.sources, ...valid.sources] };
    const result = aggregateItDiagnosticsHistory([badDuration, future, duplicatedSources, snapshot(-30, -20, { timestamp: at(-31) })], window, now, true);
    expect(result.ignoredSnapshots).toBe(3);
    expect(result.sources[0]).toMatchObject({ events: [], coverage: { complete: false }, matchedEvents: 0 });
    expect(result.inventoryTruncated).toBe(true);
  });
  it("bounds historical output and explicitly marks event truncation", () => {
    const snapshots = Array.from({ length: 6 }, (_, i) => {
      const item = snapshot();
      item.sources[0]!.events = Array.from({ length: 100 }, (_, j) => ({ ...item.sources[0]!.events[0]!, timestamp: new Date(now - 30 * 60_000 + (i * 100 + j) * 1000).toISOString() }));
      return item;
    });
    const result = aggregateItDiagnosticsHistory(snapshots, window, now);
    expect(result.sources[0]).toMatchObject({ eventsTruncated: true, matchedEvents: 600, coverage: { complete: false } });
    expect(result.sources[0]!.events).toHaveLength(500);
  });
  it("never treats successful empty or rotated-source scans as proof that history was retained", () => {
    const empty = snapshot(); empty.sources[0]!.events = []; empty.sources[0]!.matchedEvents = 0;
    const result = aggregateItDiagnosticsHistory([empty], window, now);
    expect(result.sources[0]).toMatchObject({ available: true, scanCoverage: { complete: true },
      coverage: { complete: false, retentionVerified: false, reason: "source_retention_unverified" }, events: [] });
    const rotated = snapshot();
    const rotatedResult = aggregateItDiagnosticsHistory([rotated], window, now);
    expect(rotatedResult.sources[0]!.coverage.complete).toBe(false);
    expect(rotatedResult.sources[0]!.matchedEvents).toBe(1);
  });
  it("keeps legacy snapshots as evidence without claiming precise scan coverage or retention", () => {
    const legacy: any = snapshot();
    delete legacy.sources[0].coverageProvenance; delete legacy.sources[0].retentionVerified;
    const result = aggregateItDiagnosticsHistory([legacy], window, now);
    expect(result.sources[0]).toMatchObject({ legacySnapshots: 1, matchedEvents: 1,
      scanCoverage: { complete: false, gaps: [window] }, coverage: { complete: false, provenance: "legacy_unverified" } });
  });
  it.skipIf(process.getuid?.() !== 0)("reads only root-owned immutable metadata, rejecting symlinks and index tampering", async () => {
    const directory = await mkdtemp(join(tmpdir(), "it-history-"));
    try {
      const report = snapshot();
      const name = (end: number) => `${Date.parse(at(-30))}-${Date.parse(at(-20))}-${Date.parse(at(end))}.json`;
      await writeFile(join(directory, name(-20)), JSON.stringify(report), { mode: 0o644 });
      await writeFile(join(directory, name(-19)), JSON.stringify(report), { mode: 0o644 }); // forged index
      await symlink(join(directory, name(-20)), join(directory, name(-18)));
      await writeFile(join(directory, name(-17)), JSON.stringify({ ...report, generatedAt: at(-17) }), { mode: 0o666 });
      await chmod(join(directory, name(-17)), 0o666);
      const result = await readItDiagnosticsHistory(window, directory, now);
      expect(result.snapshotCount).toBe(1);
      expect(result.ignoredSnapshots).toBe(3);
      expect(result.sources[0]!.scanCoverage.complete).toBe(true);
      expect(result.sources[0]!.coverage.complete).toBe(false);
      await chmod(directory, 0o777);
      await expect(readItDiagnosticsHistory(window, directory, now)).rejects.toMatchObject({ status: 503 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
