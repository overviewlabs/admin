import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,sign,randomUUID,createHash} from 'node:crypto';
import {canonical,decode,admit,guardedRead,IT,PARENT,COMPANY,CONNECTION,QUERY,MANIFEST} from './qualification_admission.js';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');const pub=publicKey.export({type:'spki',format:'pem'}).toString();
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
function fixture(){
 const bytes=Buffer.concat([Buffer.from('TRS-AESGCM-v1\0'),Buffer.alloc(64)]);
 const scope={binding:{queryId:QUERY},gate:{expiresAt:Date.now()/1000+300,purpose:'research'}};
 const id=sha(canonical({binding:scope.binding,label:'manifest'})).slice(0,32);
 const object={label:'manifest',bytes:bytes.length,sha256:sha(bytes),key:`treasury/${COMPANY}/research/history/${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}.bin`};
 const r={operation:'definition_qualification_get_v1',agentId:IT,issueId:PARENT,connectionId:CONNECTION,runId:randomUUID(),queryId:QUERY,manifestSha256:MANIFEST,scope,object,nonce:randomUUID(),at:Date.now()};
 const session={companyId:COMPANY,agentId:IT,issueId:PARENT,runId:r.runId};let reserved=false;
 const h={session:async()=>session,capability:async()=>true,saved:async()=>({state:'complete',queryId:QUERY,manifestSha256:MANIFEST,scope,objects:[object,{label:'chunk:0'},{label:'chunk:1'}]}),scope:async()=>scope.gate,witness:async()=>true,receipt:async()=>({...object,scope,state:'put_settled',action:'put'}),reserve:async()=>{if(reserved)throw Error();reserved=true;}};
 return {r,h,bytes,session};
}
function seal(r:any){const raw=Buffer.from(canonical(r));return {payload:raw.toString('base64'),signature:sign(null,raw,privateKey).toString('base64')};}
describe('qualification admission candidate',()=>{
 it('accepts only fixed signed canonical operation',()=>{const {r}=fixture();expect(decode(seal(r),pub)).toEqual(r);});
 for(const [k,v] of [['agentId','other'],['runId','bad'],['issueId','other'],['queryId','other'],['manifestSha256','other'],['operation','get'],['connectionId','other'],['at',0],['nonce','bad'],['url','http://invalid']])it('denies signed '+k,()=>{const {r}=fixture();expect(()=>decode(seal({...r,[k]:v}),pub)).toThrow();});
 it('denies altered signature and duplicate JSON keys',()=>{const {r}=fixture();expect(()=>decode({...seal(r),signature:Buffer.alloc(64).toString('base64')},pub)).toThrow();const raw=Buffer.from(canonical(r).replace('{','{"at":0,'));expect(()=>decode({payload:raw.toString('base64'),signature:sign(null,raw,privateKey).toString('base64')},pub)).toThrow();});
 for(const field of ['companyId','agentId','issueId','runId'])it('denies session '+field,async()=>{const f=fixture();(f.session as any)[field]='other';await expect(admit(f.r,'session',f.h)).rejects.toThrow();});
 for(const hook of ['session','capability','saved','scope','witness','receipt'])it('fails closed on unavailable '+hook,async()=>{const f=fixture();(f.h as any)[hook]=async()=>{throw Error('private detail');};await expect(admit(f.r,'session',f.h)).rejects.toThrow();});
 it('denies revoked capability, witness, scope, receipt and manifest',async()=>{
  for(const alter of [(h:any)=>h.capability=async()=>false,(h:any)=>h.witness=async()=>false,(h:any)=>h.scope=async()=>({expiresAt:0}),(h:any)=>h.receipt=async()=>({state:'dispatch_unknown'}),(h:any)=>h.saved=async()=>({state:'complete',queryId:QUERY,manifestSha256:'other'})]){const f=fixture();alter(f.h);await expect(admit(f.r,'session',f.h)).rejects.toThrow();}
 });
 it('fences replay and zeroes ciphertext after verified private delivery',async()=>{const f=fixture();await expect(guardedRead(f.r,'session',f.h,async()=>f.bytes)).resolves.toHaveProperty('ciphertext');expect(f.bytes.every(x=>x===0)).toBe(true);await expect(guardedRead(f.r,'session',f.h,async()=>f.bytes)).rejects.toThrow();});
 it('fails closed on mid-read revocation and clears private bytes',async()=>{const f=fixture();await expect(guardedRead(f.r,'session',f.h,async()=>{f.h.witness=async()=>false;return f.bytes;})).rejects.toThrow();expect(f.bytes.every(x=>x===0)).toBe(true);});
 it('rejects changed ciphertext and extra receipt object',async()=>{const f=fixture();f.bytes[20]=1;await expect(guardedRead(f.r,'session',f.h,async()=>f.bytes)).rejects.toThrow();});
});
