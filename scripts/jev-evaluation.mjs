import { createHash } from 'node:crypto';
import { DECISION_SCOPE_RULE, DECISION_CLAIM_CRITERIA } from '../server/src/services/decision-evidence-policy.ts';

export const LABELS = ['supported', 'contradicted', 'unresolved'];
export const PROMPTS = Object.freeze({
  baseline: {
    supported: 'The supplied record supports the claim.',
    contradicted: 'The supplied record contradicts the claim.',
    unresolved: 'The supplied record does not resolve the claim.',
  },
  scoped: DECISION_CLAIM_CRITERIA,
});
export const SCOPED_RULES = DECISION_SCOPE_RULE;
export const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validateDataset(cases) {
  const ids = new Set(); const groups = new Map();
  for (const item of cases) {
    if (!item.id || ids.has(item.id) || !LABELS.includes(item.expected) || !['development', 'heldout'].includes(item.split)) throw Error('Invalid case identity, label or split');
    ids.add(item.id);
    const split = groups.get(item.workstream);
    if (split && split !== item.split) throw Error('Related workstream leaks across development and held-out sets');
    groups.set(item.workstream, item.split);
    if (!item.referenceQuote || !item.selection?.task || !item.claim) throw Error('Case lacks source-grounded reference evidence');
  }
  return { cases: ids.size, workstreams: groups.size };
}

// Gold labels and rationales are deliberately not accepted by this request builder.
export function buildEvaluation({ batchId, variant, claims, selections, callerTaskId, rotate = 0 }) {
  if (!PROMPTS[variant]) throw Error('Unknown prompt variant');
  const questions = Object.fromEntries(claims.map((item, i) => {
    const order = [...LABELS]; const offset = (i + rotate) % order.length;
    const keys = [...order.slice(offset), ...order.slice(0, offset)];
    return [item.id, { type: 'choice', instructions: {
      question: `Does the supplied task record establish this claim: ${item.claim}`,
      ...(variant === 'scoped' ? { evidenceRules: SCOPED_RULES } : {}),
      taskReferences: [item.task],
    }, criteria: Object.fromEntries(keys.map(key => [key, { label: key[0].toUpperCase() + key.slice(1), definition: PROMPTS[variant][key] }])) }];
  }));
  const content = {
    purpose: 'Blind evaluation of evidence interpretation in recorded engineering work; no release, trading or business action is authorized.',
    state: { scope: 'Judge only the supplied record at its recorded time, not current production reality. Other task history and binary artifacts have not been read. No prior model predictions or reference answers are supplied.' },
    taskEvidence: [{ task: callerTaskId, commentIds: [], documentKeys: [] }, ...selections],
    questions,
  };
  return { idempotencyKey: `jev-benchmark-v1:${batchId}:${variant}:${rotate}:${sha256(content).slice(0, 24)}`, ...content };
}

export function scoreCases(cases, receipts) {
  let correct = 0, brier = 0, logLoss = 0; const errors = [], unavailable = [];
  const confusion = Object.fromEntries(LABELS.map(label => [label, Object.fromEntries(LABELS.map(x => [x, 0]))]));
  const byLabel = Object.fromEntries(LABELS.map(label => [label, { total: 0, answered: 0, correct: 0 }]));
  for (const item of cases) {
    byLabel[item.expected].total++;
    const receipt = receipts.find(r => Object.hasOwn(r.request.questions, item.id));
    const answer = receipt?.outcome?.status === 'succeeded' ? receipt.outcome.result?.answers?.[item.id] : null;
    if (!answer || !LABELS.includes(answer.choice) || Object.keys(answer.probabilities ?? {}).length !== LABELS.length || !LABELS.every(key => Number.isFinite(answer.probabilities[key]) && answer.probabilities[key] >= 0 && answer.probabilities[key] <= 1) || Math.abs(LABELS.reduce((sum, key) => sum + answer.probabilities[key], 0) - 1) > .001) {
      unavailable.push({ id: item.id, status: receipt?.outcome?.status ?? 'not_run' }); continue;
    }
    byLabel[item.expected].answered++; confusion[item.expected][answer.choice]++;
    if (answer.choice === item.expected) { correct++; byLabel[item.expected].correct++; }
    else errors.push({ id: item.id, task: item.selection.task, expected: item.expected, actual: answer.choice, probabilities: answer.probabilities, confidence: answer.confidence });
    brier += LABELS.reduce((sum, key) => sum + (answer.probabilities[key] - Number(key === item.expected)) ** 2, 0);
    logLoss -= Math.log(Math.max(1e-12, answer.probabilities[item.expected]));
  }
  const answered = cases.length - unavailable.length;
  return { total: cases.length, answered, correct, accuracy: answered ? correct / answered : null, coverage: cases.length ? answered / cases.length : null, multiclassBrier: answered ? brier / answered : null, logLoss: answered ? logLoss / answered : null, confusion, byLabel, errors, unavailable };
}

export function compareOrder(first, second) {
  const rows = Object.keys(first).map(id => {
    const a = first[id], b = second[id];
    if (!b) throw Error('Order comparison is missing an answer');
    return { id, sameChoice: a.choice === b.choice, maxProbabilityChange: Math.max(...LABELS.map(key => Math.abs(a.probabilities[key] - b.probabilities[key]))) };
  });
  return { cases: rows.length, changedChoices: rows.filter(r => !r.sameChoice).length, maxProbabilityChange: rows.length ? Math.max(...rows.map(r => r.maxProbabilityChange)) : null, rows };
}
