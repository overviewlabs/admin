/** Separate fixed IT READ path. No acquisition dispatch, URLs or public raw output. */
import { createHash } from 'node:crypto';
import { readFile,stat,mkdir,open } from 'node:fs/promises';
import { createConnection } from 'node:net';
import type { ToolGatewayService } from './tool-gateway.js';
import {decode,canonical,IT,PARENT,COMPANY,CONNECTION} from './definition-qualification-admission.js';
import { providerValue,WASABI_BUCKET,WASABI_REGION,validateHistoryUrl } from './wasabi-private-probe.js';
const SOCKET='/run/treasury-definition-qualification/worker.sock';
const NONCES='/var/lib/whox/.whox/treasury-qualification-nonces';
const hash=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const deny=():never=>{throw new Error('definition_qualification_failed');};
function need(v:unknown):asserts v{if(!v)deny();}
export async function rootAdmission(envelope:any,runToken:string):Promise<any>{
 const dir=await stat('/run/treasury-definition-qualification');const socket=await stat(SOCKET);
 need(dir.uid===0&&(dir.mode&0o022)===0&&socket.uid===0&&socket.isSocket());
 const frame=Buffer.from(JSON.stringify({operation:'definition_qualification_admission_v1',envelope,runToken})+'\n');need(frame.length<=150000);
 return new Promise((resolve,reject)=>{
  const client=createConnection(SOCKET);let data=Buffer.alloc(0);let settled=false;
  const stop=(error?:Error,result?:any)=>{if(settled)return;settled=true;clearTimeout(timer);client.destroy();data.fill(0);error?reject(error):resolve(result);};
  const timer=setTimeout(()=>stop(new Error('definition_qualification_failed')),21000);
  client.on('connect',()=>client.write(frame));client.on('error',()=>stop(new Error('definition_qualification_failed')));
  client.on('data',chunk=>{data=Buffer.concat([data,chunk]);if(data.length>32768)return stop(new Error('definition_qualification_failed'));if(data.includes(10)){try{const r=JSON.parse(data.toString());need(r.ok===true);stop(undefined,r);}catch{stop(new Error('definition_qualification_failed'));}}});
  client.on('end',()=>{if(!settled)stop(new Error('definition_qualification_failed'));});
 });
}
export async function reserveQualification(r:any,directory=NONCES){
 await mkdir(directory,{recursive:true,mode:0o700});
 const f=await open(directory+'/'+r.nonce+'.json','wx',0o600);
 try{await f.writeFile(JSON.stringify({runId:r.runId,queryId:r.queryId,manifestSha256:r.manifestSha256,at:r.at}));await f.sync();}finally{await f.close();}
 const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
}
export async function qualificationTransfer(gateway:ToolGatewayService,token:string,body:any){
 const deadline=Date.now()+90000;
 need(body&&typeof body==='object'&&Object.keys(body).sort().join(',')==='payload,runToken,signature'&&typeof body.runToken==='string'&&body.runToken.length<=8192);
 const envelope={payload:body.payload,signature:body.signature};
 const r=decode(envelope,await readFile('/etc/overview-labs/wasabi-worker-public.pem','utf8'));
 const authorize=async()=>{
  need(Date.now()<deadline);
  const s=await gateway.verifiedRunSession(token,true);
  need(s.companyId===COMPANY&&s.agentId===IT&&s.runId===r.runId&&s.issueId===PARENT);
  const proof=await rootAdmission(envelope,body.runToken);
  need(proof.queryId===r.queryId&&proof.manifestSha256===r.manifestSha256&&canonical(proof.scope)===canonical(r.scope)&&canonical(proof.object)===canonical(r.object));
  need(Date.now()<deadline);return proof.readGate;
 };
 const original=await authorize();await reserveQualification(r);need(canonical(await authorize())===canonical(original));
 const tools=await gateway.listToolsForSession(token);
 const tool=tools.find(t=>t.connectionId===CONNECTION&&t.upstreamToolName==='wasabi_s3_presign_get_object');need(tool);
 let bytes:Buffer|undefined;let consumed=false;
 try{
  const result=await gateway.executeTool({sessionToken:token,tool:tool.name,parameters:{bucket:WASABI_BUCKET,key:r.object.key,region:WASABI_REGION,expiresIn:60},consumePrivateResult:async raw=>{
   need(canonical(await authorize())===canonical(original));
   const url=validateHistoryUrl(providerValue(raw),r.object.key);
   const response=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(30000,deadline-Date.now())))});
   need(response.ok&&response.body);const parts:Buffer[]=[];let total=0;
   try{for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){total+=part.length;need(total<=r.object.bytes&&Date.now()<deadline);parts.push(Buffer.from(part));}bytes=Buffer.concat(parts);}finally{for(const p of parts)p.fill(0);}
   need(bytes.length===r.object.bytes&&hash(bytes)===r.object.sha256&&bytes.subarray(0,14).equals(Buffer.from('TRS-AESGCM-v1\0')));
   need(canonical(await authorize())===canonical(original));consumed=true;
   return {operation:'definition_qualification_get_v1',queryId:r.queryId,manifestSha256:r.manifestSha256};
  }});
  need(consumed&&result.status==='completed'&&bytes);need(canonical(await authorize())===canonical(original));
  return {ciphertext:bytes.toString('base64')};
 }finally{bytes?.fill(0);}
}
