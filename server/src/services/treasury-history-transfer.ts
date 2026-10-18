import { createHash, verify } from 'node:crypto';
import { readFile, stat, mkdir, open, rename } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { issueComments, type Db } from '@whoxos/db';
import type { ToolGatewayService } from './tool-gateway.js';
import { providerValue, WASABI_BUCKET, WASABI_COMPANY, WASABI_CONNECTION, WASABI_REGION, validateHistoryUrl, listingEntries } from './wasabi-private-probe.js';
const DATA='fc41a3fc-e1d2-4293-903a-b48c280a141d';
const ISSUE='202d7337-125d-40e7-a96e-5de8c9954230';
const PREFIX=`treasury/${WASABI_COMPANY}/research/history/`;
const JOURNAL='/var/lib/whox/.whox/treasury-history-dispatch';
const AUTHORS:Record<string,string>={review:'389e5e26-287a-4b5d-b34c-40a1aa4dc9bf',queryQuality:'389e5e26-287a-4b5d-b34c-40a1aa4dc9bf',retention:'44036826-983b-4c03-92d3-4056c3310996',budget:'10bf5dc5-8522-42a2-8456-9bc50cdd982d',localRestore:'10bf5dc5-8522-42a2-8456-9bc50cdd982d'};
type Obj=Record<string,any>;
export function canonical(v:any):string {return JSON.stringify(sort(v));}
function sort(v:any):any {if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
function deny():never {throw new Error('history_transfer_denied_or_unavailable');}
async function trustedJson(path:string) {
 const info=await stat(path);if(info.uid!==0||(info.mode&0o022)||!info.isFile()||info.size>8*1024*1024)deny();
 return JSON.parse(await readFile(path,'utf8')) as Obj;
}
export function decodeHistoryRequest(envelope:Obj,publicKey:string,now=Date.now()):Obj {
 try {
  if(!envelope||Object.keys(envelope).sort().join(',')!=='payload,signature'||typeof envelope.payload!=='string'||envelope.payload.length>950000)deny();
  const raw=Buffer.from(envelope.payload,'base64');
  if(!verify(null,raw,publicKey,Buffer.from(envelope.signature,'base64')))deny();
  const r=JSON.parse(raw.toString());
  const keys=['connectionId','action','key','sha256','bytes','scope','at','nonce','label',...(r.action==='put'?['ciphertext']:[])];
  if(Object.keys(r).sort().join(',')!==keys.sort().join(',')||r.connectionId!==WASABI_CONNECTION||!['put','get','delete','check','authorize'].includes(r.action)||!Number.isSafeInteger(r.at)||Math.abs(now-r.at)>30000||!/^[a-f0-9-]{36}$/.test(r.nonce)||!Number.isSafeInteger(r.bytes)||(['delete','check','authorize'].includes(r.action)?r.bytes!==0:r.bytes<42)||r.bytes>524288||!/^[a-f0-9]{64}$/.test(r.sha256))deny();
  const validLabel=r.label==='manifest'||(/^chunk:(0|[1-9][0-9]{0,5})$/.test(r.label)&&Number(r.label.split(':')[1])<131072)||(/^manifest-page:(0|[1-9][0-9]{0,3})$/.test(r.label)&&Number(r.label.split(':')[1])<1024);
  if(r.action==='authorize'?(r.label!=='admission'||r.sha256!=='0'.repeat(64)):r.action==='check'?(r.label!=='preflight'||r.sha256!=='0'.repeat(64)):r.action==='delete'?(r.label!=='purpose-end'||r.sha256!=='0'.repeat(64)):!validLabel)deny();
  const b=r.scope.binding;
  if(Object.keys(r.scope).sort().join(',')!=='binding,gate'||Object.keys(b).sort().join(',')!=='artifactHashes,envelopeSha256,identity,queryId,querySha256')deny();
  if(!/^[a-f0-9]{64}$/.test(b.envelopeSha256)||!/^[a-f0-9]{64}$/.test(b.querySha256)||!/^[a-f0-9]{64}$/.test(b.queryId))deny();
  const id=hash(canonical({binding:b,label:r.label})).slice(0,32);
  const expected=PREFIX+`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}.bin`;
  if(r.action==='delete'?!new RegExp('^'+PREFIX+'[a-f0-9-]{36}\\.bin$').test(r.key):r.key!==expected)deny();
  if(r.action==='put'){
   if(typeof r.ciphertext!=='string'||r.ciphertext.length>699052)deny();
   const bytes=Buffer.from(r.ciphertext,'base64');
   if(bytes.length!==r.bytes||hash(bytes)!==r.sha256||!bytes.subarray(0,14).equals(Buffer.from('TRS-AESGCM-v1\0')))deny();
  }
  return r;
 }catch{ return deny(); }
}
async function currentRecords(db:Db,refs:Obj) {
 const out:Obj={};
 for(const [gate,author] of Object.entries(AUTHORS)) {
  const ref=refs[gate];if(!ref?.issueId||!ref.commentId)deny();
  const rows=await db.select().from(issueComments).where(and(eq(issueComments.companyId,WASABI_COMPANY),eq(issueComments.issueId,ref.issueId),eq(issueComments.authorAgentId,author)));
  const records=rows.flatMap(row=>{try {const value=JSON.parse(row.body);return value.schema==='storage-control-record-v1'&&value.companyId===WASABI_COMPANY&&value.gate===gate?[{row,value}]:[];}catch{return [];}});
  records.sort((a,b)=>b.row.createdAt.getTime()-a.row.createdAt.getTime());
  const current=records[0];
  if(!current||current.row.id!==ref.commentId||current.row.deletedAt||current.row.authorUserId||records[1]?.row.createdAt.getTime()===current.row.createdAt.getTime()||current.value.revoked!==false||!Number.isFinite(current.value.validUntil)||current.value.validUntil<=Date.now()/1000)deny();
  out[gate]={...current.value.value,...(gate==='review'?{reviewerAgentId:author,decisionRecordId:ref.commentId}:{evidenceId:ref.commentId})};
 }
 return out;
}
export function releaseGate(config:Obj,r:Obj,records:Obj,now=Date.now()/1000) {
 const b=r.scope.binding, q=config.queries?.[b.queryId];
 // A replacement attempt has its own immutable envelope and source pins.
 // Preserve older query scopes for reads and reconciliation; partial overrides
 // must not inherit the other half of an unrelated release.
 const scoped=q&&(Object.hasOwn(q,'envelopeSha256')||Object.hasOwn(q,'artifactHashes'));
 if(scoped&&(!/^[a-f0-9]{64}$/.test(q.envelopeSha256??'')||!q.artifactHashes||typeof q.artifactHashes!=='object'||Array.isArray(q.artifactHashes)||!Object.keys(q.artifactHashes).length||Object.values(q.artifactHashes).some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))))deny();
 const expectedEnvelope=scoped?q.envelopeSha256:config.envelopeSha256;
 const expectedArtifacts=scoped?q.artifactHashes:config.artifactHashes;
 const {review,retention,budget,localRestore:restore,queryQuality:quality}=records;
 if(config.enabled!==true||b.envelopeSha256!==expectedEnvelope||canonical(b.artifactHashes)!==canonical(expectedArtifacts)||!q||q.querySha256!==b.querySha256||review.decision!=='accept'||review.scope!=='history-integrated'||canonical(review.artifactHashes)!==canonical(b.artifactHashes)||retention.verified!==true||restore.verified!==true||quality.verified!==true||typeof retention.purpose!=='string'||!retention.purpose||retention.purpose!==budget.purpose||!Number.isFinite(retention.expiresAt)||retention.expiresAt<=now||!Number.isSafeInteger(budget.maxBytes)||budget.maxBytes<=0||!Number.isFinite(budget.maxCostUsd)||budget.maxCostUsd<0)deny();
 for(const v of [retention,budget,quality])if(v.envelopeSha256!==b.envelopeSha256||v.querySha256!==b.querySha256||v.queryId!==b.queryId)deny();
 const gate={decision:'accept',artifactHashes:b.artifactHashes,envelopeSha256:b.envelopeSha256,querySha256:b.querySha256,retentionVerified:true,queryQualityVerified:true,localRestoreVerified:true,maxBytes:budget.maxBytes,maxCostUsd:budget.maxCostUsd,purpose:retention.purpose,expiresAt:retention.expiresAt,recordIds:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,(v as Obj).decisionRecordId??(v as Obj).evidenceId]))};
 if(canonical(gate)!==canonical(r.scope.gate))deny();return gate;
}
export async function reserveHistoryDispatch(r:Obj,directory=JOURNAL) {
 await mkdir(directory,{recursive:true,mode:0o700});
 // Exclusive files retain uncertain outcomes across API restarts. Never delete
 // automatically: a new nonce cannot redispatch the same remote PUT key.
 const names=[...(r.action==='put'?['key-'+hash(r.key)]:[]),'nonce-'+r.nonce];
 for(const name of names){const f=await open(directory+'/'+name+'.json','wx',0o600);try{await f.writeFile(JSON.stringify({key:r.key,action:r.action,nonce:r.nonce,sha256:r.sha256,bytes:r.bytes,state:'dispatch_unknown',scope:r.scope,label:r.label}));await f.sync();}finally{await f.close();}}
 const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
}
// A settled receipt is published only after the sole remote PUT has returned.
// The permanent key reservation prevents any later/replayed writer to this key.
export async function settleHistoryDispatch(r:Obj,directory=JOURNAL) {
 const path=directory+'/key-'+hash(r.key)+'.json';
 const saved=JSON.parse(await readFile(path,'utf8'));
 if(saved.nonce!==r.nonce||saved.sha256!==r.sha256||saved.state!=='dispatch_unknown')deny();
 const tmp=path+'.settling';const f=await open(tmp,'wx',0o600);
 try{await f.writeFile(JSON.stringify({...saved,state:'put_settled'}));await f.sync();}finally{await f.close();}
 await rename(tmp,path);const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
}
export async function cleanupHistoryDispatch(r:Obj,directory=JOURNAL) {
 const saved=JSON.parse(await readFile(directory+'/key-'+hash(r.key)+'.json','utf8'));
 if(saved.key!==r.key||canonical(saved.scope)!==canonical(r.scope)||saved.state!=='put_settled')deny();
 // Tombstone precedes remote deletion. It survives crashes and denies readback.
 const path=directory+'/ended-'+hash(r.key)+'.json';
 try{const f=await open(path,'wx',0o600);try{await f.writeFile(JSON.stringify({key:r.key,ended:true}));await f.sync();}finally{await f.close();}}
 catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
}
async function denyEnded(r:Obj) {
 try{await stat(JOURNAL+'/ended-'+hash(r.key)+'.json');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 deny();
}
export async function cleanupHistoryObject(gateway:ToolGatewayService,token:string,tools:Awaited<ReturnType<ToolGatewayService["listToolsForSession"]>>,r:Obj,authorize:()=>Promise<unknown>) {
  const op=async(name:string,parameters:Obj)=>{
   await authorize();
   const tool=tools.find(t=>t.connectionId===WASABI_CONNECTION&&t.upstreamToolName==='wasabi_s3_'+name);if(!tool)deny();
   const result=await gateway.executeTool({sessionToken:token,tool:tool.name,parameters});
   // The gateway deliberately replays a prior successful idempotent delete.
   // Settlement fences new writers; fresh listings below still prove absence.
   if(result.status==='replayed'&&name==='delete_object')return {};
   if(result.status!=='completed')deny();return providerValue(result.result);
  };
  const params={Bucket:WASABI_BUCKET,region:WASABI_REGION};
  const entries=listingEntries(await op('list_object_versions',{...params,Prefix:r.key,MaxKeys:1000}),r.key,'versions');
  for(const entry of entries)await op('delete_object',{...params,Key:r.key,VersionId:entry.VersionId});
  if(!entries.length)await op('delete_object',{...params,Key:r.key});
  const versions=listingEntries(await op('list_object_versions',{...params,Prefix:r.key,MaxKeys:1000}),r.key,'versions');
  const objects=listingEntries(await op('list_objects_v2',{...params,Prefix:r.key,MaxKeys:1000}),r.key,'objects');
  if(versions.length||objects.length)deny();
  return {objectKey:r.key,allVersionsAbsent:true,dispatchSettled:true};
}
export async function historyTransfer(db:Db,gateway:ToolGatewayService,token:string,envelope:Obj,actor?:{type:string;source?:string;agentId?:string;companyId?:string;runId?:string}) {
 const pub=await readFile('/etc/overview-labs/wasabi-worker-public.pem','utf8');
 const r=decodeHistoryRequest(envelope,pub);
 // Fast authority checks also preserve validity of the original run bearer.
 // The normal auth middleware validates its signature, expiry and revocation;
 // a gateway session alone cannot replace that independent credential check.
 if(r.action==='authorize'&&(actor?.type!=='agent'||actor.source!=='agent_jwt'||actor.agentId!==DATA||actor.companyId!==WASABI_COMPANY||actor.runId!==r.scope.binding.identity.id))deny();
 const authorize=async()=>{
  if(r.action==='delete') {
   try {
    const session=await gateway.verifiedMaintenanceSession(token);
    const maintenance=await trustedJson('/etc/overview-labs/treasury-history-maintenance.json');
    if(session.companyId!==WASABI_COMPANY||maintenance.companyId!==WASABI_COMPANY||session.gatewayId!==maintenance.gatewayId)deny();
    return r.scope.gate;
   }catch { /* A live Data run may also clean its persisted research scope. */ }
  }
  const session=await gateway.verifiedRunSession(token,r.action!=='delete');
  const identity={id:session.runId,companyId:session.companyId,role:'data',status:'running',checkoutRunId:session.runId};
  if(session.companyId!==WASABI_COMPANY||session.agentId!==DATA||(r.action!=='delete'&&session.issueId!==ISSUE)||(r.action!=='delete'&&canonical(identity)!==canonical(r.scope.binding.identity)))deny();
  if(r.action==='delete')return r.scope.gate;
  await denyEnded(r);
  const config=await trustedJson('/etc/overview-labs/treasury-history-release.json');
  return releaseGate(config,r,await currentRecords(db,config.queries?.[r.scope.binding.queryId]?.recordReferences));
 };
 const gate=await authorize();
 if(r.action==='authorize') {
  // Each call reads current run/checkout, release and independent decisions.
  // The signed expected scope is a comparison value, never cached authority.
  // No discovery, remote operation, write intent or positive token is issued.
  const session=await gateway.verifiedRunSession(token,true);
  const identity={id:session.runId,companyId:session.companyId,role:'data',status:'running',checkoutRunId:session.runId};
  if(session.companyId!==WASABI_COMPANY||session.agentId!==DATA||session.issueId!==ISSUE||canonical(identity)!==canonical(r.scope.binding.identity))deny();
  return {ok:true,operation:'history_authority_v1',identity,gate};
 }
 const tools=await gateway.listToolsForSession(token);
 if(r.action==='check') {
  // Local signing alone cannot establish that Wasabi accepts the credentials.
  // Validate private presigns, then make a bounded read-only S3 listing for the
  // exact signed preflight key. Provider details never leave the consumer.
  for(const action of ['put','get'])if(!tools.some(t=>t.connectionId===WASABI_CONNECTION&&t.upstreamToolName==='wasabi_s3_presign_'+action+'_object'))deny();
  const listTool=tools.find(t=>t.connectionId===WASABI_CONNECTION&&t.upstreamToolName==='wasabi_s3_list_objects_v2');if(!listTool)deny();
  for(const action of ['put','get']) {
   if(canonical(await authorize())!==canonical(gate))deny();
   const tool=tools.find(t=>t.connectionId===WASABI_CONNECTION&&t.upstreamToolName==='wasabi_s3_presign_'+action+'_object')!;
   let consumed=false;
   const result=await gateway.executeTool({sessionToken:token,tool:tool.name,idempotencyKey:`history-preflight:${r.nonce}:${action}`,
    parameters:{bucket:WASABI_BUCKET,key:r.key,region:WASABI_REGION,expiresIn:300,...(action==='put'?{contentType:'application/octet-stream'}:{})},
    consumePrivateResult:async raw=>{
     if(canonical(await authorize())!==canonical(gate))deny();
     validateHistoryUrl(providerValue(raw),r.key);
     consumed=true;
     return {operation:'history_storage_auth_check_v1',action,valid:true};
    }});
   if(!consumed||result.status!=='completed')deny();
  }
  if(canonical(await authorize())!==canonical(gate))deny();
  let listingConsumed=false;
  const listingResult=await gateway.executeTool({sessionToken:token,tool:listTool.name,timeoutMs:10000,
   idempotencyKey:`history-preflight:${r.nonce}:list`,
   parameters:{Bucket:WASABI_BUCKET,Prefix:r.key,region:WASABI_REGION,MaxKeys:1},
   consumePrivateResult:async raw=>{
    if(canonical(await authorize())!==canonical(gate))deny();
    const value=providerValue(raw);
    if(value.MaxKeys!==1)deny();
    listingEntries(value,r.key,'objects');
    listingConsumed=true;
    return {operation:'history_storage_auth_check_v1',action:'list',valid:true};
   }});
  if(!listingConsumed||listingResult.status!=='completed')deny();
  if(canonical(await authorize())!==canonical(gate))deny();
  return {ok:true,operation:'history_preflight_v1',queryId:r.scope.binding.queryId,envelopeSha256:r.scope.binding.envelopeSha256};
 }
 if(r.action==='delete') {
  await cleanupHistoryDispatch(r);
  await reserveHistoryDispatch(r);
  return cleanupHistoryObject(gateway,token,tools,r,authorize);
 }
 const name='wasabi_s3_presign_'+r.action+'_object';
 const tool=tools.find(t=>t.connectionId===WASABI_CONNECTION&&t.upstreamToolName===name);if(!tool)deny();
 let ciphertext:string|undefined,consumed=false;
 const result=await gateway.executeTool({sessionToken:token,tool:tool.name,parameters:{bucket:WASABI_BUCKET,key:r.key,region:WASABI_REGION,expiresIn:300,...(r.action==='put'?{contentType:'application/octet-stream'}:{})},consumePrivateResult:async raw=>{
  try {
   if(canonical(await authorize())!==canonical(gate))deny();
   const url=validateHistoryUrl(providerValue(raw),r.key);
   await reserveHistoryDispatch(r);
   const response=await fetch(url,{method:r.action.toUpperCase(),redirect:'error',signal:AbortSignal.timeout(30000),...(r.action==='put'?{body:Buffer.from(r.ciphertext,'base64'),headers:{'Content-Type':'application/octet-stream'}}:{})});
   if(!response.ok){await response.body?.cancel();deny();}
   if(r.action==='get'){
    if(!response.body)deny();const parts:Buffer[]=[];let size=0;
    for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){size+=part.length;if(size>r.bytes)deny();parts.push(Buffer.from(part));}
    const bytes=Buffer.concat(parts);if(bytes.length!==r.bytes||hash(bytes)!==r.sha256)deny();ciphertext=bytes.toString('base64');bytes.fill(0);
   }else {await response.body?.cancel();await settleHistoryDispatch(r);}
   if(canonical(await authorize())!==canonical(gate))deny();consumed=true;
   return {action:r.action,key:r.key,sha256:r.sha256,bytes:r.bytes};
  }catch{throw new Error(r.action==='put'?'history_put_outcome_unknown':'history_read_unverified');}
 }});
 if(!consumed||result.status!=='completed')deny();return {receipt:result.result,...(ciphertext?{ciphertext}:{})};
}
