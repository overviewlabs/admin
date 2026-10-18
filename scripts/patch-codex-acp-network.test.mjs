import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { networkPolicyHelper, patchCodexAcpNetwork, updateCodexAcpNetwork } from './patch-codex-acp-network.mjs';

const fixture = `var CodexAcpClient = class {
  async sendPrompt(request, agentMode, modelId, serviceTier, disableSummary, cwd, additionalDirectories, onTurnStarted, shouldCancel) {
    const input2 = buildPromptItems(request.prompt);
    await this.refreshSkills(cwd, additionalDirectories);
    if (shouldCancel?.()) return null;
    return await this.codexClient.runTurn({
      threadId: request.sessionId,
      input: input2,
      approvalPolicy: agentMode.approvalPolicy,
      approvalsReviewer: agentMode.approvalsReviewer,
      sandboxPolicy: addAdditionalDirectoriesToSandboxPolicy(agentMode.sandboxPolicy, additionalDirectories),
      model: modelId.model,
      serviceTier
    }, onTurnStarted);
  }
};`;

async function turn(source, env, policy) {
  const Type = runInNewContext(source + '\nCodexAcpClient', {
    process: { env }, buildPromptItems: (value) => value,
    addAdditionalDirectoriesToSandboxPolicy: (value) => value,
  });
  const client = new Type();
  client.refreshSkills = async () => {};
  client.codexClient = { runTurn: async (params) => params };
  return client.sendPrompt({ sessionId: 'existing-session', prompt: [] },
    { approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', sandboxPolicy: policy },
    { model: 'unchanged-model' }, 'priority', false, '/workspace', []);
}

test('reproduces the upstream preset overriding enabled adapter networking', async () => {
  const result = await turn(fixture, { WHOXOS_CODEX_ACP_NETWORK_ACCESS: 'true' }, { type: 'workspaceWrite', networkAccess: false });
  assert.equal(result.sandboxPolicy.networkAccess, false);
});

test('reviewed versions forward network permission at the actual turn boundary while preserving sandbox and review', async () => {
  for (const version of ['1.6.2', '1.13.1']) {
    const policy = { type: 'workspaceWrite', writableRoots: ['/workspace'], networkAccess: false };
    const result = await turn(patchCodexAcpNetwork(fixture, version), { WHOXOS_CODEX_ACP_NETWORK_ACCESS: 'true' }, policy);
    assert.equal(result.sandboxPolicy.networkAccess, true);
    assert.equal(result.sandboxPolicy.type, 'workspaceWrite');
    assert.equal(result.sandboxPolicy.writableRoots, policy.writableRoots);
    assert.equal(policy.networkAccess, false);
    assert.equal(result.approvalPolicy, 'on-request');
    assert.equal(result.approvalsReviewer, 'auto_review');
    assert.equal(result.model, 'unchanged-model');
  }
});

test('explicit operator and execution-target denials stay denied', async () => {
  for (const env of [{ WHOXOS_CODEX_ACP_NETWORK_ACCESS: 'false' },
    { WHOXOS_CODEX_ACP_NETWORK_ACCESS: 'true', WHOXOS_RUNNER_NETWORK_ACCESS: 'disabled' }]) {
    const result = await turn(patchCodexAcpNetwork(fixture, '1.13.1'), env, { type: 'workspaceWrite', networkAccess: true });
    assert.equal(result.sandboxPolicy.networkAccess, false);
  }
});

test('no override and other sandbox types remain unchanged', async () => {
  for (const env of [{}, { WHOXOS_CODEX_ACP_NETWORK_ACCESS: 'invalid' }]) {
    const policy = { type: 'workspaceWrite', networkAccess: false };
    assert.equal((await turn(patchCodexAcpNetwork(fixture, '1.13.1'), env, policy)).sandboxPolicy, policy);
  }
  for (const type of ['readOnly', 'dangerFullAccess']) {
    const policy = { type, networkAccess: false };
    assert.equal((await turn(patchCodexAcpNetwork(fixture, '1.13.1'), { WHOXOS_CODEX_ACP_NETWORK_ACCESS: 'true' }, policy)).sandboxPolicy, policy);
  }
});

test('patch is idempotent and refuses unreviewed versions or changed code', () => {
  const patched = patchCodexAcpNetwork(fixture, '1.13.1');
  assert.equal(patchCodexAcpNetwork(patched, '1.13.1'), patched);
  assert.throws(() => patchCodexAcpNetwork(fixture, '1.14.0'), /Unsupported/);
  assert.throws(() => patchCodexAcpNetwork(fixture + fixture, '1.13.1'), /ambiguous/);
  assert.throws(() => patchCodexAcpNetwork(fixture.replace('agentMode.sandboxPolicy,', 'changedPolicy,'), '1.13.1'), /changed/);
  assert.throws(() => patchCodexAcpNetwork(patched.replace(networkPolicyHelper, networkPolicyHelper.replace('networkAccess === "true"', 'true')), '1.13.1'), /differs/);
});

test('package check is read-only and apply preserves mode, makes backup, and is repeatable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'overview-acp-network-'));
  try {
    mkdirSync(join(directory, 'dist'));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@agentclientprotocol/codex-acp', version: '1.13.1' }));
    const file = join(directory, 'dist/index.js');
    writeFileSync(file, fixture);
    chmodSync(file, 0o755);
    assert.equal(updateCodexAcpNetwork(directory).status, 'patch_required');
    assert.equal(readFileSync(file, 'utf8'), fixture);
    const applied = updateCodexAcpNetwork(directory, true);
    assert.equal(applied.status, 'patched');
    assert.equal(readFileSync(applied.backup, 'utf8'), fixture);
    assert.equal(statSync(file).mode & 0o777, 0o755);
    assert.equal(updateCodexAcpNetwork(directory, true).status, 'already_patched');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
