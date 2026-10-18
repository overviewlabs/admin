import { and, asc, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { agents, heartbeatRunEvents, heartbeatRuns, type Db } from "@whoxos/db";

/** Read one indexed timestamp per failed agent/task, never decompress unrelated run history. */
export async function latestAttentionRuns(db: Db, companyId: string, failedRows: readonly {
  agentId: string;
  contextSnapshot: Record<string, unknown> | null;
  createdAt: Date;
}[]) {
  const groups = new Map<string, { agentId: string; issueId: string; since: Date }>();
  for (const run of failedRows) {
    const value = run.contextSnapshot?.issueId ?? run.contextSnapshot?.taskId;
    const issueId = typeof value === "string" ? value : "";
    const key = `${run.agentId}:${issueId}`;
    const previous = groups.get(key);
    if (!previous || run.createdAt < previous.since) {
      groups.set(key, { agentId: run.agentId, issueId, since: run.createdAt });
    }
  }
  const latest = new Map<string, Date>();
  for (const [key, group] of groups) {
    const [row] = await db.select({ createdAt: heartbeatRuns.createdAt })
      .from(heartbeatRuns)
      .where(and(
        eq(heartbeatRuns.companyId, companyId),
        eq(heartbeatRuns.agentId, group.agentId),
        sql`coalesce(${heartbeatRuns.contextSnapshot} ->> 'issueId', ${heartbeatRuns.contextSnapshot} ->> 'taskId', '') = ${group.issueId}`,
        gt(heartbeatRuns.createdAt, group.since),
      ))
      .orderBy(sql`${heartbeatRuns.createdAt} desc nulls last`)
      .limit(1);
    if (row) latest.set(key, row.createdAt);
  }
  return latest;
}

export function listAttentionExhaustedRuns(db: Db, companyId: string) {
  // Recovery can revisit an exhausted run. Deduplicate its historical events
  // before joining run data so duplicate events never multiply the wire payload.
  const latestExhaustion = db
    .selectDistinctOn([heartbeatRunEvents.runId], {
      runId: heartbeatRunEvents.runId,
      eventId: heartbeatRunEvents.id,
      message: heartbeatRunEvents.message,
    })
    .from(heartbeatRunEvents)
    .where(and(
      eq(heartbeatRunEvents.companyId, companyId),
      eq(heartbeatRunEvents.eventType, "lifecycle"),
      sql`${heartbeatRunEvents.message} like 'Bounded retry exhausted%'`,
    ))
    .orderBy(asc(heartbeatRunEvents.runId), desc(heartbeatRunEvents.id))
    .as("latest_exhaustion");

  return db
    .select({
      id: heartbeatRuns.id,
      companyId: heartbeatRuns.companyId,
      agentId: heartbeatRuns.agentId,
      agentName: agents.name,
      status: heartbeatRuns.status,
      error: heartbeatRuns.error,
      errorCode: heartbeatRuns.errorCode,
      // Preserve JSON types and issueId/taskId fallback semantics without
      // transferring prompts, transcripts, or the rest of the run context.
      contextSnapshot: sql<Record<string, unknown>>`jsonb_build_object(
        'issueId', ${heartbeatRuns.contextSnapshot} -> 'issueId',
        'taskId', ${heartbeatRuns.contextSnapshot} -> 'taskId'
      )`,
      createdAt: heartbeatRuns.createdAt,
      updatedAt: heartbeatRuns.updatedAt,
      finishedAt: heartbeatRuns.finishedAt,
      exhaustionMessage: latestExhaustion.message,
    })
    .from(heartbeatRuns)
    .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
    .innerJoin(latestExhaustion, eq(latestExhaustion.runId, heartbeatRuns.id))
    .where(and(
      eq(heartbeatRuns.companyId, companyId),
      eq(agents.companyId, companyId),
      notInArray(agents.status, ["terminated"]),
      inArray(heartbeatRuns.status, ["failed", "timed_out"]),
    ))
    .orderBy(desc(heartbeatRuns.createdAt), desc(latestExhaustion.eventId));
}
