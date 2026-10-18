import fs from 'node:fs/promises';import path from 'node:path';import {createReadStream} from 'node:fs';import crypto from 'node:crypto';import {sql} from './store.mjs';
const roots={
 'studio-previews':'/var/lib/docker/volumes/whox-studio_previews/_data',
 'studio-projects':'/var/lib/docker/volumes/whox-studio_template-work/_data',
 'studio-data':'/var/lib/docker/volumes/whox-studio_dashboard-data/_data',
 'whoxos-assets':'/.WHOX/.System/overview-labs/home/.whox/instances/default/data/storage',
 'admin-uploads':'/.WHOX/.System/.Admin/data/uploads',
};
const apply=process.argv.includes('--apply'),now=Date.now();let files=0,bytes=0;
try{
for(const [namespace,root] of Object.entries(roots)){
 const rows=await sql`SELECT key,byte_size,sha256 FROM overview_storage.objects WHERE namespace=${namespace} AND NOT deleted`;
 for(const row of rows){
  if(namespace==='studio-previews'&&row.key.startsWith('catalog/'))continue;
  if(namespace==='studio-data'&&(!row.key.startsWith('blueprint-thumbnails/')&&!/\/site\//.test(row.key)))continue;
  if(namespace==='studio-data'&&/\/(?:\.shares|\.builds)\//.test(row.key))continue;
  const file=path.resolve(root,row.key);if(!file.startsWith(root+'/'))throw Error('Invalid indexed path');
  const before=await fs.lstat(file).catch(()=>null);if(!before?.isFile()||before.isSymbolicLink())continue;
  if(['admin-uploads','whoxos-assets'].includes(namespace)&&before.mtimeMs>now-86400000)continue;
  const real=await fs.realpath(file);if(!real.startsWith(root+'/'))continue;
  if(before.size!==Number(row.byte_size))continue;
  const digest=crypto.createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);
  if(digest.digest('hex')!==row.sha256)continue;
  const after=await fs.lstat(file).catch(()=>null);if(!after||after.mtimeMs!==before.mtimeMs||after.size!==before.size)continue;
  if(apply)await fs.unlink(file);
  files++;bytes+=before.size;
 }
}
const receipt='/var/lib/overview-file-store/backup-receipts.json';
const records=JSON.parse(await fs.readFile(receipt,'utf8').catch(()=>'{"empty":{}}'));
for(const [file,e] of Object.entries(records)){
 const allowed=file.startsWith('/.WHOX/.System/overview-labs/home/.whox/instances/default/data/backups/')&&file.endsWith('.sql.gz');
 if(!allowed)continue;
 const s=await fs.lstat(file).catch(()=>null);if(!s?.isFile()||s.isSymbolicLink()||s.mtimeMs>now-86400000)continue;
 if(e.fingerprint?.[0]!==s.size||e.fingerprint?.[1]!==Number((await fs.stat(file,{bigint:true})).mtimeNs))continue;
 const object=(await sql`SELECT key FROM overview_storage.objects WHERE namespace='backups' AND key=${e.key} AND NOT deleted`)[0];if(!object)continue;
 if(apply)await fs.unlink(file);files++;bytes+=s.size;
}
// Hydrated source is disposable. Recent or open projects stay available even
// when the cache temporarily exceeds its two GiB target during active work.
const cache='/var/lib/docker/volumes/whox-studio_dashboard-data/_data/working-cache',projects=[];
async function treeSize(dir){let bytes=0;for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory())bytes+=await treeSize(file);else if(e.isFile())bytes+=(await fs.stat(file)).size;}return bytes;}
for(const namespace of ['studio-source','studio-projects']){
 const root=path.join(cache,namespace);
 for(const e of await fs.readdir(root,{withFileTypes:true}).catch(()=>[]))if(e.isDirectory()&&!e.isSymbolicLink()){
  const dir=path.join(root,e.name),info=await fs.stat(dir);projects.push({dir,size:await treeSize(dir),used:info.mtimeMs});
 }
}
let cacheBytes=projects.reduce((n,p)=>n+p.size,0);
for(const p of projects.sort((a,b)=>a.used-b.used)){
 if(p.used>now-600000||(!(p.used<now-86400000)&&cacheBytes<=2*1024**3))continue;
 const containerPath='/app-data/working-cache/'+path.relative(cache,p.dir);let active=false;
 for(const pid of (await fs.readdir('/proc')).filter(p=>/^\d+$/.test(p))){
  for(const suffix of ['cwd',...(await fs.readdir('/proc/'+pid+'/fd').catch(()=>[])).map(fd=>'fd/'+fd)]){
   const ref=await fs.readlink('/proc/'+pid+'/'+suffix).catch(()=>'');if(ref===p.dir||ref.startsWith(p.dir+'/')||ref===containerPath||ref.startsWith(containerPath+'/')){active=true;break;}
  }
  if(active)break;
 }
 if(active||(await fs.stat(p.dir)).mtimeMs!==p.used)continue;
 if(apply)await fs.rm(p.dir,{recursive:true});cacheBytes-=p.size;bytes+=p.size;
}
console.log(JSON.stringify({applied:apply,files,bytes,at:new Date().toISOString()}));
if(apply)await fs.writeFile('/var/lib/overview-file-store/eviction-status.json',JSON.stringify({files,bytes,at:new Date().toISOString()}),{mode:0o600});
}finally{await sql.end();}
