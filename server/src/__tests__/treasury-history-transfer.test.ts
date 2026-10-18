import { mkdtemp,rm,readFile,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe,it,expect } from 'vitest';
import { createHash,generateKeyPairSync,randomUUID,sign } from 'node:crypto';
import { canonical,decodeHistoryRequest,releaseGate,reserveHistoryDispatch,settleHistoryDispatch,cleanupHistoryDispatch,cleanupHistoryObject } from '../services/treasury-history-transfer.js';
import { WASABI_COMPANY,WASABI_CONNECTION } from '../services/wasabi-private-probe.js';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'pem'}).toString();
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
function fixture(){
 const binding={envelopeSha256:'a'.repeat(64),querySha256:'b'.repeat(64),queryId:'c'.repeat(64),artifactHashes:{source:'d'.repeat(64)},identity:{id:randomUUID(),companyId:WASABI_COMPANY,role:'data',status:'running',checkoutRunId:'test'}};
 const q={envelopeSha256:binding.envelopeSha256,querySha256:binding.querySha256,queryId:binding.queryId};
 const records={review:{decision:'accept',scope:'history-integrated',artifactHashes:binding.artifactHashes,decisionRecordId:'review'},retention:{...q,verified:true,purpose:'research',expiresAt:Date.now()/1000+300,evidenceId:'retention'},budget:{...q,purpose:'research',maxBytes:1000000,maxCostUsd:1,evidenceId:'budget'},localRestore:{verified:true,evidenceId:'restore'},queryQuality:{...q,verified:true,evidenceId:'quality'}};
 const gate={decision:'accept',artifactHashes:binding.artifactHashes,envelopeSha256:binding.envelopeSha256,querySha256:binding.querySha256,retentionVerified:true,queryQualityVerified:true,localRestoreVerified:true,maxBytes:1000000,maxCostUsd:1,purpose:'research',expiresAt:records.retention.expiresAt,recordIds:{review:'review',retention:'retention',budget:'budget',localRestore:'restore',queryQuality:'quality'}};
 const config={enabled:true,envelopeSha256:binding.envelopeSha256,artifactHashes:binding.artifactHashes,queries:{[binding.queryId]:{querySha256:binding.querySha256}}};
 const id=sha(canonical({binding,label:'chunk:0'})).slice(0,32);
 const key=`treasury/${WASABI_COMPANY}/research/history/${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}.bin`;
 const bytes=Buffer.concat([Buffer.from('TRS-AESGCM-v1\0'),Buffer.alloc(50)]);
 const request={connectionId:WASABI_CONNECTION,action:'put',key,sha256:sha(bytes),bytes:bytes.length,scope:{binding,gate},at:Date.now(),nonce:randomUUID(),label:'chunk:0',ciphertext:bytes.toString('base64')};
 return {request,config,records};
}
function seal(request:unknown){const raw=Buffer.from(JSON.stringify(request));return {payload:raw.toString('base64'),signature:sign(null,raw,privateKey).toString('base64')};}
describe('governed Treasury history transfer boundary',()=>{
 it('persists key and nonce fences before dispatch and denies a new nonce after reopening',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'history-dispatch-'));const f=fixture();
  try {
   await reserveHistoryDispatch(f.request,dir);
   await expect(reserveHistoryDispatch({...f.request,nonce:randomUUID()},dir)).rejects.toThrow();
   await expect(reserveHistoryDispatch({...f.request,action:'get'},dir)).rejects.toThrow();
   const files=await readdir(dir);expect(files).toHaveLength(2);
   const data=await readFile(join(dir,files[0]),'utf8');expect(data).toContain('dispatch_unknown');expect(data).not.toContain('ciphertext');
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('cleanup uses the saved key and cannot certify an unknown or differently scoped writer',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'history-cleanup-'));const f=fixture();
  const {ciphertext,...metadata}=f.request;
  const ended={...metadata,action:'delete',label:'purpose-end',bytes:0,sha256:'0'.repeat(64),nonce:randomUUID()};
  try {
   expect(decodeHistoryRequest(seal(ended),pub).key).toBe(f.request.key);
   await reserveHistoryDispatch(f.request,dir);
   await expect(cleanupHistoryDispatch(ended,dir)).rejects.toThrow();
   await expect(settleHistoryDispatch({...f.request,nonce:randomUUID()},dir)).rejects.toThrow();
   await settleHistoryDispatch(f.request,dir);
   await expect(cleanupHistoryDispatch({...ended,scope:{...ended.scope,binding:{...ended.scope.binding,queryId:'0'.repeat(64)}}},dir)).rejects.toThrow();
   await cleanupHistoryDispatch(ended,dir);
   await cleanupHistoryDispatch(ended,dir);
   expect((await readdir(dir)).some(x=>x.startsWith('ended-'))).toBe(true);
   await expect(reserveHistoryDispatch({...f.request,nonce:randomUUID()},dir)).rejects.toThrow();
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('accepts an idempotent delete replay only when new complete listings prove absence',async()=>{
  const key=fixture().request.key;
  const names=['list_object_versions','delete_object','list_objects_v2'];
  const tools=names.map(name=>({name,connectionId:WASABI_CONNECTION,upstreamToolName:'wasabi_s3_'+name}));
  for(const listingStatus of ['completed','replayed']) {
   const calls:string[]=[];
   const gateway={executeTool:async({tool}:any)=>{
    calls.push(tool);
    if(tool==='delete_object')return {status:'replayed'};
    return {status:listingStatus,result:{content:JSON.stringify({$metadata:{httpStatusCode:200},MaxKeys:1000,KeyCount:0,IsTruncated:false,Name:'whox-treasury-research-0d8aad87',Prefix:key,Versions:[],DeleteMarkers:[],Contents:[]})}};
   }} as any;
   const result=cleanupHistoryObject(gateway,'test',tools as any,{key},async()=>({}));
   if(listingStatus==='completed') {
    await expect(result).resolves.toMatchObject({allVersionsAbsent:true,dispatchSettled:true});
    expect(calls).toEqual(['list_object_versions','delete_object','list_object_versions','list_objects_v2']);
   }else await expect(result).rejects.toThrow();
  }
 });
 it('accepts only exact signed worker scope and bound current release records',()=>{
  const f=fixture();const r=decodeHistoryRequest(seal(f.request),pub);
  expect(releaseGate(f.config,r,f.records)).toEqual(f.request.scope.gate);
 });
 it('binds a read-only preflight to the signed query without allowing payload or write labels',()=>{
  const {ciphertext,...base}=fixture().request;
  const id=sha(canonical({binding:base.scope.binding,label:'preflight'})).slice(0,32);
  const key=`treasury/${WASABI_COMPANY}/research/history/${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}.bin`;
  const check={...base,action:'check',label:'preflight',bytes:0,sha256:'0'.repeat(64),key};
  expect(decodeHistoryRequest(seal(check),pub).action).toBe('check');
  for(const patch of [{ciphertext},{bytes:1},{label:'chunk:0'},{sha256:'a'.repeat(64)},{action:'put',ciphertext},{key:base.key}])
   expect(()=>decodeHistoryRequest(seal({...check,...patch}),pub)).toThrow();
 });
 it('keeps old query releases valid while binding a replacement to its own complete pins',()=>{
  const f=fixture();const oldConfig=structuredClone(f.config) as any;
  const replacement='e'.repeat(64),envelope='f'.repeat(64),artifacts={replacement:'1'.repeat(64)};
  oldConfig.queries[replacement]={querySha256:f.request.scope.binding.querySha256,envelopeSha256:envelope,artifactHashes:artifacts};
  expect(releaseGate(oldConfig,f.request,f.records)).toEqual(f.request.scope.gate);
  const next=structuredClone(f);
  Object.assign(next.request.scope.binding,{queryId:replacement,envelopeSha256:envelope,artifactHashes:artifacts});
  Object.assign(next.request.scope.gate,{envelopeSha256:envelope,artifactHashes:artifacts});
  next.records.review.artifactHashes=artifacts as any;
  for(const key of ['retention','budget','queryQuality'] as const)Object.assign(next.records[key],{queryId:replacement,envelopeSha256:envelope});
  expect(releaseGate(oldConfig,next.request,next.records)).toEqual(next.request.scope.gate);
  expect(()=>releaseGate(oldConfig,next.request,f.records)).toThrow();
  for(const patch of [{envelopeSha256:undefined},{artifactHashes:undefined},{artifactHashes:{}},{artifactHashes:{worker:'invalid'}},{envelopeSha256:f.config.envelopeSha256}]) {
   const bad=structuredClone(oldConfig);Object.assign(bad.queries[replacement],patch);
   expect(()=>releaseGate(bad,next.request,next.records)).toThrow();
  }
  const forged=structuredClone(f.request);forged.scope.binding.queryId=replacement;
  expect(()=>releaseGate(oldConfig,forged,f.records)).toThrow();
 });
 for(const [field,value] of [['key','other'],['nonce','bad'],['at',0],['bytes',524289],['sha256','bad'],['label','chunk:131072'],['action','purge'],['ciphertext','plain']]){
  it(`rejects signed invalid ${field}`,()=>{const f=fixture();expect(()=>decodeHistoryRequest(seal({...f.request,[field]:value}),pub)).toThrow();});
 }
 it('rejects unsigned and modified envelopes',()=>{
  const f=fixture();expect(()=>decodeHistoryRequest({payload:'e30=',signature:''},pub)).toThrow();
  expect(()=>decodeHistoryRequest({...seal(f.request),payload:Buffer.from('{}').toString('base64')},pub)).toThrow();
 });
 it('never treats synthetic acceptance, expired retention or unbound query evidence as production acceptance',()=>{
  for(const mutate of [(f:any)=>f.records.review.scope='synthetic', (f:any)=>f.records.retention.expiresAt=0,(f:any)=>f.records.queryQuality.querySha256='other',(f:any)=>f.config.enabled=false,(f:any)=>f.records.localRestore.verified=false,(f:any)=>f.records.budget.maxCostUsd=NaN]) {
   const f=fixture();mutate(f);expect(()=>releaseGate(f.config,f.request,f.records)).toThrow();
  }
 });
});
