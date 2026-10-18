# Jev evidence evaluation

Jev is a typed judgment API. This integration tunes instructions and evidence
selection; it does not train provider weights. Model probabilities and Choice
confidence are not independently measured accuracy or authorization to act.

The shared evidence policy lives in
`server/src/services/decision-evidence-policy.ts`. The normal decision worker
applies its scope rule to every evaluation. Agent guidance includes the same
tested claim criteria. Current and future agents receive this guidance through
their ordinary organization context and `evaluate_decision` tool description.

For an atomic evidence check, use Choice alternatives `supported`,
`contradicted`, and `unresolved` with `DECISION_CLAIM_CRITERIA`. Specify the
artifact version, time, environment and scope. A failed assessment can be a
completed task; a mocked test or review does not prove a production deployment.
Missing verification does not prove that something is absent. Keep observed
facts, plans and source claims distinct. Include decisive contrary evidence and
active blockers. Task links stay concise; the authenticated worker supplies the
full permitted bodies of explicitly selected task evidence.

## Running a bounded blind evaluation

1. Freeze actual permitted task records, evidence selections and reference
   labels before calling the provider. Keep reference labels and rationales in
   a separate private file, inaccessible to the agent process. Record source
   hashes and review scope; these labels do not certify current production.
2. Split by related workstream, keeping all related versions and reviews in
   the same partition. Do not seed state, options or caller task history with
   previous predictions or reference answers.
3. Supply a secret-free plan containing `claims` (opaque `id`, `claim`, `task`,
   `split`, `workstream`), explicit `selections`, and `callerTaskId`. Run
   `scripts/jev-live-evaluation.mjs PLAN_PATH DURABLE_OUTPUT_DIRECTORY` using
   the normal authenticated, task-bound process adapter. Pin the engine model
   version through ordinary settings and restore the original setting after
   testing. Never resolve a provider key in this harness.
4. Score development receipts with `scoreCases` in
   `scripts/jev-evaluation.mjs`. Record the prompt-selection rule beforehand.
   Write the chosen `variant` (`baseline` or `scoped`) to `selection.json` in
   the output directory before examining held-out predictions. The harness
   then evaluates held-out records and repeats them with rotated option order.
5. Verify the worker's actual evidence, result, version and receipt hashes
   against the frozen records. Save all receipts, including unavailable or
   uncertain outcomes. Keep the original idempotency key after an ambiguous
   dispatch; do not purchase a new request to conceal a failure.

The harness stops new dispatches after 24 requests or 350,000 observed input
tokens. Token usage for the next call is not known before dispatch; this is an
observed-usage stop, not a prepaid billing ceiling. Respect the organization's
normal admission and spending controls as well.

Report coverage, matched reference labels, per-class confusion, multiclass
Brier score (sum across classes), log loss, individual mistakes and option-order
changes. Missing results stay unavailable. Do not count rotated repetitions as
additional independent cases. Inspect confident mistakes and near ties; do not
adjust returned probabilities or treat a tied choice as a unique winner.

The October 7, 2026 pilot used 42 real record-grounded cases from 14 tasks and
four workstreams: 27 development cases and 15 held-out cases. The scoped prompt
matched 26/27 development and 14/15 held-out reference labels, with lower Brier
and log-loss scores than the baseline. All 15 held-out choices were unchanged
under one order rotation. Both prompts retained one highly confident held-out
mistake. These correlated, developer-labeled records establish a useful small
regression suite, not general accuracy, calibration, or optimal engineering
priorities. More independent labeled outcomes are needed for those claims.

Run local verification with:

```sh
node --test scripts/__tests__/jev-evaluation.test.mjs
node node_modules/vitest/vitest.mjs run server/src/__tests__/decision-engine.integration.test.ts --maxWorkers=1
```

Provider references: [models and customization](https://docs.typesafe.ai/models),
[Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), and
[confidence](https://docs.typesafe.ai/confidence).
