import { createHash, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { listingEntries, providerValue, validateProbeUrl, WASABI_BUCKET, WASABI_COMPANY, WASABI_CONNECTION, WASABI_REGION, type ProbeExecute } from './wasabi-private-probe.js';
const MAX = 512 * 1024;
const prefix = `treasury/${WASABI_COMPANY}/research/verification/`;
const seen = new Map<string,number>();
const hash = (bytes:Buffer) => createHash('sha256').update(bytes).digest('hex');
export class WorkerTransferError extends Error { constructor(readonly code:string) { super(code); } }
function deny(code:string):never { throw new WorkerTransferError(code); }
type Transfer = {connectionId:string;at:number;nonce:string;action:'put'|'get'|'purge';key:string;sha256:string;bytes:number;ciphertext?:string};
export function authenticateWorker(envelope:unknown, publicKey = readFileSync('/etc/overview-labs/wasabi-worker-public.pem','utf8'), now=Date.now()):Transfer {
  try {
    const e=envelope as {payload:string;signature:string};
    if(!e || Object.keys(e).sort().join(',')!=='payload,signature' || typeof e.payload!=='string' || e.payload.length>950000 || typeof e.signature!=='string' || e.signature.length!==88) deny('worker_auth_required');
    const data=Buffer.from(e.payload,'base64');
    if(!verify(null,data,publicKey,Buffer.from(e.signature,'base64'))) deny('worker_auth_required');
    const r=JSON.parse(data.toString('utf8')) as Transfer;
    if(r.connectionId!==WASABI_CONNECTION || !Number.isSafeInteger(r.at) || Math.abs(now-r.at)>60000 ||
       !/^[a-f0-9-]{36}$/.test(r.nonce) || !['put','get','purge'].includes(r.action) ||
       !new RegExp('^'+prefix+'[a-f0-9-]{36}\\.bin$').test(r.key) || !/^[a-f0-9]{64}$/.test(r.sha256) ||
       !Number.isSafeInteger(r.bytes) || r.bytes<42 || r.bytes>MAX) deny('worker_scope_denied');
    if(r.action==='put') {
      if(typeof r.ciphertext!=='string' || r.ciphertext.length>Math.ceil(MAX/3)*4) deny('worker_payload_invalid');
      const b=Buffer.from(r.ciphertext,'base64');
      if(b.length!==r.bytes || hash(b)!==r.sha256 || !b.subarray(0,14).equals(Buffer.from('TRS-AESGCM-v1\0'))) deny('worker_payload_invalid');
    } else if(r.ciphertext!==undefined) deny('worker_payload_invalid');
    for(const [nonce,at] of seen) if(now-at>120000)seen.delete(nonce);
    if(seen.has(r.nonce) || seen.size>=10000) deny('worker_replay_denied');
    seen.set(r.nonce,now);return r;
  } catch(e) { if(e instanceof WorkerTransferError)throw e;return deny('worker_auth_required'); }
}
export async function workerTransfer(request:Transfer,execute:ProbeExecute,fetchImpl:typeof fetch=fetch) {
  const p={Bucket:WASABI_BUCKET,region:WASABI_REGION};
  const op=async(name:string,params:Record<string,unknown>,consume?: (raw:unknown)=>Promise<unknown>)=>{
    const result=await execute('wasabi_s3_'+name,params,consume) as {decision:string;error?:unknown;result:unknown};
    if(result.decision!=='allowed'||result.error)deny('storage_policy_or_execution_failed');
    return consume?result.result:providerValue(result.result);
  };
  try {
    if(request.action==='purge') {
      const before=await op('list_object_versions',{...p,Prefix:request.key,MaxKeys:1000}) as Record<string,unknown>;
      const entries=listingEntries(before,request.key,'versions');
      for(const e of entries) {
        if(e.Key!==request.key || typeof e.VersionId!=='string')deny('storage_scope_denied');
        await op('delete_object',{...p,Key:request.key,VersionId:e.VersionId});
      }
      if(!entries.length)await op('delete_object',{...p,Key:request.key});
      const versions=await op('list_object_versions',{...p,Prefix:request.key,MaxKeys:1000}) as Record<string,unknown>;
      const objects=await op('list_objects_v2',{...p,Prefix:request.key,MaxKeys:1000}) as Record<string,unknown>;
      if(listingEntries(versions,request.key,'versions').length || listingEntries(objects,request.key,'objects').length)deny('storage_cleanup_incomplete');
      return {action:'purge',key:request.key,absent:true};
    }
    let privateBytes:Buffer|undefined;let consumed=false;
    const method=request.action.toUpperCase();
    const receipt=await op('presign_'+request.action+'_object',{bucket:WASABI_BUCKET,key:request.key,region:WASABI_REGION,expiresIn:300,...(method==='PUT'?{contentType:'application/octet-stream'}:{})},async raw=>{
      try {
      const url=validateProbeUrl(providerValue(raw),request.key);
      const body=method==='PUT'?Buffer.from(request.ciphertext!,'base64'):undefined;
      const response=await fetchImpl(url,{method,body,redirect:'error',signal:AbortSignal.timeout(30000),...(body?{headers:{'Content-Type':'application/octet-stream'}}:{})});
      if(!response.ok){await response.body?.cancel();deny('storage_http_failure');}
      if(method==='GET'){
        if(!response.body)deny('storage_body_missing');
        const chunks:Buffer[]=[];let size=0;
        for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){size+=chunk.length;if(size>request.bytes)deny('storage_size_mismatch');chunks.push(Buffer.from(chunk));}
        privateBytes=Buffer.concat(chunks);
        if(privateBytes.length!==request.bytes||hash(privateBytes)!==request.sha256)deny('storage_checksum_mismatch');
      } else await response.body?.cancel();
      consumed=true;return {key:request.key,action:request.action,sha256:request.sha256,bytes:request.bytes};
      } catch(error) {
        // Sanitize BEFORE control returns to the gateway error audit.
        if(error instanceof WorkerTransferError) throw error;
        throw new WorkerTransferError(method==='PUT'?'storage_put_outcome_unknown':'storage_transfer_failed');
      }
    });
    if(!consumed)deny('storage_transfer_not_executed');
    // Ciphertext leaves only this worker-authenticated endpoint. Gateway audit
    // sees the receipt above, never ciphertext, URLs or decryption keys.
    const result={receipt,...(privateBytes?{ciphertext:privateBytes.toString('base64')}:{})};
    privateBytes?.fill(0);return result;
  }catch(e){if(e instanceof WorkerTransferError)throw e;throw new WorkerTransferError(request.action==='put'?'storage_put_outcome_unknown':'storage_transfer_failed');}
}
