import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const original = '      model: modelId.model,\n      serviceTier';
const patched = '      model: modelId.model,\n      ...(modelId.model === "gpt-6-sol" ? { cyberAccessProgram: "daybreakBlue" } : {}),\n      serviceTier';

export function patchCodexAcpDaybreak(source) {
  if (source.includes(patched)) return source;
  if (source.split(original).length !== 2) throw new Error('Codex ACP turn boundary changed; refusing ambiguous Daybreak patch');
  return source.replace(original, patched);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Expected Codex ACP package directory');
  const file = join(directory, 'dist/index.js');
  const source = readFileSync(file, 'utf8');
  const result = patchCodexAcpDaybreak(source);
  if (result !== source) writeFileSync(file, result);
  process.stdout.write(JSON.stringify({ patched: result !== source, file }) + '\n');
}
