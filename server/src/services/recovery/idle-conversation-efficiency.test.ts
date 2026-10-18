import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { agents, authUsers, companies, createDb, heartbeatRuns, issueComments, issues } from "@whoxos/db";
import { startEmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";
import { instanceSettingsService } from "../instance-settings.js";
import { recoveryService } from "./service.js";
let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
let db: ReturnType<typeof createDb>;
beforeAll(async () => {
  database = await startEmbeddedPostgresTestDatabase("idle-conversation-efficiency-");
  db = createDb(database.connectionString);
}, 90000);
afterAll(async () => { await db?.$client.end({ timeout: 0 }); await database?.cleanup(); });
it("avoids old run payloads for settled chats while delivering new user messages", async () => {
  const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID(), userId = randomUUID();
  await db.insert(authUsers).values({ id: userId, name: "User", email: `${userId}@test.invalid`, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(companies).values({ id: companyId, name: "Idle chat", issuePrefix: "IDLE" });
  await db.insert(agents).values({ id: agentId, companyId, name: "Assistant", role: "engineer", status: "idle", adapterType: "process" });
  await db.insert(issues).values({ id: issueId, companyId, title: "Conversation", status: "in_review", assigneeAgentId: agentId, conversationAgentId: agentId, conversationUserId: userId, conversationState: "waiting" });
  await db.insert(heartbeatRuns).values({ companyId, agentId, status: "succeeded", contextSnapshot: { issueId, conversationSessionGeneration: 0, prompt: "large historical payload".repeat(10000) } });
  await instanceSettingsService(db).updateExperimental({ enableAgentChat: true });
  const originalSelect = db.select.bind(db);
  let historyReads = 0;
  const monitoredDb = new Proxy(db, {
    get(target, key) {
      if (key !== "select") return Reflect.get(target, key);
      return (...args: Parameters<typeof db.select>) => {
        const query = originalSelect(...args);
        const originalFrom = query.from.bind(query);
        query.from = ((table: unknown) => {
          if (table === heartbeatRuns) historyReads++;
          return originalFrom(table as Parameters<typeof originalFrom>[0]);
        }) as typeof query.from;
        return query;
      };
    },
  });
  const enqueueWakeup = vi.fn(async () => null);
  const recovery = recoveryService(monitoredDb, { enqueueWakeup });
  await recovery.reconcileStrandedAssignedIssues();
  expect(historyReads).toBe(0);
  expect(enqueueWakeup).not.toHaveBeenCalled();
  const commentId = randomUUID();
  await db.insert(issueComments).values({ id: commentId, companyId, issueId, authorUserId: userId, body: "A new request", clientRequestId: randomUUID() });
  await recovery.reconcileStrandedAssignedIssues();
  expect(historyReads).toBe(0);
  expect(enqueueWakeup).toHaveBeenCalledExactlyOnceWith(agentId, expect.objectContaining({
    idempotencyKey: `conversation-comment:${commentId}`,
    contextSnapshot: expect.objectContaining({ issueId, wakeCommentId: commentId }),
  }));
});
