import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "@whoxos/db";
import {
  CAPABILITY_HIGH_RISK_SEMANTIC_VECTORS,
  CAPABILITY_SEMANTIC_CONFORMANCE_IDS,
  CapabilityMockSemanticConformanceAdapter,
  runSemanticConformanceKit,
} from "../vendor/whoxos-runner/testing.js";

import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  WHOXOSProductionSemanticConformanceAdapter,
  seedWHOXOSSemanticConformance,
  type WHOXOSSemanticConformanceIds,
} from "./helpers/whoxos-semantic-conformance.js";

vi.hoisted(() => {
  process.env.WHOXOS_HOME = "/tmp/whoxos-semantic-conformance-home";
  process.env.WHOXOS_INSTANCE_ID = "semantic-conformance";
  process.env.WHOXOS_LOG_DIR = "/tmp/whoxos-semantic-conformance-home/logs";
  process.env.WHOXOS_IN_WORKTREE = "false";
});

const embeddedSupport = await getEmbeddedPostgresTestSupport();
const describeEmbedded = embeddedSupport.supported ? describe : describe.skip;

if (!embeddedSupport.supported) {
  console.warn(`Skipping semantic production conformance: ${embeddedSupport.reason ?? "unsupported host"}`);
}

describeEmbedded("WHOXOS semantic mock/production conformance", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let mock: CapabilityMockSemanticConformanceAdapter | null = null;

  const base = CAPABILITY_SEMANTIC_CONFORMANCE_IDS;
  const ids: WHOXOSSemanticConformanceIds = {
    companyId: base.companyId,
    actorId: base.actorId,
    foreignCompanyId: "20000000-0000-4000-8000-000000000002",
    foreignTaskId: base.foreignTaskId,
    blockerTaskId: base.blockerTaskId,
    worlds: {
      default: { taskId: base.defaultTaskId, runId: base.defaultRunId, capabilities: [] },
      "cross-company": {
        taskId: base.crossCompanyTaskId,
        runId: base.crossCompanyRunId,
        capabilities: ["dependencies:write"],
      },
      interaction: { taskId: base.interactionTaskId, runId: base.interactionRunId, capabilities: [] },
      "terminal-blocked": {
        taskId: base.blockedTerminalTaskId,
        runId: base.blockedTerminalRunId,
        capabilities: [],
      },
      terminal: { taskId: base.terminalTaskId, runId: base.terminalRunId, capabilities: [] },
    },
  };

  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("whoxos-semantic-conformance-");
    const db = createDb(temporary.connectionString);
    await seedWHOXOSSemanticConformance(db, ids);
    mock = await CapabilityMockSemanticConformanceAdapter.create();
  }, 30_000);

  afterAll(async () => {
    await mock?.stop();
    await temporary?.cleanup();
  });

  it("matches authorization, state, audit, retry, document, continuation, and terminal semantics", async () => {
    if (!temporary || !mock) throw new Error("semantic_conformance_fixture_not_started");
    const production = await WHOXOSProductionSemanticConformanceAdapter.create(
      createDb(temporary.connectionString),
      ids,
    );

    const report = await runSemanticConformanceKit({
      vectors: CAPABILITY_HIGH_RISK_SEMANTIC_VECTORS,
      adapters: [mock, production],
    });

    expect(report.rows).toHaveLength(CAPABILITY_HIGH_RISK_SEMANTIC_VECTORS.length);
    expect(report.rows.every((row) => row.adapterIds.join(",") === "capability-mock,whoxos-production-services"))
      .toBe(true);
    expect(report.rows.find((row) => row.vectorId === "progress-duplicate-retry")?.observation.audit)
      .toEqual([]);
    expect(report.rows.find((row) => row.vectorId === "document-stale-revision")?.observation.authorization)
      .toEqual({ outcome: "denied", code: "document_revision_conflict" });
    expect(report.rows.find((row) => row.vectorId === "continuation-request")?.observation.state)
      .toMatchObject({ interactions: [{ continuationPolicy: "wake_assignee" }] });
    expect(report.rows.find((row) => row.vectorId === "terminal-finish")?.observation.state)
      .toMatchObject({ task: { status: "done" } });
    expect(report.rows.every((row) => row.observation.receipt?.operationReceiptPresent === true))
      .toBe(true);
  }, 30_000);
});
