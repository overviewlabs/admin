import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFile, stat, mkdir, open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { canonical, historyTransfer } from '../services/treasury-history-transfer.js';
import { executeWasabiDirectS3 } from '../services/wasabi-direct-s3.js';
import { WASABI_BUCKET, WASABI_COMPANY, WASABI_CONNECTION, WASABI_REGION } from '../services/wasabi-private-probe.js';

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  readFile: vi.fn(), stat: vi.fn(), mkdir: vi.fn(), open: vi.fn(),
}));

function fixture(action: 'check' | 'authorize' = 'check') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const runId = randomUUID();
  const binding = { envelopeSha256: 'a'.repeat(64), querySha256: 'b'.repeat(64), queryId: 'c'.repeat(64), artifactHashes: {worker: 'd'.repeat(64)}, identity: {id: runId, companyId: WASABI_COMPANY, role: 'data', status: 'running', checkoutRunId: runId} };
  const common = {queryId: binding.queryId, querySha256: binding.querySha256, envelopeSha256: binding.envelopeSha256};
  const values: Record<string, any> = {
    review: {decision: 'accept', scope: 'history-integrated', artifactHashes: binding.artifactHashes},
    retention: {...common, verified: true, purpose: 'research', expiresAt: Date.now()/1000 + 300},
    budget: {...common, purpose: 'research', maxBytes: 10000, maxCostUsd: 1},
    localRestore: {verified: true}, queryQuality: {...common, verified: true},
  };
  const references = Object.fromEntries(Object.keys(values).map(gate => [gate, {issueId: 'issue-'+gate, commentId: gate}]));
  const rows = Object.entries(values).map(([gate, value]) => ({id: gate, createdAt: new Date(), authorUserId: null, deletedAt: null, body: JSON.stringify({schema: 'storage-control-record-v1', companyId: WASABI_COMPANY, gate, value, revoked: false, validUntil: Date.now()/1000+300})}));
  const config = {enabled: true, envelopeSha256: binding.envelopeSha256, artifactHashes: binding.artifactHashes, queries: {[binding.queryId]: {querySha256: binding.querySha256, recordReferences: references}}};
  const gate = {decision: 'accept', artifactHashes: binding.artifactHashes, envelopeSha256: binding.envelopeSha256, querySha256: binding.querySha256, retentionVerified: true, queryQualityVerified: true, localRestoreVerified: true, maxBytes: 10000, maxCostUsd: 1, purpose: 'research', expiresAt: values.retention.expiresAt, recordIds: Object.fromEntries(Object.keys(values).map(k => [k,k]))};
  const label = action === 'authorize' ? 'admission' : 'preflight';
  const id = createHash('sha256').update(canonical({binding, label})).digest('hex').slice(0,32);
  const key = `treasury/${WASABI_COMPANY}/research/history/${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}.bin`;
  const raw = Buffer.from(JSON.stringify({connectionId: WASABI_CONNECTION, action, key, sha256: '0'.repeat(64), bytes: 0, scope: {binding, gate}, at: Date.now(), nonce: randomUUID(), label}));
  const envelope = {payload: raw.toString('base64'), signature: sign(null,raw,privateKey).toString('base64')};
  vi.mocked(readFile).mockImplementation(async path => {
    if(String(path).endsWith('wasabi-worker-public.pem')) return publicKey.export({format:'pem',type:'spki'}).toString();
    if(String(path).endsWith('treasury-history-release.json')) return JSON.stringify(config);
    throw new Error('unexpected file');
  });
  vi.mocked(stat).mockImplementation(async path => {
    if(String(path).includes('/ended-')) throw Object.assign(new Error(),{code:'ENOENT'});
    return {uid:0,mode:0o640,size:1000,isFile:()=>true} as any;
  });
  const gateway = {
    verifiedRunSession: vi.fn(async()=>({companyId: WASABI_COMPANY, agentId:'fc41a3fc-e1d2-4293-903a-b48c280a141d', runId, issueId:'202d7337-125d-40e7-a96e-5de8c9954230'})),
    listToolsForSession: vi.fn(async()=>[
      ...['put','get'].map(action=>({connectionId: WASABI_CONNECTION,upstreamToolName:'wasabi_s3_presign_'+action+'_object',name:action})),
      {connectionId:WASABI_CONNECTION,upstreamToolName:'wasabi_s3_list_objects_v2',name:'list'},
    ]),
    executeTool: vi.fn(async (input: any) => {
      if(input.tool==='list')return {status:'completed',result:await input.consumePrivateResult({data:{structuredContent:{$metadata:{httpStatusCode:200},Name:WASABI_BUCKET,Prefix:input.parameters.Prefix,MaxKeys:1,IsTruncated:false,KeyCount:0}}})};
      const d=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
      const params=new URLSearchParams({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`synthetic/${d.slice(0,8)}/us-east-1/s3/aws4_request`,'X-Amz-Date':d,'X-Amz-Expires':'300','X-Amz-SignedHeaders':'host','X-Amz-Signature':'a'.repeat(64)});
      const raw={data:{structuredContent:{url:`https://s3.us-east-1.wasabisys.com/whox-treasury-research-0d8aad87/${input.parameters.key}?${params}`,expiresIn:300}}};
      return {status:'completed',result:await input.consumePrivateResult(raw)};
    }),
  };
  const db = {select:()=>({from:()=>({where:async()=>rows})})};
  const actor={type:'agent',source:'agent_jwt',agentId:'fc41a3fc-e1d2-4293-903a-b48c280a141d',companyId:WASABI_COMPANY,runId};
  return {binding, envelope, gateway, db, config, gate, rows, privateKey, actor, key};
}

describe('history preflight before a paid request',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn());});
  it('requires actual read-only provider listing after local presigning without fetching object data or reserving intent',async()=>{
    const f=fixture();
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).resolves.toEqual({ok:true,operation:'history_preflight_v1',queryId:f.binding.queryId,envelopeSha256:f.binding.envelopeSha256});
    expect(f.gateway.verifiedRunSession).toHaveBeenCalledTimes(8);
    expect(f.gateway.executeTool.mock.calls.map(([x])=>x.tool)).toEqual(['put','get','list']);
    expect(f.gateway.executeTool.mock.calls[2][0]).toMatchObject({timeoutMs:10000,parameters:{Bucket:WASABI_BUCKET,Prefix:f.key,region:WASABI_REGION,MaxKeys:1}});
    expect(mkdir).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['credentials_rejected','timeout','http_failure','truncated','wrong_prefix','wrong_bucket','excess_max_keys','missing_key_count','foreign_object','skipped_consumer','replayed'] as const)('refuses %s from the real provider check even when both local presigns succeed',async mode=>{
    const f=fixture();const execute=f.gateway.executeTool.getMockImplementation()!;
    f.gateway.executeTool.mockImplementation(async input=>{
      if(input.tool!=='list')return execute(input);
      if(mode==='credentials_rejected'||mode==='timeout')throw new Error(mode==='timeout'?'wasabi_direct_timeout':'wasabi_direct_authentication_failed');
      if(mode==='skipped_consumer')return {status:'completed',result:{}};
      const value:Record<string,any>={$metadata:{httpStatusCode:200},Name:WASABI_BUCKET,Prefix:f.key,MaxKeys:1,IsTruncated:false,KeyCount:0};
      if(mode==='http_failure')value.$metadata.httpStatusCode=403;
      if(mode==='truncated')value.IsTruncated=true;
      if(mode==='wrong_prefix')value.Prefix='other';
      if(mode==='wrong_bucket')value.Name='other';
      if(mode==='excess_max_keys')value.MaxKeys=1000;
      if(mode==='missing_key_count')delete value.KeyCount;
      if(mode==='foreign_object'){value.KeyCount=1;value.Contents=[{Key:'other'}];}
      return {status:mode==='replayed'?'replayed':'completed',result:await input.consumePrivateResult({data:{structuredContent:value}})};
    });
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow();
    expect(f.gateway.executeTool.mock.calls.map(([x])=>x.tool)).toEqual(['put','get','list']);
    expect(fetch).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(mkdir).not.toHaveBeenCalled();
  });
  it.each(['before_listing','inside_consumer','after_consumer'] as const)('refuses authority revoked %s and never publishes success',async phase=>{
    const f=fixture();const execute=f.gateway.executeTool.getMockImplementation()!;
    f.gateway.executeTool.mockImplementation(async input=>{
      if(phase==='before_listing'&&input.tool==='get') {const result=await execute(input);f.config.enabled=false;return result;}
      if(input.tool==='list'&&phase==='inside_consumer')f.config.enabled=false;
      const result=await execute(input);
      if(input.tool==='list'&&phase==='after_consumer')f.config.enabled=false;
      return result;
    });
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow();
    if(phase==='before_listing')expect(f.gateway.executeTool.mock.calls.map(([x])=>x.tool)).toEqual(['put','get']);
    expect(fetch).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(mkdir).not.toHaveBeenCalled();
  });
  it('discards even a successful existing-object listing inside the trusted consumer',async()=>{
    const f=fixture();const execute=f.gateway.executeTool.getMockImplementation()!;let consumedResult:unknown;
    f.gateway.executeTool.mockImplementation(async input=>{
      if(input.tool!=='list')return execute(input);
      consumedResult=await input.consumePrivateResult({data:{structuredContent:{$metadata:{httpStatusCode:200},Name:WASABI_BUCKET,Prefix:f.key,MaxKeys:1,IsTruncated:false,KeyCount:1,Contents:[{Key:f.key,ETag:'PRIVATE_PROVIDER_CANARY'}]}}});
      return {status:'completed',result:consumedResult};
    });
    const result=await historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor);
    expect(consumedResult).toEqual({operation:'history_storage_auth_check_v1',action:'list',valid:true});
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_CANARY');
    expect(JSON.stringify(consumedResult)).not.toContain(f.key);
    expect(fetch).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(mkdir).not.toHaveBeenCalled();
  });
  it.each([200,403])('uses actual SDK read-only S3 dispatch after local signing; provider HTTP %i determines admission',async statusCode=>{
    const f=fixture();const requests:{method:string;path:string;query:Record<string,unknown>}[]=[];
    f.gateway.executeTool.mockImplementation(async input=>{
      const toolName=input.tool==='list'?'wasabi_s3_list_objects_v2':`wasabi_s3_presign_${input.tool}_object`;
      const raw=await executeWasabiDirectS3({companyId:WASABI_COMPANY,connectionId:WASABI_CONNECTION,toolName,parameters:input.parameters,timeoutMs:input.timeoutMs,
        credentials:async()=>({accessKeyId:'MANUFACTURED_ACCESS',secretAccessKey:'MANUFACTURED_SECRET'})},
        {createClient:config=>new S3Client({...config,requestHandler:{handle:async request=>{
          requests.push({method:request.method,path:request.path,query:request.query});
          return {response:{statusCode,headers:{'content-type':'application/xml'},body:Readable.from([statusCode===200
            ? `<ListBucketResult><Name>${WASABI_BUCKET}</Name><Prefix>${f.key}</Prefix><MaxKeys>1</MaxKeys><IsTruncated>false</IsTruncated><KeyCount>0</KeyCount></ListBucketResult>`
            : '<Error><Code>AccessDenied</Code><Message>PRIVATE_PROVIDER_CANARY</Message></Error>'])}};
        }}})});
      return {status:'completed',result:await input.consumePrivateResult(raw)};
    });
    const result=historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor);
    if(statusCode===200)await expect(result).resolves.toMatchObject({ok:true,operation:'history_preflight_v1'});
    else await expect(result).rejects.toThrow('wasabi_direct_authentication_failed');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({method:'GET',path:`/${WASABI_BUCKET}/`,query:{prefix:f.key,'max-keys':'1','list-type':'2'}});
    expect(fetch).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(mkdir).not.toHaveBeenCalled();
  });
  it.each(['reauth','provider_error','missing_url','skipped_consumer','replayed','revoked'])('refuses upstream %s before any paid source or storage request',async mode=>{
    const f=fixture();
    f.gateway.executeTool.mockImplementation(async input=>{
      if(mode==='skipped_consumer'||mode==='replayed')return {status:mode==='replayed'?'replayed':'completed',result:{}};
      if(mode==='revoked')f.config.enabled=false;
      const value=mode==='reauth'?{error:'reauth_required',message:'synthetic'}:mode==='provider_error'?{error:'upstream_failed'}:{};
      return {status:'completed',result:await input.consumePrivateResult({data:{isError:false,structuredContent:value}})};
    });
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(mkdir).not.toHaveBeenCalled();
  });
  it('surfaces unreadable public metadata before any connected-tool execution',async()=>{
    const f=fixture(); const original=vi.mocked(readFile).getMockImplementation()!;
    vi.mocked(readFile).mockImplementation(async(...args)=>{
      if(String(args[0]).endsWith('treasury-history-release.json'))throw Object.assign(new Error(),{code:'EACCES'});
      return original(...args);
    });
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow();
    expect(f.gateway.listToolsForSession).not.toHaveBeenCalled();
    expect(f.gateway.executeTool).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  });
  it('rejects absent storage tools and a changed release without provider calls',async()=>{
    const f=fixture();f.gateway.listToolsForSession.mockResolvedValue([]);
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow();
    const g=fixture();const discover=g.gateway.listToolsForSession.getMockImplementation()!;g.gateway.listToolsForSession.mockImplementation(async()=>{g.config.enabled=false;return discover();});
    await expect(historyTransfer(g.db as any,g.gateway as any,'test',g.envelope)).rejects.toThrow();
    expect(g.gateway.executeTool).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  });
  it('denies a catalog with only local presign tools before executing any of them',async()=>{
    const f=fixture();const discover=f.gateway.listToolsForSession.getMockImplementation()!;
    f.gateway.listToolsForSession.mockImplementation(async()=>(await discover()).filter(tool=>tool.name!=='list'));
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow();
    expect(f.gateway.executeTool).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(mkdir).not.toHaveBeenCalled();
  });
  it('fresh signed authority returns the exact identity and gate without discovering tools or writing',async()=>{
    const f=fixture('authorize');
    const expected={ok:true,operation:'history_authority_v1',identity:f.binding.identity,gate:f.gate};
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).resolves.toEqual(expected);
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).resolves.toEqual(expected);
    expect(f.gateway.verifiedRunSession).toHaveBeenCalledTimes(4);
    expect(f.gateway.listToolsForSession).not.toHaveBeenCalled();
    expect(f.gateway.executeTool).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(mkdir).not.toHaveBeenCalled();
  });
  it.each(['revoked','expired','deleted','superseded','ambiguous','changed'] as const)('fresh authority refuses a %s decision on the next request',async condition=>{
    const f=fixture('authorize');
    await historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor);
    const row=f.rows.find(r=>r.id==='review')!;const value=JSON.parse(row.body);
    if(condition==='revoked')value.revoked=true;
    if(condition==='expired')value.validUntil=Date.now()/1000-1;
    if(condition==='deleted')row.deletedAt=new Date() as any;
    if(condition==='changed')value.value.artifactHashes={worker:'f'.repeat(64)};
    if(condition==='superseded'||condition==='ambiguous')f.rows.push({...row,id:'successor',createdAt:new Date(row.createdAt.getTime()+(condition==='superseded'?1:0))});
    row.body=JSON.stringify(value);
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow();
    expect(f.gateway.executeTool).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  });
  it('refuses a lost checkout during the current record read',async()=>{
    const f=fixture('authorize');
    f.gateway.verifiedRunSession.mockResolvedValueOnce({companyId:WASABI_COMPANY,agentId:'fc41a3fc-e1d2-4293-903a-b48c280a141d',runId:f.binding.identity.id,issueId:'202d7337-125d-40e7-a96e-5de8c9954230'}).mockRejectedValueOnce(new Error('checkout ended'));
    await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,f.actor)).rejects.toThrow('checkout ended');
    expect(f.gateway.executeTool).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  });
  it('requires the original matching run JWT in addition to root attestation and gateway session',async()=>{
    const f=fixture('authorize');
    for(const actor of [undefined,{...f.actor,source:'api_key'},{...f.actor,type:'board'},{...f.actor,runId:randomUUID()},{...f.actor,companyId:randomUUID()},{...f.actor,agentId:randomUUID()}]) {
      await expect(historyTransfer(f.db as any,f.gateway as any,'test',f.envelope,actor)).rejects.toThrow();
    }
    expect(f.gateway.verifiedRunSession).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  });
  it('rejects stale signatures and authority requests carrying bytes',async()=>{
    const f=fixture('authorize');
    for(const override of [{at:Date.now()-31000},{bytes:1},{label:'preflight'},{ciphertext:'anything'}]) {
      const r={...JSON.parse(Buffer.from(f.envelope.payload,'base64').toString()),...override};
      const raw=Buffer.from(JSON.stringify(r));const envelope={payload:raw.toString('base64'),signature:sign(null,raw,f.privateKey).toString('base64')};
      await expect(historyTransfer(f.db as any,f.gateway as any,'test',envelope,f.actor)).rejects.toThrow();
    }
    expect(f.gateway.verifiedRunSession).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  });
});
