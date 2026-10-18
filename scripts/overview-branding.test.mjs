import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
test('branding preserves protocol headers, markers, and environment identifiers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'overview-branding-'));
 try {
  const fixture=join(dir,'fixture.ts');
  writeFileSync(fixture,`import { WHOXOS } from "lucide-react"; import sdk from "@whoxos/shared"; const providers={"WHOXOS":{}}; const tool="WHOXOS_finish"; const header = "X-WHOXOS-Tab-Visible"; const route="X-WHOXOS-Route"; const run="Send X-WHOXOS-Run-Id on mutations."; const marker="# BEGIN WHOXOS MANAGED MCP"; const env="WHOXOS_API_KEY"; const copy="Sign in to WHOXOS";`);
  assert.throws(()=>execFileSync(process.execPath,['scripts/overview-branding.mjs',dir,'--check'],{stdio:'pipe'}));
  execFileSync(process.execPath,['scripts/overview-branding.mjs',dir]);
  const output=readFileSync(fixture,'utf8');
  for(const value of ['import { WHOXOS }','@whoxos/shared','"WHOXOS":','WHOXOS_finish','X-WHOXOS-Tab-Visible','X-WHOXOS-Route','X-WHOXOS-Run-Id','# BEGIN WHOXOS MANAGED MCP','WHOXOS_API_KEY','Sign in to WHOXOS'])assert.ok(output.includes(value),value);
  execFileSync(process.execPath,['scripts/overview-branding.mjs',dir,'--check']);
  assert.ok(!output.includes('X-Overview'));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
