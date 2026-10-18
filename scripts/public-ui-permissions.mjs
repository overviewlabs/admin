import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only use on a built, public UI tree. Never on HOME, source, or runtime secrets.
export function normalizePublicUi(directory, { checkOnly = false } = {}) {
  const root = path.resolve(directory);
  if (!['dist', 'dist-preview', 'ui-dist'].includes(path.basename(root))) throw new Error('Expected a public UI dist directory');
  const entries = [];
  function scan(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error(`Unexpected artifact type: ${file}`);
    if (path.basename(file).startsWith('.')) throw new Error(`Hidden file is not a public UI artifact: ${file}`);
    entries.push({file, mode:stat.mode & 0o7777, expected:stat.isDirectory() ? 0o755 : 0o644});
    if (stat.isDirectory()) for (const name of fs.readdirSync(file)) scan(path.join(file, name));
  }
  scan(root);
  if (!fs.statSync(path.join(root, 'index.html')).isFile()) throw new Error('Missing UI entry point');
  const wrong = entries.filter(entry => entry.mode !== entry.expected);
  if (checkOnly && wrong.length) throw new Error(`${wrong.length} public UI artifacts have unsafe or unreadable permissions`);
  for (const entry of wrong) fs.chmodSync(entry.file, entry.expected);
  return {checked:entries.length, repaired:wrong.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const directory = process.argv[2];
    if (!directory) throw new Error('Usage: node public-ui-permissions.mjs <ui-dist|dist> [--check]');
    const result = normalizePublicUi(directory, {checkOnly:process.argv.includes('--check')});
    if (result.repaired || process.argv.includes('--check')) console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
