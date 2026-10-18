import fs from 'node:fs/promises';
import path from 'node:path';
import { buildEvaluation, sha256 } from './jev-evaluation.mjs';

// Run only as a normal task-bound agent. It never reads a provider credential or
// the private reference labels. Completed and uncertain receipts are retained.
const [planPath, outputPath] = process.argv.slice(2);
if (!planPath || !outputPath || !process.env.WHOXOS_API_KEY || !process.env.WHOXOS_RUN_ID) throw Error('Run with a frozen plan and durable output directory in an authenticated task-bound agent');
const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
const base = process.env.WHOXOS_API_URL.replace(/\/+$/, '').replace(/\/api$/, '');
const company = process.env.WHOXOS_COMPANY_ID;
// The process adapter supplies a run token but no task-id environment variable.
// The server independently resolves/authorizes the actual task from that token.
const task = process.env.WHOXOS_TASK_ID ?? plan.callerTaskId;
if (!company || !task) throw Error('Company and explicit caller-task selection are required');
const endpoint = `${base}/api/companies/${company}/decision-engine/evaluations`;
async function api(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${process.env.WHOXOS_API_KEY}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
  const result = await response.json();
  if (!response.ok) throw Error(`Authenticated evaluation failed (${response.status}): ${result.error ?? result.message ?? 'No result'}`);
  return result;
}
async function save(file, value) {
  const temp = `${file}.new`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temp, file);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let totalTokens = 0, dispatched = 0;
const resultRows = [];
const taskSets = {
  development: plan.selections.filter(s => plan.claims.some(c => c.task === s.task && c.split === 'development')),
  heldout: plan.selections.filter(s => plan.claims.some(c => c.task === s.task && c.split === 'heldout')),
};
function batches(split) {
  const selected = taskSets[split]; const result = [];
  for (let i = 0; i < selected.length; i += 2) {
    const selections = selected.slice(i, i + 2);
    result.push({ batchId: `${split}-${i / 2}`, selections, claims: plan.claims.filter(c => selections.some(s => s.task === c.task)).map(c => ({ id: c.id, task: c.task, claim: c.claim })) });
  }
  return result;
}
async function evaluate(batch, variant, rotate = 0) {
  if (dispatched >= 24 || totalTokens >= 350_000) throw Error('Predeclared call/token budget reached; retained prior receipts');
  const request = buildEvaluation({ ...batch, variant, rotate, callerTaskId: task });
  if (Object.values(request.questions).some(q => q.instructions.question.length > 240)) throw Error('Question exceeds the concise instruction contract');
  const file = path.join(outputPath, `${batch.batchId}-${variant}-${rotate}.json`);
  let row;
  try { row = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (row && sha256(row.request) !== sha256(request)) throw Error('Frozen request drift; retained receipt was not replayed');
  if (!row) {
    row = { request, requestedAt: new Date().toISOString() };
    // Save the stable key before dispatch. A restart queries the same key only.
    await save(file, row);
  }
  if (!row.receipt) { row.receipt = await api(endpoint, 'POST', request); await save(file, row); }
  // Assert normal durable idempotency once; this must not repurchase a request.
  if (dispatched === 0) {
    const retry = await api(endpoint, 'POST', request);
    if (retry.evaluationId !== row.receipt.evaluationId) throw Error('Stable key created a second evaluation');
  }
  dispatched++;
  if (!row.outcome || ['queued', 'running', 'pending', 'dispatching'].includes(row.outcome.status)) {
    for (let i = 0; i < 55; i++) {
      const outcome = await api(`${endpoint}/${row.receipt.evaluationId}`);
      if (!['queued', 'running', 'pending', 'dispatching'].includes(outcome.status)) {
        row.outcome = outcome; row.finishedAt = new Date().toISOString(); await save(file, row); break;
      }
      await sleep(1500);
    }
  }
  if (!row.outcome) throw Error('Outcome remains uncertain; retain original request without redispatch');
  if (row.outcome.status !== 'succeeded') throw Error(`Provider run did not produce answers: ${row.outcome.status}; receipt retained`);
  if (row.outcome.result.model !== 'jev-1.13.0') throw Error('Model version drift; stop without combining results');
  totalTokens += row.outcome.result.usage.input_tokens;
  resultRows.push({ file: path.basename(file), evaluationId: row.receipt.evaluationId, inputTokens: row.outcome.result.usage.input_tokens });
  console.log(JSON.stringify({ batch: batch.batchId, variant, rotate, status: row.outcome.status, evaluationId: row.receipt.evaluationId, totalTokens }));
}
for (const batch of batches('development')) {
  await evaluate(batch, 'baseline'); await evaluate(batch, 'scoped');
}
await save(path.join(outputPath, 'development-complete.json'), { planHash: sha256(plan), dispatched, totalTokens, rows: resultRows });
let selection;
for (let i = 0; i < 120; i++) {
  try { selection = JSON.parse(await fs.readFile(path.join(outputPath, 'selection.json'), 'utf8')); break; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await sleep(1500);
}
if (!selection || !['baseline', 'scoped'].includes(selection.variant)) throw Error('Development selection was not recorded; held-out set has not run');
for (const batch of batches('heldout')) {
  await evaluate(batch, 'baseline'); await evaluate(batch, 'scoped');
}
for (const batch of batches('heldout')) await evaluate(batch, selection.variant, 1);
await save(path.join(outputPath, 'complete.json'), { model: 'jev-1.13.0', selectedVariant: selection.variant, dispatched, totalTokens, rows: resultRows });
console.log(JSON.stringify({ completed: true, dispatched, totalTokens }));
