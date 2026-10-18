import fs from 'node:fs';
import path from 'node:path';
import ts from '/opt/overview-tools/node_modules/typescript/lib/typescript.js';
const checkOnly = process.argv.includes('--check');
const root = process.argv[2] || 'ui';
let files = 0;
const replace = s => s.replace(/(?<=\\[nrt])WHOXOS\b/g, 'WHOXOS').replace(/https:\/\/whoxos\.ing(?=[)"'`]|$)/g, 'https://overviewlabs.ai').replace(/whoxos cli/g, 'WHOXOS CLI').replace(/See the whoxos skill/g, 'See the WHOXOS skill').replace(/(?<![A-Za-z0-9_./:@-])WHOXOS\b/g, 'WHOXOS');
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules','dist','.git'].includes(entry.name)) walk(p);
    else if (entry.isFile() && /\.(tsx?|jsx?|html|json|webmanifest|svg)$/.test(p)) {
      const input = fs.readFileSync(p, 'utf8');
      let output = input;
      if (/\.[jt]sx?$/.test(p)) {
        const source = ts.createSourceFile(p,input,ts.ScriptTarget.Latest,true,p.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.JS);
        const edits=[];
        const visit = n => {
          if (ts.isStringLiteral(n) || ts.isTemplateLiteralToken(n) || ts.isJsxText(n)) {
            if ((ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)) || (ts.isPropertyAssignment(n.parent) && n.parent.name === n)) return;
            const start=n.getStart(source), end=n.end, raw=input.slice(start,end), value=replace(raw);
            if(value!==raw) edits.push({start,end,value});
          }
          ts.forEachChild(n,visit);
        };
        visit(source);
        for(const e of edits.sort((a,b)=>b.start-a.start)) output=output.slice(0,e.start)+e.value+output.slice(e.end);
      } else output=replace(input);
      if (output!==input) {if (!checkOnly) fs.writeFileSync(p,output); files++;}
    }
  }
}
walk(root);
console.log(`${checkOnly ? 'Unbranded display text in' : 'Rebranded display text in'} ${files} files under ${root}`);
if (checkOnly && files) process.exitCode = 1;
