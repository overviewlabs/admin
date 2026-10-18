import { generateKeyPairSync, randomUUID, sign, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authenticateWorker, workerTransfer } from '../services/wasabi-worker-transfer.js';
import { WASABI_COMPANY, WASABI_CONNECTION } from '../services/wasabi-private-probe.js';
const keys=generateKeyPairSync('ed25519');
const pub=keys.publicKey.export({format:'pem',type:'spki'}).toString();
const payload=Buffer.concat([Buffer.from('TRS-AESGCM-v1\0'),Buffer.alloc(64)]);
function request() {return {connectionId:WASABI_CONNECTION,at:Date.now(),nonce:randomUUID(),action:'put',key:`treasury/${WASABI_COMPANY}/research/verification/${randomUUID()}.bin`,bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex'),ciphertext:payload.toString('base64')};}
function envelope(value:unknown) {const raw=Buffer.from(JSON.stringify(value));return {payload:raw.toString('base64'),signature:sign(null,raw,keys.privateKey).toString('base64')};}
describe('private worker attestation',()=>{
 it('accepts a signed scoped request once',()=>{const e=envelope(request());expect(authenticateWorker(e,pub).action).toBe('put');expect(()=>authenticateWorker(e,pub)).toThrow('worker_replay_denied');});
 it('rejects tampering, other keys and unsigned requests',()=>{const e=envelope(request());expect(()=>authenticateWorker({...e,payload:Buffer.from('{}').toString('base64')},pub)).toThrow();expect(()=>authenticateWorker(e,generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'}).toString())).toThrow();expect(()=>authenticateWorker({},pub)).toThrow();});
 for(const [field,value] of [['at',0],['connectionId','other'],['key','licensed/data'],['bytes',999999],['sha256','bad'],['ciphertext','plaintext'],['action','exec']]){
  it(`rejects signed invalid ${field}`,()=>expect(()=>authenticateWorker(envelope({...request(),[field]:value}),pub)).toThrow());
 }
 it('does not accept redacted/replayed tool result as completed transfer',async()=>{
  const r=authenticateWorker(envelope(request()),pub);
  await expect(workerTransfer(r,async()=>({decision:'allowed',result:{}}))).rejects.toThrow('storage_transfer_not_executed');
 });
 it('keeps upstream secret-bearing errors out of responses',async()=>{
  const r=authenticateWorker(envelope(request()),pub);
  await expect(workerTransfer(r,async()=>{throw Error('https://secret?token=abc');})).rejects.toThrow('storage_put_outcome_unknown');
 });
 it('sanitizes transport errors before the gateway audits the consumer failure',async()=>{
  const r=authenticateWorker(envelope(request()),pub);let audited='';
  const d=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const q=new URLSearchParams({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`synthetic/${d.slice(0,8)}/us-east-1/s3/aws4_request`,'X-Amz-Date':d,'X-Amz-Expires':'300','X-Amz-SignedHeaders':'host','X-Amz-Signature':'a'.repeat(64)});
  const raw={data:{structuredContent:{url:`https://s3.us-east-1.wasabisys.com/whox-treasury-research-0d8aad87/${r.key}?${q}`,expiresIn:300}}};
  await expect(workerTransfer(r,async(_tool,_params,consumer)=>{
    try{return {decision:'allowed',result:await consumer!(raw)};}
    catch(e){audited=(e as Error).message;throw e;}
  },(async()=>{throw Error('network error https://host/?secret=must-not-be-audited');}) as typeof fetch)).rejects.toThrow('storage_put_outcome_unknown');
  expect(audited).toBe('storage_put_outcome_unknown');
 });

});
