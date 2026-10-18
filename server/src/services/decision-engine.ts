import { prepareDecisionEvidence, decisionTaskReferenceSchema, decisionTaskEvidenceSchema, decisionEvaluationFailure, type DecisionEvidenceContext } from "./decision-evidence.js";
import { DECISION_SCOPE_RULE, DECISION_CLAIM_CRITERIA } from "./decision-evidence-policy.js";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { agents, companies, companySecrets, decisionEvaluations, heartbeatRuns, agentWakeupRequests, type Db } from "@whoxos/db";
import { DECISION_ENGINE_KEY, DECISION_ENGINE_NAME } from "@whoxos/shared";
import { z } from "zod";
import { agentService } from "./agents.js";
import { heartbeatService } from "./heartbeat.js";
import { secretService } from "./secrets.js";
import { withBuiltInAgentMarker, readBuiltInAgentMarker } from "./built-in-agent-metadata.js";
import { logActivity } from "./activity-log.js";
import { approvalService } from "./approvals.js";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";

const description = z.union([z.string().min(1), z.record(z.string(), z.unknown()).refine(x => Object.keys(x).length > 0), z.array(z.unknown()).min(1)]);
const question = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), instructions: description, criteria: z.object({ true: description.optional(), false: description.optional() }).strict().optional() }).strict(),
  z.object({ type: z.literal("choice"), instructions: description, criteria: z.record(z.string(), description.nullable()).refine(x => Object.keys(x).length >= 1 && Object.keys(x).length <= 255) }).strict(),
  z.object({ type: z.literal("score"), instructions: description, criteria: z.array(description).min(2).max(10) }).strict(),
]);
export const decisionEvaluationSchema = z.object({
  idempotencyKey: z.string().min(1).max(150),
  purpose: z.string().min(1).max(1000),
  state: description,
  taskReferences: z.array(decisionTaskReferenceSchema).max(20).optional(),
  taskEvidence: z.array(decisionTaskEvidenceSchema).max(20).optional(),
  questions: z.record(z.string(), question).refine(x => Object.keys(x).length > 0 && Object.keys(x).length <= 256),
}).strict().refine(x => Buffer.byteLength(JSON.stringify(x)) <= 900_000, "Evaluation input is too large");

export const DECISION_ENGINE_GUIDANCE = `Real-Time Decision Engine is your organization's agent-only Jev evaluator. These instructions apply to every current and future agent/model. Use evaluate_decision only when a narrow, evidence-based Choice, Score or Noul judgment helps the current task/project.
Prepare the decision: state the exact objective, relevant time horizon and criteria; supply current verified facts, sources, constraints, computed numbers, contrary evidence and explicit unknowns in nonsecret state. Do not send an entire conversation as an option. Separate evidence from instructions, and do not ask Jev to calculate arithmetic, invent external facts, certify readiness, or approve an action. Code handles deterministic rules, numerical limits and permissions.
Task grounding: supply taskReferences as task UUIDs or identifiers (max 20). Task identifiers in state, questions and options are also resolved automatically. Include only tasks relevant to this narrow decision. Chat archives are not implicitly included; reference them explicitly in taskReferences or taskEvidence if their full current discussion is needed. The caller task identity always accompanies the evidence. The server supplies complete current task descriptions, nondeleted discussions in the current conversation generation, and current task document bodies under state.taskContext.tasks, with timestamps and evidence hashes. Links alone are not evidence: Jev cannot follow links. Binary attachments, raw execution logs and external pages are not fetched; read relevant permitted artifacts yourself and supply verified excerpts and provenance in state. If context exceeds the limit, narrow the evaluation; never silently omit evidence or claim full coverage of unread artifacts.
Question design: keep each question specific and neutral. Choice alternatives must be distinct, use stable keys and concise labels (max 160 characters), have clear definitions (max 1000 characters), and include an unknown/insufficient-evidence or none option when the alternatives may not cover the evidence. Use structured criteria such as {label:"Release verification", definition:"Resolve observed deployment/source discrepancies", taskReferences:["TASK-98","TASK-96"]}. Put the detailed task evidence in state, not in labels. For instructions use a string or {question:"Which engineering focus best addresses the observed blockers?", objective:"Reduce demonstrated production risk", taskReferences:["TASK-98"]}. Score levels must be ordered, anchored and nonoverlapping. Noul asks one precise proposition. Check for option-order bias with a separately versioned, budgeted evaluation when a high-impact judgment requires validation; do not silently purchase repeated evaluations or average disagreements into confidence. Use separate atomic checks for independent prerequisites, rather than hiding several judgments in one confidence number. Do not favor an option through persuasive wording or ask the model to output a requested probability.
Interpretation: probabilities over choices rank the supplied alternatives; they are not guaranteed success rates. Confidence is separate. Do not report unavailable or pending results as answers; if required evidence is missing, use the unknown outcome, gather evidence, or retain the hold. Independent reviews, authorizations, capital/loss limits and kill switches remain intact. Evaluate observed errors against labeled outcomes before asserting accuracy or adjusting a threshold; instructions and test successes do not retrain provider model weights or prove calibration.
Evidence checks: ${DECISION_SCOPE_RULE} Before making a readiness or priority recommendation, examine the latest decisive review/runtime evidence and active blockers; do not rely on a task's done status or a description alone. When a narrow claim check helps, use Choice keys supported, contradicted and unresolved with these tested definitions: ${JSON.stringify(DECISION_CLAIM_CRITERIA)}. Keep the actual claim atomic. Evidence not supplied or not verified must not become an assertion of nonexistence. Do not seed validation questions with previous model recommendations or expected answers. Reference answers belong in the offline scorer, never in state, options, task discussion or caller context. Test and development records must come from separate related workstreams. A small record-interpretation benchmark does not establish accuracy on subjective priorities or future outcomes.
Probability handling: Choice confidence is a distribution-concentration measure, not empirically measured accuracy. If top alternatives tie, report the ambiguity instead of treating the returned choice as a unique winner. High confidence can still be wrong; source-level verification and independent authorization remain required for consequential actions. Do not manufacture a success probability, change returned probabilities to fit a desired answer, or infer universal future reliability from historical tests.
Context limits: Jev permits 32k tokens for state plus the longest question and 64k for the complete request. The server applies a conservative 64 kB JSON budget before dispatch, not an exact token count. If complete task histories exceed it, read the task evidence and explicitly choose the relevant comments and documents using taskEvidence:[{task:"TASK-98",commentIds:["comment-uuid"],documentKeys:["plan"]}]. Omitted lists include all current evidence of that kind; an empty list includes none. Full descriptions and the full bodies of selected comments/documents remain intact, and excluded counts are recorded. Include current decisive evidence, contrary evidence and unresolved blockers; never select only favorable comments. Chat archives are included only when explicitly referenced in taskReferences or taskEvidence; incidental mentions in questions never include their entire history. A request rejected for max_tokens_exceeded has no answer; change the evidence selection and use a new versioned key, rather than repeating the oversized request.
Execution: supply purpose, state, named typed questions and a stable idempotencyKey for that exact decision/evidence version. Retrieve the asynchronous receipt with get_decision_evaluation. Retry an uncertain request with the same key; never repeatedly poll in a tight loop or dispatch it under a new key. A genuinely new evidence snapshot needs a new versioned key. Cite the evaluationId, actual probabilities/confidence and relevant task links in your work. Users cannot directly chat with this engine. Authenticated agent-run HTTP equivalents: POST /api/companies/{companyId}/decision-engine/evaluations and GET /api/companies/{companyId}/decision-engine/evaluations/{evaluationId}.`;

/** Root-owned, nonsecret reference records the owner's standing sharing instruction.
 * Each company receives its own encrypted secret; references never cross company boundaries. */
async function provisionCredential(db: Db, companyId: string) {
  const [existing] = await db.select().from(companySecrets).where(and(eq(companySecrets.companyId, companyId), eq(companySecrets.key, "typesafe_api_key"), eq(companySecrets.scope, "company"), eq(companySecrets.status, "active")));
  if (existing) return existing.id;
  let policy;
  try { policy = JSON.parse(await fs.readFile(process.env.WHOXOS_DECISION_ENGINE_PROVISIONING_FILE ?? "/var/lib/overview-labs/decision-engine-provisioning.json", "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const settings = z.object({ sourceCompanyId: z.uuid(), sourceSecretId: z.uuid(), authorizedOwnerUserId: z.string().min(1), scope: z.literal("all-organizations") }).strict().parse(policy);
  const secrets = secretService(db);
  const { config } = await secrets.resolveAdapterConfigForRuntime(settings.sourceCompanyId, {
    env: { TYPESAFE_API_KEY: { type: "secret_ref", secretId: settings.sourceSecretId, version: "latest" } },
  }, {
    consumerType: "system", consumerId: "decision-engine-provisioning", responsibleUserId: settings.authorizedOwnerUserId,
    actorType: "user", actorId: settings.authorizedOwnerUserId, actorSource: "board_key",
  }, { adapterType: "typesafe", userSecretMediation: "owner_scoped" });
  const value = (config.env as Record<string, string>)?.TYPESAFE_API_KEY;
  if (!value) throw unprocessable("The owner's TypeSafe provisioning connection is unavailable");
  const created = await secrets.create(companyId, { name: "TYPESAFE_API_KEY", key: "typesafe_api_key", provider: "local_encrypted", value,
    description: "Real-Time Decision Engine connection provisioned under the owner's all-organizations instruction." }, { userId: settings.authorizedOwnerUserId });
  return created.id;
}

export function decisionEngineService(db: Db) {
  async function ensure(companyId: string) {
    // Serialize provisioning across controllers; do not hold the company row lock
    // while the normal agent admission service takes its own capacity lock.
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`decision-engine:${companyId}`}, 0))`);
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) throw notFound("Organization not found");
      const rows = await db.select().from(agents).where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")));
      const existing = rows.find(a => readBuiltInAgentMarker(a.metadata)?.key === DECISION_ENGINE_KEY)
        ?? rows.find(a => a.adapterType === "typesafe" && a.name === DECISION_ENGINE_NAME);
      const secretId = await provisionCredential(db, companyId);
      const svc = agentService(db);
      const adapterConfig = { ...(existing?.adapterConfig ?? {}), model: existing?.adapterConfig?.model ?? "jev-latest",
        timeoutSec: 45, maxRetries: 2, stateJson: "", questionsJson: "", agentOnly: true,
        ...(secretId ? { env: { TYPESAFE_API_KEY: { type: "secret_ref", secretId, version: "latest" } } } : {}) };
      const metadata = withBuiltInAgentMarker({ ...(existing?.metadata ?? {}), voice: { enabled: false } }, { key: DECISION_ENGINE_KEY, featureKeys: ["decision-engine"] });
      const runtimeConfig = { ...(existing?.runtimeConfig ?? {}), heartbeat: { enabled: false, wakeOnDemand: true } };
      const root = rows.find(a => !a.reportsTo && a.role === "ceo" && a.adapterType !== "typesafe")
        ?? rows.find(a => !a.reportsTo && a.adapterType !== "typesafe");
      if (existing) {
        return (await svc.update(existing.id, { name: DECISION_ENGINE_NAME, adapterConfig, metadata, runtimeConfig, reportsTo: existing.reportsTo ?? root?.id ?? null }, { allowBuiltInAgentMetadata: true, allowPendingApprovalConfigUpdate: true }))!;
      }
      const created = await svc.create(companyId, { name: DECISION_ENGINE_NAME, role: "general", title: "Agent-only structured evaluator",
        adapterType: "typesafe", adapterConfig, runtimeConfig, metadata, reportsTo: root?.id ?? null,
        capabilities: "Agent-only Choice, Score, and Noul evaluations for organization projects. Invoke through evaluate_decision; no user chat or action authorization.",
        status: company.requireBoardApprovalForNewAgents ? "pending_approval" : "idle", budgetMonthlyCents: 0 }, { allowBuiltInAgentMetadata: true });
      if (created.status === "pending_approval") await approvalService(db).create(companyId, {
        type: "hire_agent", status: "pending", requestedByUserId: company.defaultResponsibleUserId,
        payload: { agentId: created.id, name: created.name, role: created.role, title: created.title, reportsTo: created.reportsTo,
          adapterType: created.adapterType, adapterConfig: created.adapterConfig, runtimeConfig: created.runtimeConfig, permissions: created.permissions,
          budgetMonthlyCents: created.budgetMonthlyCents, metadata: created.metadata },
      });
      await logActivity(db, { companyId, actorType: "system", actorId: "decision-engine", action: "agent.decision_engine_provisioned", entityType: "agent", entityId: created.id });
      return created;
    });
  }

  async function read(companyId: string, callerAgentId: string, evaluationId: string, responsibleUserId: string | null, issueId: string) {
    const [receipt] = await db.select().from(decisionEvaluations).where(and(eq(decisionEvaluations.id, evaluationId), eq(decisionEvaluations.companyId, companyId), eq(decisionEvaluations.callerAgentId, callerAgentId)));
    if (!receipt) throw notFound("Evaluation not found");
    if (receipt.responsibleUserId !== responsibleUserId || receipt.issueId !== issueId) throw forbidden("Evaluation belongs to a different responsible user or task");
    // Recover a receipt interrupted after the durable wake was accepted. Never
    // resubmit an ambiguous provider request merely because runId was not saved.
    const [wake] = !receipt.runId ? await db.select().from(agentWakeupRequests).where(and(eq(agentWakeupRequests.companyId, companyId), eq(agentWakeupRequests.idempotencyKey, `jev:${receipt.id}`))) : [];
    const runId = receipt.runId ?? wake?.runId;
    const [run] = runId ? await db.select().from(heartbeatRuns).where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.agentId, receipt.engineAgentId))) : [];
    const actual = run?.resultJson;
    const complete = run?.status === "succeeded" && typeof actual?.model === "string" && actual?.answers && actual?.usage;
    return { evaluationId: receipt.id, agentId: receipt.engineAgentId, runId: runId ?? null,
      evidenceHash: typeof run?.contextSnapshot?.decisionEvidenceHash === "string" ? run.contextSnapshot.decisionEvidenceHash : null,
      status: run?.status === "succeeded" && !complete ? "result_unavailable" : run?.status ?? wake?.status ?? receipt.status,
      ...(complete ? { result: { model: actual.model, answers: actual.answers, usage: actual.usage } } : {}),
      ...(run && !["queued", "running", "succeeded"].includes(run.status) ? { error: decisionEvaluationFailure(run.errorCode, Buffer.byteLength(JSON.stringify(run.contextSnapshot?.state ?? null))) } : {}) };
  }

  async function evaluate(context: DecisionEvidenceContext, raw: unknown) {
    const input = decisionEvaluationSchema.parse(raw);
    const [provisioned] = await db.select().from(agents).where(and(eq(agents.companyId, context.companyId), ne(agents.status, "terminated"), sql`${agents.metadata} -> 'whoxosBuiltInAgent' ->> 'key' = ${DECISION_ENGINE_KEY}`));
    const engine = provisioned?.reportsTo ? provisioned : await ensure(context.companyId);
    if (engine.id === context.callerAgentId) throw forbidden("The decision engine cannot invoke itself");
    if (["paused", "pending_approval", "terminated"].includes(engine.status)) throw conflict("Real-Time Decision Engine is paused or awaiting its required hire approval");
    if (!engine.adapterConfig?.env) throw unprocessable("Configure TYPESAFE_API_KEY for this organization's Real-Time Decision Engine");
    const hash = createHash("sha256").update(JSON.stringify({ purpose: input.purpose, state: input.state, questions: input.questions, ...(input.taskReferences?.length ? { taskReferences: input.taskReferences } : {}), ...(input.taskEvidence?.length ? { taskEvidence: input.taskEvidence } : {}) })).digest("hex");
    const [existingReceipt] = await db.select().from(decisionEvaluations).where(and(eq(decisionEvaluations.companyId, context.companyId), eq(decisionEvaluations.callerAgentId, context.callerAgentId), eq(decisionEvaluations.idempotencyKey, input.idempotencyKey)));
    if (existingReceipt) {
      if (existingReceipt.inputHash !== hash || existingReceipt.issueId !== context.issueId) throw conflict("Evaluation key already belongs to different input or work");
      return read(context.companyId, context.callerAgentId, existingReceipt.id, context.responsibleUserId, context.issueId);
    }
    const evidence = await prepareDecisionEvidence(db, context, input);
    const [inserted] = await db.insert(decisionEvaluations).values({ companyId: context.companyId, callerAgentId: context.callerAgentId, callerRunId: context.callerRunId,
      issueId: context.issueId, responsibleUserId: context.responsibleUserId, engineAgentId: engine.id, idempotencyKey: input.idempotencyKey, inputHash: hash }).onConflictDoNothing().returning();
    if (!inserted) {
      const [prior] = await db.select().from(decisionEvaluations).where(and(eq(decisionEvaluations.companyId, context.companyId), eq(decisionEvaluations.callerAgentId, context.callerAgentId), eq(decisionEvaluations.idempotencyKey, input.idempotencyKey)));
      if (!prior || prior.inputHash !== hash || prior.issueId !== context.issueId) throw conflict("Evaluation key already belongs to different input or work");
      return read(context.companyId, context.callerAgentId, prior.id, context.responsibleUserId, context.issueId);
    }
    try {
      const run = await heartbeatService(db).wakeup(engine.id, { source: "on_demand", triggerDetail: "system", reason: "decision_engine_evaluation",
        idempotencyKey: `jev:${inserted.id}`, requestedByActorType: "agent", requestedByActorId: context.callerAgentId,
        contextSnapshot: { source: "decision-engine", responsibleUserId: context.responsibleUserId, decisionEvaluationId: inserted.id,
          decisionEngineCallerAgentId: context.callerAgentId, decisionEngineCallerRunId: context.callerRunId, decisionEngineIssueId: context.issueId,
          taskKey: `decision:${inserted.id}`, state: evidence.state, typesafeQuestions: evidence.questions, decisionDisplayQuestions: evidence.displayQuestions, decisionTaskReferences: evidence.references, decisionEvidenceHash: evidence.evidenceHash, purpose: evidence.purpose } });
      await db.update(decisionEvaluations).set({ runId: run?.id ?? null, status: run ? "queued" : "dispatch_unavailable" }).where(eq(decisionEvaluations.id, inserted.id));
      await logActivity(db, { companyId: context.companyId, actorType: "agent", actorId: context.callerAgentId, agentId: context.callerAgentId, runId: context.callerRunId,
        action: "decision.evaluation_requested", entityType: "agent", entityId: engine.id,
        details: { evaluationId: inserted.id, issueId: context.issueId, inputHash: hash, evidenceHash: evidence.evidenceHash, taskIds: evidence.references.map(ref => ref.id), runId: run?.id ?? null } });
    } catch (error) {
      await db.update(decisionEvaluations).set({ status: "dispatch_unknown" }).where(eq(decisionEvaluations.id, inserted.id));
      throw error;
    }
    return read(context.companyId, context.callerAgentId, inserted.id, context.responsibleUserId, context.issueId);
  }
  return { ensure, evaluate, read };
}
