import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../ui/src');
let scanned=0;const failures=[];
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(file.endsWith('.tsx')&&!file.includes('.test.')){scanned++;const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/(?:bg|text|border|ring)-(?:zinc|neutral|slate|gray)-\d+/g))failures.push(`${path.relative(root,file)}: ${match[0]}`);}}}
scan(path.join(root,'pages'));scan(path.join(root,'components'));
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`WHOX theme audit passed: ${scanned} components/pages, no hardcoded neutral utility palettes.`);
