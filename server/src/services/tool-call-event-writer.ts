import { and, eq } from "drizzle-orm";
import { heartbeatRuns, issues, toolCallEvents, type Db } from "@whoxos/db";

/** Keep audit FK locks in the same task-then-run order as identity capture. */
export async function insertToolCallEvent(
  db: Db,
  event: typeof toolCallEvents.$inferInsert,
) {
  return db.transaction(async (tx) => {
    // PostgreSQL otherwise checks run_id before issue_id when inserting this
    // table. Concurrent identity capture holds the task while locking its run,
    // so an unordered FK check can deadlock and prevent a permitted tool call.
    if (event.issueId) {
      const [issue] = await tx.select({ id: issues.id }).from(issues)
        .where(and(eq(issues.companyId, event.companyId), eq(issues.id, event.issueId)))
        .for("key share");
      if (!issue) throw new Error("Tool audit task scope is unavailable");
    }
    if (event.runId) {
      const [run] = await tx.select({ id: heartbeatRuns.id }).from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.companyId, event.companyId), eq(heartbeatRuns.id, event.runId)))
        .for("key share");
      if (!run) throw new Error("Tool audit run scope is unavailable");
    }
    return tx.insert(toolCallEvents).values(event).returning();
  });
}
