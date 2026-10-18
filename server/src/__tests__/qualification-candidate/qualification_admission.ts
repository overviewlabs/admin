/** Fixed summary-only signed admission. Hooks are mandatory and fail closed. */
import {createHash,verify} from 'node:crypto';
export const IT='10bf5dc5-8522-42a2-8456-9bc50cdd982d';
export const PARENT='c9427b3a-35ee-4c1e-8360-426a51847dfc';
export const COMPANY='0d8aad87-64f2-4f9c-a92c-94a261e140f7';
export const CONNECTION='eb8abeaa-f7a2-416c-bd3c-0f2d87aff23d';
export const QUERY='e46fb764c5a1a4f1fa7be5dd4cc81aec50c5a3677ec038f4cee713fd7c3b4943';
export const MANIFEST='740218bb23a316b670fafa1292f33cf0d11c1e85e2b0e2c7bb932f488114b291';
type Obj=Record<string,any>;
export const canonical=(v:any):string=>JSON.stringify(sort(v));
function sort(v:any):any {if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
function need(v:unknown):asserts v {if(!v)throw new Error('definition_qualification_failed');}
function exact(v:any,keys:string[]) {need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(','));}
const hash=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
export function decode(envelope:Obj,pub:string,now=Date.now()):Obj {
 try {
  exact(envelope,['payload','signature']);need(typeof envelope.payload==='string'&&envelope.payload.length<=131072&&typeof envelope.signature==='string'&&envelope.signature.length===88);
  const raw=Buffer.from(envelope.payload,'base64');need(raw.toString('base64')===envelope.payload);
  const signature=Buffer.from(envelope.signature,'base64');need(signature.length===64&&signature.toString('base64')===envelope.signature&&verify(null,raw,pub,signature));
  const r=JSON.parse(raw.toString('utf8'));need(canonical(r)===raw.toString('utf8'));
  exact(r,['operation','connectionId','agentId','runId','issueId','queryId','manifestSha256','object','scope','at','nonce']);
  need(r.operation==='definition_qualification_get_v1'&&r.connectionId===CONNECTION&&r.agentId===IT&&r.issueId===PARENT&&r.queryId===QUERY&&r.manifestSha256===MANIFEST);
  need(typeof r.runId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.runId));
  need(Number.isSafeInteger(r.at)&&Math.abs(now-r.at)<=30000&&typeof r.nonce==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.nonce));
  exact(r.object,['key','label','bytes','sha256']);const o=r.object;
  need(['manifest','chunk:0','chunk:1'].includes(o.label)&&Number.isSafeInteger(o.bytes)&&o.bytes>=42&&o.bytes<=524288&&typeof o.sha256==='string'&&/^[a-f0-9]{64}$/.test(o.sha256));
  exact(r.scope,['binding','gate']);need(r.scope.binding?.queryId===QUERY);
  const id=hash(canonical({binding:r.scope.binding,label:o.label})).slice(0,32);
  need(o.key===`treasury/${COMPANY}/research/history/${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}.bin`);
  return r;
 }catch{throw new Error('definition_qualification_failed');}
}
export interface AdmissionHooks {
 session(token:string):Promise<Obj>; // verified active run session AND mandatory parent checkout
 capability(agent:string,run:string):Promise<boolean>;
 saved():Promise<Obj>; // root-owned pinned source receipts: completed exact query/manifest
 scope(r:Obj):Promise<Obj>; // current release records, retention and purpose
 witness(r:Obj):Promise<boolean>; // fresh restricted witness check, true means allowed
 receipt(r:Obj):Promise<Obj>; // current immutable settled key receipt, no ended tombstone
 reserve(r:Obj):Promise<void>; // exclusive qualification nonce store, NEVER acquisition journal
}
export async function admit(r:Obj,token:string,h:AdmissionHooks) {
 const s=await h.session(token);
 need(s.companyId===COMPANY&&s.agentId===IT&&s.runId===r.runId&&s.issueId===PARENT);
 need(await h.capability(IT,r.runId));
 const saved=await h.saved();need(saved.state==='complete'&&saved.queryId===QUERY&&saved.manifestSha256===MANIFEST&&canonical(saved.scope)===canonical(r.scope));
 need(Array.isArray(saved.objects)&&saved.objects.length===3&&saved.objects.some((o:Obj)=>canonical(o)===canonical(r.object)));
 need(canonical(await h.scope(r))===canonical(r.scope.gate));need(await h.witness(r));
 const receipt=await h.receipt(r);need(receipt.state==='put_settled'&&receipt.action==='put'&&canonical(receipt.scope)===canonical(r.scope));
 for(const k of ['key','label','bytes','sha256'])need(receipt[k]===r.object[k]);
}
export async function guardedRead(r:Obj,token:string,h:AdmissionHooks,read:(r:Obj)=>Promise<Buffer>) {
 await admit(r,token,h);await h.reserve(r);await admit(r,token,h);
 const bytes=await read(r);
 try {need(Buffer.isBuffer(bytes)&&bytes.length===r.object.bytes&&hash(bytes)===r.object.sha256&&bytes.subarray(0,14).equals(Buffer.from('TRS-AESGCM-v1\0')));await admit(r,token,h);return {ciphertext:bytes.toString('base64')};}
 finally{if(Buffer.isBuffer(bytes))bytes.fill(0);}
}
