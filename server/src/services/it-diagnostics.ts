import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { agents, companyMemberships, heartbeatRuns, type Db } from "@whoxos/db";
import type { AgentApiKeyScope } from "@whoxos/shared";
import { badRequest, forbidden, HttpError } from "../errors.js";

const CACHE = "/var/lib/overview-labs-health/it-diagnostics.json";
const HISTORY = "/var/lib/overview-labs-health/it-diagnostics-history";
const RETENTION_MS = 24 * 60 * 60_000;
const SOURCE_IDS = ["whoxos", "overview_services", "postgresql"] as const;
const GRANTS = "/etc/overview-labs/it-diagnostics-grants.json";
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const diagnosticEvent = z.object({
  timestamp,
  severity: z.enum(["warning", "error", "critical"]),
  code: z.enum(["dns_failure", "connection_refused", "connection_closed", "permission_denied", "out_of_memory", "provider_rate_limit", "terminal_limit", "service_failure", "database_deadlock", "database_unique_conflict", "runtime_tool_context", "run_log_unavailable", "request_not_found", "request_validation", "request_conflict", "warning", "error", "critical"]),
  unit: z.enum(["WHOXOS.service", "whoxos.service", "overview-labs-health.service", "searxng.service", "overview-labs-searxng.service", "caddy.service", "postgresql.service", "postgresql@18-main.service", "postgresql"]).nullable(),
  count: z.number().int().min(1).max(2000),
});
export const itDiagnosticsSchema = z.object({
  version: z.literal(1),
  generatedAt: timestamp,
  window: z.object({ since: timestamp, until: timestamp, minutes: z.literal(30) }),
  sources: z.array(z.object({
    id: z.enum(["whoxos", "overview_services", "postgresql"]),
    available: z.boolean(),
    status: z.enum(["ok", "unavailable", "timeout"]),
    scannedEntries: z.number().int().nonnegative().max(100000),
    matchedEvents: z.number().int().nonnegative().max(100000),
    truncated: z.boolean(),
    coverageProvenance: z.literal("bounded_scan").optional(),
    retentionVerified: z.literal(false).optional(),
    events: z.array(diagnosticEvent).max(100),
  })).max(3),
});

/** Fixed root-owned metadata only. Never return raw journal text or accept a path/command from a caller. */
async function readRootOwnedJson(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.size > 1024 * 1024) {
      throw new Error("Invalid diagnostics file ownership or size");
    }
    return JSON.parse(await file.readFile("utf8"));
  } finally { await file.close(); }
}

export async function hasItDiagnosticsGrant(companyId: string, agentId: string) {
  try {
    const config = z.object({ grants: z.array(z.object({ companyId: uuid, agentId: uuid })).max(1000) })
      .parse(await readRootOwnedJson(GRANTS));
    return config.grants.some(grant => grant.companyId === companyId && grant.agentId === agentId);
  } catch { return false; }
}

export async function assertItDiagnosticsAccess(db: Db, input: {
  companyId: string; type: "board" | "agent" | "none";
  userId?: string; agentId?: string; runId?: string;
  keyScope?: AgentApiKeyScope;
}, grant = hasItDiagnosticsGrant) {
  if (input.type === "agent" && input.keyScope && input.keyScope.kind !== "standard") {
    throw forbidden("Restricted agent credentials cannot read host diagnostics");
  }
  const principalId = input.type === "board" ? input.userId : input.type === "agent" ? input.agentId : null;
  if (!principalId) throw forbidden("Authenticated organization management or granted IT agent access required");
  const [membership] = await db.select({ status: companyMemberships.status, role: companyMemberships.membershipRole })
    .from(companyMemberships).where(and(eq(companyMemberships.companyId, input.companyId),
      eq(companyMemberships.principalId, principalId), eq(companyMemberships.principalType, input.type === "board" ? "user" : "agent")));
  if (membership?.status !== "active") throw forbidden("Active organization membership required");
  if (input.type === "board") {
    if (membership.role !== "owner" && membership.role !== "admin") throw forbidden("Owner or administrator access required");
    return;
  }
  if (!input.runId || !await grant(input.companyId, principalId)) throw forbidden("An active run and an installed IT diagnostics grant are required");
  const [agent] = await db.select({ status: agents.status }).from(agents)
    .where(and(eq(agents.id, principalId), eq(agents.companyId, input.companyId)));
  const [run] = await db.select({ status: heartbeatRuns.status }).from(heartbeatRuns)
    .where(and(eq(heartbeatRuns.id, input.runId), eq(heartbeatRuns.agentId, principalId), eq(heartbeatRuns.companyId, input.companyId)));
  if (!agent || !["idle", "running", "error"].includes(agent.status) || run?.status !== "running") {
    throw forbidden("IT diagnostics requires an active agent and its current running execution");
  }
}

export function parseItDiagnostics(value: unknown, now = Date.now()) {
  const result = itDiagnosticsSchema.parse(value);
  const age = now - Date.parse(result.generatedAt);
  if (age > 5 * 60_000 || age < -60_000) {
    throw new HttpError(503, "IT diagnostics collector has not produced a recent report", { code: "it_diagnostics_stale" });
  }
  return result;
}

export async function readItDiagnostics() {
  try { return parseItDiagnostics(await readRootOwnedJson(CACHE)); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "IT diagnostics collector is unavailable", { code: "it_diagnostics_unavailable" });
  }
}


const archivedDiagnosticsSchema = itDiagnosticsSchema.extend({
  window: z.object({ since: timestamp, until: timestamp, minutes: z.number().positive().max(120) }),
});
type HistoricalWindow = { since: string; until: string };

/** Only a bounded time range is caller-controlled. Sources, filenames and commands are never inputs. */
export function parseItDiagnosticsWindow(query: unknown, now = Date.now()): HistoricalWindow | undefined {
  if (query && typeof query === "object" && Object.keys(query).length === 0) return undefined;
  const parsed = z.object({ since: timestamp.max(35), until: timestamp.max(35) }).strict().safeParse(query);
  if (!parsed.success) throw badRequest("Use paired ISO timestamps since and until, with no other parameters");
  const since = Date.parse(parsed.data.since), until = Date.parse(parsed.data.until);
  if (!Number.isFinite(since) || !Number.isFinite(until) || since >= until || until - since > 120 * 60_000
    || since < now - RETENTION_MS || until > now) {
    throw badRequest("Diagnostics history must be within the last 24 hours, with a positive range of at most two hours");
  }
  return { since: new Date(since).toISOString(), until: new Date(until).toISOString() };
}

function missingIntervals(intervals: Array<[number, number]>, since: number, until: number) {
  const gaps: HistoricalWindow[] = [];
  let cursor = since;
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    if (start > cursor) gaps.push({ since: new Date(cursor).toISOString(), until: new Date(start).toISOString() });
    cursor = Math.max(cursor, end);
  }
  if (cursor < until) gaps.push({ since: new Date(cursor).toISOString(), until: new Date(until).toISOString() });
  return gaps;
}

/** A successful scan proves a bounded query ran, not that rotated/deleted source records were retained. */
export function aggregateItDiagnosticsHistory(values: unknown[], window: HistoricalWindow, now = Date.now(), inventoryTruncated = false) {
  const since = Date.parse(window.since), until = Date.parse(window.until);
  let ignoredSnapshots = 0;
  const snapshots: z.infer<typeof archivedDiagnosticsSchema>[] = [];
  for (const value of values) {
    const parsed = archivedDiagnosticsSchema.safeParse(value);
    if (!parsed.success) { ignoredSnapshots++; continue; }
    const report = parsed.data;
    const start = Date.parse(report.window.since), end = Date.parse(report.window.until), generated = Date.parse(report.generatedAt);
    if (start >= end || end - start > 120 * 60_000 || end > generated || generated > now + 60_000
      || Math.abs((end - start) / 60_000 - report.window.minutes) > 0.001
      || new Set(report.sources.map(source => source.id)).size !== report.sources.length) {
      ignoredSnapshots++; continue;
    }
    if (end < since || start > until) continue;
    snapshots.push(report);
  }
  const sources = SOURCE_IDS.map(id => {
    const intervals: Array<[number, number]> = [];
    const events = new Map<string, z.infer<typeof diagnosticEvent>>();
    let scannedSnapshots = 0, incompleteSnapshots = 0, failedSnapshots = 0, legacySnapshots = 0;
    for (const report of snapshots) {
      const source = report.sources.find(item => item.id === id);
      if (!source) continue;
      scannedSnapshots++;
      if (source.coverageProvenance !== "bounded_scan" || source.retentionVerified !== false) legacySnapshots++;
      if (!source.available || source.status !== "ok") failedSnapshots++;
      else if (source.truncated) incompleteSnapshots++;
      else if (source.coverageProvenance === "bounded_scan" && source.retentionVerified === false) {
        intervals.push([Math.max(since, Date.parse(report.window.since)), Math.min(until, Date.parse(report.window.until))]);
      }
      // Sum coincident events within one snapshot, then take the largest count across overlapping scans.
      const local = new Map<string, z.infer<typeof diagnosticEvent>>();
      for (const event of source.events) {
        const at = Date.parse(event.timestamp);
        if (at < since || at > until || at < Date.parse(report.window.since) || at > Date.parse(report.window.until)) continue;
        const key = JSON.stringify([event.timestamp, event.severity, event.code, event.unit]);
        local.set(key, { ...event, count: (local.get(key)?.count ?? 0) + event.count });
      }
      for (const [key, event] of local) {
        if (event.count > (events.get(key)?.count ?? 0)) events.set(key, event);
      }
    }
    const ordered = [...events.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const gaps = missingIntervals(intervals, since, until);
    const eventsTruncated = ordered.length > 500;
    return { id, available: scannedSnapshots > failedSnapshots, scannedSnapshots, incompleteSnapshots, failedSnapshots, legacySnapshots,
      // No current collector proves source continuity or retention, including successful empty scans.
      coverage: { complete: false as const, retentionVerified: false as const, reason: "source_retention_unverified" as const,
        provenance: legacySnapshots ? "legacy_unverified" as const : "bounded_scan" as const },
      scanCoverage: { complete: gaps.length === 0 && !inventoryTruncated && !eventsTruncated, gaps },
      eventsTruncated, matchedEvents: ordered.reduce((total, event) => total + event.count, 0), events: ordered.slice(0, 500) };
  });
  return { version: 1 as const, mode: "history" as const, generatedAt: new Date(now).toISOString(),
    window: { ...window, minutes: (until - since) / 60_000 }, retentionHours: 24,
    snapshotCount: snapshots.length, ignoredSnapshots, inventoryTruncated,
    latestSnapshotAt: snapshots.length ? snapshots.map(item => item.generatedAt).sort().at(-1)! : null,
    scope: "sanitized_service_metadata" as const, sources };
}

export async function readItDiagnosticsHistory(window: HistoricalWindow, directory = HISTORY, now = Date.now()) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.uid !== 0 || (info.mode & 0o022) !== 0) throw new Error("Invalid diagnostics history directory");
    const entries = await opendir(directory);
    const values: unknown[] = [];
    let inspected = 0, selected = 0, inventoryTruncated = false;
    const since = Date.parse(window.since), until = Date.parse(window.until);
    for await (const entry of entries) {
      if (++inspected > 4000) { inventoryTruncated = true; break; }
      const match = /^(\d{13})-(\d{13})-(\d{13})\.json$/.exec(entry.name);
      if (!match || Number(match[2]) < since || Number(match[1]) > until) continue;
      if (++selected > 256) { inventoryTruncated = true; break; }
      try {
        const value = await readRootOwnedJson(join(directory, entry.name));
        // The fixed filename is only an index: validate the actual content matches it.
        if (Date.parse(value?.window?.since) !== Number(match[1]) || Date.parse(value?.window?.until) !== Number(match[2])
          || Date.parse(value?.generatedAt) !== Number(match[3])) throw new Error("Invalid archive index");
        values.push(value);
      } catch { values.push(null); }
    }
    return aggregateItDiagnosticsHistory(values, window, now, inventoryTruncated);
  } catch {
    throw new HttpError(503, "IT diagnostics history is unavailable", { code: "it_diagnostics_history_unavailable" });
  }
}
