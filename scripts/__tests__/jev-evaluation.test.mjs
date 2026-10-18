import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaluation, compareOrder, scoreCases, validateDataset } from '../jev-evaluation.mjs';
const item = { id: 'opaque_a', workstream: 'release', split: 'heldout', expected: 'supported', referenceQuote: 'Reviewed version passed', selection: { task: 'task-id', commentIds: ['comment-id'], documentKeys: [] }, claim: 'The review passed.' };
const request = () => buildEvaluation({ batchId: 'frozen', variant: 'scoped', claims: [{ id: item.id, claim: item.claim, task: item.selection.task }], selections: [item.selection], callerTaskId: 'caller' });
test('reference answers and prior results never enter the provider request', () => {
  const result = request(); const text = JSON.stringify(result);
  assert.ok(!text.includes(item.referenceQuote)); assert.ok(!text.includes('expected'));
  assert.equal(result.taskEvidence[0].commentIds.length, 0); assert.equal(result.taskEvidence[0].documentKeys.length, 0);
});
test('related workstreams cannot leak into a held-out split', () => {
  assert.throws(() => validateDataset([item, { ...item, id: 'opaque_b', split: 'development' }]), /leaks/);
});
test('duplicate or ungrounded reference cases are rejected', () => {
  assert.throws(() => validateDataset([item, item]));
  assert.throws(() => validateDataset([{ ...item, referenceQuote: '' }]));
});
test('same frozen request uses the same durable key, changed evidence uses a new key', () => {
  assert.equal(request().idempotencyKey, request().idempotencyKey);
  const other = buildEvaluation({ batchId: 'frozen', variant: 'scoped', claims: [{ id: item.id, claim: item.claim, task: 'task-id' }], selections: [{ ...item.selection, commentIds: ['new-comment'] }], callerTaskId: 'caller' });
  assert.notEqual(request().idempotencyKey, other.idempotencyKey);
});
test('option rotation changes only order and request version, not evidence or meaning', () => {
  const first = request(); const rotated = buildEvaluation({ batchId: 'frozen', variant: 'scoped', claims: [{ id: item.id, claim: item.claim, task: 'task-id' }], selections: [item.selection], callerTaskId: 'caller', rotate: 1 });
  assert.deepEqual(first.state, rotated.state); assert.deepEqual(first.taskEvidence, rotated.taskEvidence);
  assert.deepEqual(first.questions.opaque_a.instructions, rotated.questions.opaque_a.instructions);
  assert.notDeepEqual(Object.keys(first.questions.opaque_a.criteria), Object.keys(rotated.questions.opaque_a.criteria));
  for (const key of Object.keys(first.questions.opaque_a.criteria)) assert.deepEqual(first.questions.opaque_a.criteria[key], rotated.questions.opaque_a.criteria[key]);
});
test('known probability losses and incorrect outcomes are scored against gold, not confidence', () => {
  const receipts = [{ request: request(), outcome: { status: 'succeeded', result: { answers: { opaque_a: { choice: 'contradicted', confidence: 1, probabilities: { supported: .2, contradicted: .7, unresolved: .1 } } } } } }];
  const result = scoreCases([item], receipts);
  assert.equal(result.correct, 0); assert.equal(result.confusion.supported.contradicted, 1);
  assert.ok(Math.abs(result.multiclassBrier - 1.14) < 1e-10); assert.ok(Math.abs(result.logLoss + Math.log(.2)) < 1e-10);
});
test('failed, pending or invalid results remain unavailable; no fabricated zero losses', () => {
  for (const status of ['failed', 'running', 'succeeded']) {
    const result = scoreCases([item], [{ request: request(), outcome: { status, result: {} } }]);
    assert.equal(result.answered, 0); assert.equal(result.accuracy, null); assert.equal(result.multiclassBrier, null); assert.equal(result.coverage, 0);
  }
});
test('order stability records changed choices and probability movement separately', () => {
  const a = { opaque_a: { choice: 'supported', probabilities: { supported: .6, contradicted: .3, unresolved: .1 } } };
  const b = { opaque_a: { choice: 'contradicted', probabilities: { supported: .4, contradicted: .5, unresolved: .1 } } };
  assert.equal(compareOrder(a, b).changedChoices, 1); assert.ok(Math.abs(compareOrder(a, b).maxProbabilityChange - .2) < 1e-10);
});
