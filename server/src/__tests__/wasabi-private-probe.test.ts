import { describe, expect, it } from 'vitest';
import { runWasabiPrivateProbe, validateProbeUrl, listingEntries, WASABI_BUCKET, WASABI_COMPANY, type ProbeExecute } from '../services/wasabi-private-probe.js';
const key=`treasury/${WASABI_COMPANY}/research/verification/probe.bin`;
function presign(key:string) {
 const d=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const q=new URLSearchParams({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`synthetic/${d.slice(0,8)}/us-east-1/s3/aws4_request`,'X-Amz-Date':d,'X-Amz-Expires':'300','X-Amz-SignedHeaders':'host','X-Amz-Signature':'a'.repeat(64)});
 return {url:`https://s3.us-east-1.wasabisys.com/${WASABI_BUCKET}/${key}?${q}`,expiresIn:300};
}
function harness(mode='ok') {
 const objects=new Map<string,Buffer>();const calls:string[]=[];const receipts:unknown[]=[];
 const execute:ProbeExecute=async(tool,p,consumer)=>{
  calls.push(tool);
  if(mode==='denied' && tool.endsWith('presign_put_object')) return {decision:'off'};
  let value:unknown={};
  if(tool.includes('presign')) value=presign(String(p.key));
  if(tool.endsWith('list_object_versions')) value={$metadata:{httpStatusCode:200},IsTruncated:false,Name:WASABI_BUCKET,Prefix:p.Prefix,MaxKeys:1000,Versions:[...objects.keys()].filter(k=>k.startsWith(String(p.Prefix))).map(Key=>({Key,VersionId:'null'}))};
  if(tool.endsWith('delete_object')) { if(mode==='delete_denied')return {decision:'off'};objects.delete(String(p.Key)); }
  if(tool.endsWith('list_objects_v2')) value={$metadata:{httpStatusCode:200},IsTruncated:false,Name:WASABI_BUCKET,Prefix:p.Prefix,MaxKeys:1000,KeyCount:objects.size,Contents:[...objects.keys()].map(Key=>({Key}))};
  const wrapped={data:{structuredContent:value}};
  const result=consumer?await consumer(wrapped):wrapped;receipts.push(result);
  return {decision:'allowed',result};
 };
 const transport=(async(input:URL,options:RequestInit)=>{
  const object=input.pathname.slice(WASABI_BUCKET.length+2);
  if(options.method==='PUT') {
   objects.set(object,Buffer.from(options.body as Buffer));
   if(mode==='lost_put')throw new Error('secret-url-must-never-escape');
   return new Response(null,{status:200});
  }
  if(mode==='corrupt')return new Response(Buffer.from('corrupt'));
  if(mode==='oversize')return new Response(new Uint8Array(9000));
  return new Response(objects.get(object)!);
 }) as unknown as typeof fetch;
 return {execute,transport,objects,calls,receipts};
}
describe('Wasabi private synthetic probe',()=>{
 it('uploads encrypted data, authenticates decryption, cleans all copies and exposes receipts only',async()=>{
  const h=harness();const report=await runWasabiPrivateProbe(h.execute,h.transport,async()=>{});
  expect(report.ok).toBe(true);expect(report.decrypted).toBe(true);expect(h.objects.size).toBe(0);
  expect(JSON.stringify(report)).not.toContain('X-Amz');
  expect(JSON.stringify(h.receipts)).not.toContain('X-Amz');
 });
 for(const [mode,error] of [['denied','tool_not_completed'],['corrupt','checksum_mismatch'],['oversize','get_size_limit'],['lost_put','put_outcome_unknown']]) {
  it(`fails closed and reconciles ${mode}`,async()=>{
   const h=harness(mode);const report=await runWasabiPrivateProbe(h.execute,h.transport,async()=>{});
   expect(report.ok).toBe(false);expect(report.error).toBe(error);expect(report.cleanupVerified).toBe(mode!=='lost_put');expect(h.objects.size).toBe(mode==='lost_put'?1:0);
   expect(JSON.stringify(report)).not.toContain('secret-url');
  });
 }
 it('keeps a durable unresolved intent when timed-out PUT completes after cleanup would run',async()=>{
  const h=harness();const entries:Record<string,unknown>[]=[];let complete=()=>{};
  const delayed=(async(input:URL,options:RequestInit)=>{
   if(options.method==='PUT') {
    const key=input.pathname.slice(WASABI_BUCKET.length+2);const copy=Buffer.from(options.body as Buffer);
    complete=()=>{h.objects.set(key,copy);};
    throw new Error('late remote completion');
   }
   return h.transport(input,options);
  }) as unknown as typeof fetch;
  const report=await runWasabiPrivateProbe(h.execute,delayed,async entry=>{entries.push(entry);});
  expect(report.cleanupVerified).toBe(false);expect(report.reconciliationRequired).toBe(true);
  expect(report.cleanupError).toBe('unknown_upload_cleanup_held');
  expect(entries.map(e=>e.state)).toEqual(['put_pending','put_outcome_unknown']);
  expect(entries[0].key).toBe(report.key);expect(h.calls.some(c=>c.endsWith('delete_object'))).toBe(false);
  complete();expect(h.objects.size).toBe(1);
 });
 it('does not dispatch when durable intent cannot be saved',async()=>{
  const h=harness();const report=await runWasabiPrivateProbe(h.execute,h.transport,async()=>{throw Error('disk unavailable');});
  expect(report.ok).toBe(false);expect(report.uploaded).toBe(false);expect(h.objects.size).toBe(0);
 });
 it('does not report success if deletion is denied',async()=>{
  const h=harness('delete_denied');const report=await runWasabiPrivateProbe(h.execute,h.transport,async()=>{});
  expect(report.ok).toBe(false);expect(report.cleanupVerified).toBe(false);expect(h.objects.size).toBe(1);
 });
 it('never claims a transfer when the consumer did not execute',async()=>{
  const h=harness();const execute:ProbeExecute=(name,p)=>h.execute(name,p);
  const report=await runWasabiPrivateProbe(execute,h.transport,async()=>{});expect(report.ok).toBe(false);
 });
 it('rejects foreign hosts and object paths, duplicate params, expired and redacted signatures',()=>{
  for(const mutate of [
   (u:URL)=>{u.hostname='evil.test';}, (u:URL)=>{u.pathname='/other/object';},
   (u:URL)=>{u.searchParams.append('X-Amz-Expires','300');},
   (u:URL)=>{u.searchParams.set('X-Amz-Date','20000101T000000Z');},
   (u:URL)=>{u.searchParams.set('X-Amz-Signature','[REDACTED]');},
  ]) {const raw=presign(key);const u=new URL(raw.url);mutate(u);expect(()=>validateProbeUrl({...raw,url:u.href},key)).toThrow();}
 });
 it('rejects malformed listings and accepts genuine SDK empty/populated listings',()=>{
  const base={$metadata:{httpStatusCode:200},IsTruncated:false,Name:WASABI_BUCKET,Prefix:key,MaxKeys:1000};
  expect(listingEntries(base,key,'versions')).toEqual([]);
  expect(listingEntries({...base,KeyCount:0},key,'objects')).toEqual([]);
  expect(listingEntries({...base,Versions:[{Key:key,VersionId:'null'}]},key,'versions')).toHaveLength(1);
  for(const bad of [{},{...base,Versions:null},{...base,Versions:{}},{...base,IsTruncated:undefined},{...base,$metadata:{}},{...base,Prefix:'other'},{...base,DeleteMarkers:[{}]}])expect(()=>listingEntries(bad,key,'versions')).toThrow();
  expect(()=>listingEntries({...base,KeyCount:0,Contents:[{Key:key}]},key,'objects')).toThrow();
 });

});
