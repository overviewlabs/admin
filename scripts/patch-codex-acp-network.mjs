import { createHash } from 'node:crypto';
import { chmodSync, chownSync, existsSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep this policy equivalent to patches/@agentclientprotocol__codex-acp@1.6.2.patch.
// The separately installed 1.13.1 runtime is not covered by that pnpm patch.
export const networkPolicyHelper = `function whoxosSandboxPolicy(sandboxPolicy) {
  const networkAccess = process.env.WHOXOS_CODEX_ACP_NETWORK_ACCESS;
  if (sandboxPolicy.type !== "workspaceWrite" || !["true", "false"].includes(networkAccess)) return sandboxPolicy;
  return { ...sandboxPolicy, networkAccess: networkAccess === "true" && process.env.WHOXOS_RUNNER_NETWORK_ACCESS !== "disabled" };
}`;
const unpatchedCall = 'sandboxPolicy: addAdditionalDirectoriesToSandboxPolicy(agentMode.sandboxPolicy, additionalDirectories),';
const patchedCall = 'sandboxPolicy: addAdditionalDirectoriesToSandboxPolicy(whoxosSandboxPolicy(agentMode.sandboxPolicy), additionalDirectories),';
const anchor = 'var CodexAcpClient = class {';

function exactlyOnce(source, value) {
  return source.indexOf(value) !== -1 && source.indexOf(value) === source.lastIndexOf(value);
}

export function patchCodexAcpNetwork(source, version) {
  if (!['1.6.2', '1.13.1'].includes(version)) throw new Error('Unsupported Codex ACP version; review the upstream turn boundary before patching');
  if (source.includes('function whoxosSandboxPolicy(')) {
    if (!exactlyOnce(source, networkPolicyHelper) || !exactlyOnce(source, patchedCall) || source.includes(unpatchedCall)) {
      throw new Error('Existing Codex ACP network patch differs from the reviewed policy');
    }
    return source;
  }
  if (!exactlyOnce(source, anchor) || !exactlyOnce(source, unpatchedCall) || source.includes(patchedCall)) {
    throw new Error('Codex ACP turn boundary changed; refusing an ambiguous patch');
  }
  return source.replace(anchor, networkPolicyHelper + '\n' + anchor).replace(unpatchedCall, patchedCall);
}

export function updateCodexAcpNetwork(packageDirectory, apply = false) {
  const directory = realpathSync(packageDirectory);
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  if (metadata.name !== '@agentclientprotocol/codex-acp') throw new Error('Expected the Codex ACP package directory');
  const file = realpathSync(join(directory, 'dist/index.js'));
  if (file !== join(directory, 'dist/index.js')) throw new Error('Unexpected redirected Codex ACP entry point');
  const original = readFileSync(file, 'utf8');
  const patched = patchCodexAcpNetwork(original, metadata.version);
  const digest = (content) => createHash('sha256').update(content).digest('hex');
  const changed = patched !== original;
  let backup;
  if (changed && apply) {
    const info = statSync(file);
    backup = file + '.overview-network-backup-' + digest(original).slice(0, 16);
    if (existsSync(backup)) {
      if (readFileSync(backup, 'utf8') !== original) throw new Error('Existing backup does not match original entry point');
    } else {
      writeFileSync(backup, original, { flag: 'wx', mode: info.mode & 0o777 });
      chownSync(backup, info.uid, info.gid);
    }
    const temporary = file + '.overview-network-' + process.pid + '.tmp';
    try {
      writeFileSync(temporary, patched, { flag: 'wx', mode: info.mode & 0o777 });
      chownSync(temporary, info.uid, info.gid);
      chmodSync(temporary, info.mode & 0o777);
      renameSync(temporary, file);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  return { version: metadata.version, status: changed ? (apply ? 'patched' : 'patch_required') : 'already_patched',
    entryPoint: file, sha256: digest(apply ? patched : original), ...(backup ? { backup } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, directory, ...extra] = process.argv.slice(2);
  if (!['--check', '--apply'].includes(mode) || !directory || extra.length) {
    throw new Error('Usage: node scripts/patch-codex-acp-network.mjs --check|--apply <codex-acp-package-directory>');
  }
  const result = updateCodexAcpNetwork(directory, mode === '--apply');
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.status === 'patch_required') process.exitCode = 1;
}
