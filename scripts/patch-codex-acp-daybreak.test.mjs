import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patchCodexAcpDaybreak } from './patch-codex-acp-daybreak.mjs';

test('adds the explicit program at the selected model turn boundary', () => {
  const result = patchCodexAcpDaybreak('prefix\n      model: modelId.model,\n      serviceTier\nsuffix');
  assert.ok(result.includes('modelId.model === "gpt-6-sol" ? { cyberAccessProgram: "daybreakBlue" } : {}'));
  assert.equal(patchCodexAcpDaybreak(result), result);
});
test('rejects missing or duplicated turn boundaries', () => {
  assert.throws(() => patchCodexAcpDaybreak('unrecognized runtime'));
  assert.throws(() => patchCodexAcpDaybreak('      model: modelId.model,\n      serviceTier\n      model: modelId.model,\n      serviceTier'));
});
