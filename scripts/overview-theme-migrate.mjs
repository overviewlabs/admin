// Repeatable migration of legacy neutral paint to the shared WHOX semantic theme.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../ui/src');
const neutral={
 'ring-neutral-400':'ring-ring',
 'bg-neutral-100':'bg-muted','dark:bg-neutral-950':'dark:bg-muted',
 'text-neutral-400':'text-muted-foreground','text-neutral-500':'text-muted-foreground','dark:text-neutral-400':'dark:text-muted-foreground','dark:text-neutral-600':'dark:text-muted-foreground',
 'bg-neutral-400':'bg-muted-foreground','bg-gray-400':'bg-muted-foreground','bg-zinc-700':'bg-muted-foreground',
 'border-zinc-600':'border-border','text-zinc-500':'text-muted-foreground',
 'border-neutral-300/70':'border-border/70','dark:border-neutral-700/70':'dark:border-border/70','dark:bg-neutral-900/20':'dark:bg-muted/20','dark:bg-neutral-900/35':'dark:bg-muted/35',
 'bg-slate-50':'bg-muted','border-slate-300':'border-border','text-slate-700':'text-muted-foreground','dark:bg-slate-500/15':'dark:bg-muted','dark:border-slate-500/30':'dark:border-border','dark:text-slate-300':'dark:text-muted-foreground',
 'bg-slate-900':'bg-muted','text-slate-100':'text-foreground','placeholder:text-slate-500':'placeholder:text-muted-foreground','focus-visible:ring-slate-400':'focus-visible:ring-ring',
 'bg-neutral-950':'bg-muted','text-neutral-200':'text-foreground',
};
const invite={
 'bg-zinc-950/95':'bg-card','bg-zinc-950':'bg-background','bg-zinc-100':'bg-primary','bg-zinc-800':'bg-muted',
 'border-zinc-800':'border-border','border-zinc-100':'border-primary','focus:border-zinc-500':'focus:border-ring','hover:border-zinc-600':'hover:border-ring',
 'text-zinc-100':'text-foreground','text-zinc-200':'text-foreground','text-zinc-300':'text-muted-foreground','text-zinc-400':'text-muted-foreground','text-zinc-500':'text-muted-foreground','text-zinc-950':'text-primary-foreground','rounded-none':'rounded-lg',
};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.tsx')&&!e.name.includes('.test.')){
 let s=fs.readFileSync(p,'utf8');const before=s;
 const map=e.name.startsWith('Invite')?invite:neutral;
 // Terminal canvas intentionally retains a fixed dark palette, now named in the token layer.
 if(e.name==='CompanyEnvironments.tsx')s=s.replaceAll('bg-neutral-950','bg-terminal-surface');
 for(const [from,to]of Object.entries(map).sort((a,b)=>b[0].length-a[0].length)){
 s=s.replace(new RegExp('(?<![\\w:-])'+from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w/-])','g'),to);
 }
 s=s.replaceAll('bg-black/[0.18]','bg-muted/50').replaceAll('bg-black/10 px-1 py-0.5 text-xs font-medium dark:bg-white/10','bg-muted px-1 py-0.5 text-xs font-medium');
 if(s!==before){fs.writeFileSync(p,s);console.log(path.relative(root,p));}
}}}
walk(path.join(root,'pages'));walk(path.join(root,'components'));
