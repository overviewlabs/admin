import { describe, expect, it } from 'vitest';
import { WasabiProbeError, validateProbeUrl, WASABI_BUCKET, WASABI_COMPANY } from '../services/wasabi-private-probe.js';
const key=`treasury/${WASABI_COMPANY}/research/verification/probe.bin`;
const now=Date.parse('2026-10-04T23:00:00Z');
function fixture() {
 const q=new URLSearchParams({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':'PRIVATE_CANARY/20261004/us-east-1/s3/aws4_request','X-Amz-Date':'20261004T230000Z','X-Amz-Expires':'60','X-Amz-SignedHeaders':'host','X-Amz-Signature':'a'.repeat(64)});
 return {url:`https://s3.us-east-1.wasabisys.com/${WASABI_BUCKET}/${key}?${q}`,expiresIn:60};
}
describe('closed presign failure classification',()=>{
 const cases:[string,(r:Record<string,unknown>)=>void][]=[
  ['presign_url_missing',r=>{delete r.url;}],
  ['presign_url_parsing',r=>{r.url='PRIVATE_CANARY: invalid url';}],
  ['presign_duplicate',r=>{r.url=String(r.url)+'&X-Amz-Expires=60';}],
  ...(['Algorithm','Signature','Credential','SignedHeaders','Date'] as const).map((field,index)=>[
   ['presign_algorithm','presign_signature','presign_credential_scope','presign_signed_headers','presign_date'][index],
   (r:Record<string,unknown>)=>{const u=new URL(String(r.url));u.searchParams.set('X-Amz-'+field,'PRIVATE_CANARY');r.url=u.href;}
  ] as [string,(r:Record<string,unknown>)=>void]),
 ];
 for(const [code,mutate] of cases)it(`${code} remains denied and does not expose input`,()=>{
  const raw:Record<string,unknown>=fixture();mutate(raw);
  try {validateProbeUrl(raw,key,now);throw Error('expected denial');}catch(e){
   expect(e).toBeInstanceOf(WasabiProbeError);expect((e as WasabiProbeError).code).toBe(code);
   expect((e as Error).message).toBe(code);expect(JSON.stringify(e)).not.toContain('PRIVATE_CANARY');expect(JSON.stringify(e)).not.toContain('X-Amz');
  }
 });
 it('accepts the same pinned valid URL and keeps host/object/expiry restrictions',()=>{
  const raw=fixture();expect(validateProbeUrl(raw,key,now).href).toBe(raw.url);
  for(const [mutate,code] of [
   [(u:URL)=>{u.hostname='outside.example';},'host_denied'],
   [(u:URL)=>{u.pathname='/wrong';},'object_denied'],
   [(u:URL)=>{u.searchParams.set('X-Amz-Expires','1');},'presign_expired'],
  ] as const){const u=new URL(raw.url);mutate(u);expect(()=>validateProbeUrl({...raw,url:u.href},key,now)).toThrow(code);}
 });
});
