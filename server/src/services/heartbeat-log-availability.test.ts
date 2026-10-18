import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { createDb, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { heartbeatService } from "./heartbeat.js";
let db: ReturnType<typeof createDb>;
let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
beforeAll(async () => { temporary = await startEmbeddedPostgresTestDatabase("log-availability-"); db = createDb(temporary.connectionString); }, 90000);
afterAll(async () => temporary?.cleanup());
  it("reports absent log metadata as unavailable without a failed diagnostic request", async () => {
    const heartbeat = heartbeatService(db);
    await expect(heartbeat.readLog({ id: randomUUID(), companyId: randomUUID(), logStore: null, logRef: null })).resolves.toMatchObject({ available: false, reason: "not_recorded", content: "", nextOffset: 0 });
    await expect(heartbeat.readLog(randomUUID())).rejects.toMatchObject({ status: 404 });
  });

