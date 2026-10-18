import http from 'node:http';
import {createReadCache} from './read-cache.mjs';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

const require = createRequire('/var/lib/whox/.whox/cli/current/node_modules/@whoxos/server/package.json');
const postgres = require('postgres');
const changeSubscribers=new Set();
function sendChange(event,value) {
  for(const client of changeSubscribers) {
    if(['change','download'].includes(event)&&!client.namespaces.has(value.namespace))continue;
    if(client.res.writableLength>65536){client.res.destroy();continue;}
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  }
}
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const config = JSON.parse(await fs.readFile('/var/lib/overview-file-store/config.json','utf8'));
const dbConfig = JSON.parse(await fs.readFile('/var/lib/whox/.whox/instances/default/config.json','utf8'));
export const sql = postgres(dbConfig.database.connectionString, {max:4, onnotice:()=>{}});
const b2 = config.b2;
const s3 = new S3Client({endpoint:'https://s3.us-east-005.backblazeb2.com',region:'us-east-005',forcePathStyle:true,
  credentials:{accessKeyId:b2.B2_WRITE_KEY_ID,secretAccessKey:b2.B2_WRITE_KEY}});
const readRoots=JSON.parse(await fs.readFile('/var/lib/overview-file-store/read-cache.json','utf8').catch(()=>'{}'));
const readCache=createReadCache({roots:readRoots,load:async (entry,progress)=>{
 const offset=Number(entry.byte_offset),size=Number(entry.byte_size);
 for(let attempt=0;;attempt++) {
  try {
   progress({phase:'downloading',received:0});
   const response=await remote(entry.blob_key,`bytes=${offset}-${offset+size-1}`,20000);
   const chunks=[];let received=0;
   for await(const chunk of Readable.fromWeb(response.body)){
    received+=chunk.length;if(received>size)throw Error('File read exceeded its indexed length');chunks.push(chunk);progress({phase:'downloading',received});
   }
   return Buffer.concat(chunks);
  } catch(error) {
   if(attempt>=1)throw error;
   await new Promise(resolve=>setTimeout(resolve,150));
  }
 }
}});
export async function initialize() {
  await sql`CREATE SCHEMA IF NOT EXISTS overview_storage`;
  await sql`CREATE TABLE IF NOT EXISTS overview_storage.objects (
    namespace text NOT NULL, key text NOT NULL, blob_key text NOT NULL, byte_offset bigint NOT NULL DEFAULT 0,
    byte_size bigint NOT NULL, sha256 text NOT NULL, content_type text NOT NULL DEFAULT 'application/octet-stream',
    mtime_ns text, mode integer NOT NULL DEFAULT 420, deleted boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(namespace,key))`;
  await sql`CREATE TABLE IF NOT EXISTS overview_storage.versions (
    namespace text NOT NULL, key text NOT NULL, metadata jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS file_version_key_idx ON overview_storage.versions(namespace,key)`;
}
export function validate(namespace,key) {
  if (!/^[a-z][a-z0-9-]{1,50}$/.test(namespace) || !key || key.length>3000 || key.startsWith('/') || key.includes('\\') || key.includes('\0') || key.split('/').some(x=>!x||x==='.'||x==='..')) throw Object.assign(Error('Invalid file key'),{status:400});
}
function permit(req,namespace) {
  const supplied = req.headers.authorization?.replace(/^Bearer /,'') || '';
  for (const [name, token] of Object.entries(config.tokens)) {
    if (supplied.length===token.length && crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(token))) {
      const allowed=config.namespaces[name];
      if (allowed.includes('*') || allowed.includes(namespace)) return;
    }
  }
  throw Object.assign(Error('Unauthorized'),{status:401});
}
export async function remote(key,range='',timeout=120000) {
  if (!/^studio\/(?:blobs|manifests)\/[a-f0-9]{64}$/.test(key)) throw Error('Invalid blob');
  const uri='/objects/'+key,time=String(Math.floor(Date.now()/1000));
  const signature=crypto.createHmac('sha256',b2.GATEWAY_SECRET).update(['GET',uri,range,time].join('\n')).digest('hex');
  const r=await fetch(b2.GATEWAY+uri,{headers:{'X-Gateway-Time':time,'X-Gateway-Signature':signature,...(range?{Range:range}:{})},redirect:'manual',signal:AbortSignal.timeout(timeout),cache:'no-store'});
  if (![200,206].includes(r.status)) throw Error('Remote file read failed: '+r.status);
  if (range && r.status!==206) throw Error('Remote range was not honored');
  return r;
}
export async function durable(data) {
  const digest=hash(data), key='studio/blobs/'+digest;
  await s3.send(new PutObjectCommand({Bucket:b2.B2_BUCKET,Key:key,Body:data,ContentLength:data.length,ServerSideEncryption:'AES256'}));
  const response=await remote(key);const checksum=crypto.createHash('sha256');
  for await (const chunk of Readable.fromWeb(response.body)) checksum.update(chunk);
  if (checksum.digest('hex')!==digest) throw Error('Cloudflare read-back verification failed');
  return key;
}
export async function importFile(namespace,key,file) {
  validate(namespace,key);const before=await fs.stat(file,{bigint:true});
  const prev=await object(namespace,key);
  if(prev?.mtime_ns===String(before.mtimeNs)&&Number(prev.byte_size)===Number(before.size))return false;
  const digest=crypto.createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);
  const sha256=digest.digest('hex'),blob_key='studio/blobs/'+sha256;
  await s3.send(new PutObjectCommand({Bucket:b2.B2_BUCKET,Key:blob_key,Body:createReadStream(file),ContentLength:Number(before.size),ServerSideEncryption:'AES256'}));
  const response=await remote(blob_key),verify=crypto.createHash('sha256');for await(const chunk of Readable.fromWeb(response.body))verify.update(chunk);
  if(verify.digest('hex')!==sha256)throw Error('File verification failed');
  const after=await fs.stat(file,{bigint:true});if(after.mtimeNs!==before.mtimeNs||after.size!==before.size)throw Error('File changed during upload');
  await record([{namespace,key,blob_key,byte_offset:0,byte_size:Number(before.size),sha256,content_type:'application/octet-stream',mtime_ns:String(before.mtimeNs),mode:Number(before.mode)&511}]);return true;
}
export async function checkpoint() {
  const snapshot=await sql.begin(async tx=>{
    await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    return {format:1,createdAt:new Date().toISOString(),objects:await tx`SELECT * FROM overview_storage.objects ORDER BY namespace,key`,versions:await tx`SELECT * FROM overview_storage.versions ORDER BY archived_at`};
  });
  const data=Buffer.from(JSON.stringify(snapshot));
  const immutable='studio/manifests/'+hash(data),pointer='studio/manifests/'+hash('overview-primary-file-index-latest-v1');
  for(const key of [immutable,pointer]) {
    await s3.send(new PutObjectCommand({Bucket:b2.B2_BUCKET,Key:key,Body:data,ContentLength:data.length,ServerSideEncryption:'AES256'}));
    const r=await remote(key);if(hash(Buffer.from(await r.arrayBuffer()))!==hash(data))throw Error('Index checkpoint verification failed');
  }
  console.log(JSON.stringify({checkpoint:immutable,recoveryPointer:pointer,objects:snapshot.objects.length}));
}
export async function record(entries,origin='background') {
  await sql.begin(async tx=>{
    await tx`SELECT set_config('overview_storage.writer',${origin},true)`;
    for(const e of [...entries].sort((a,b)=>(a.namespace+'/'+a.key).localeCompare(b.namespace+'/'+b.key))) {
      validate(e.namespace,e.key);
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${e.namespace+':'+e.key},0))`;
      await tx`INSERT INTO overview_storage.versions(namespace,key,metadata)
        SELECT namespace,key,to_jsonb(o) FROM overview_storage.objects o WHERE namespace=${e.namespace} AND key=${e.key}
        AND (sha256<>${e.sha256} OR deleted)`;
      await tx`INSERT INTO overview_storage.objects ${tx(e,'namespace','key','blob_key','byte_offset','byte_size','sha256','content_type','mtime_ns','mode')}
        ON CONFLICT(namespace,key) DO UPDATE SET blob_key=excluded.blob_key,byte_offset=excluded.byte_offset,byte_size=excluded.byte_size,
        sha256=excluded.sha256,content_type=excluded.content_type,mtime_ns=excluded.mtime_ns,mode=excluded.mode,deleted=false,updated_at=now()`;
    }
  });
}
export async function object(namespace,key) {validate(namespace,key);return (await sql`SELECT * FROM overview_storage.objects WHERE namespace=${namespace} AND key=${key} AND NOT deleted`)[0];}
const excluded = new Set(['node_modules','.next','.git','.codex','.auth','.cache','.pnpm-store','compiler-cache','auth.json','credentials.json','secrets','private','mail','db','postgres-data','working-cache','.locks','.snapshots','.downloads']);
export async function importRoot(namespace,root,prefix='') {
  const existing = new Map((await sql`SELECT key,sha256,mtime_ns,byte_size,deleted FROM overview_storage.objects WHERE namespace=${namespace}`).map(e=>[e.key,e]));
  let entries=[], buffers=[], size=0, changed=0, bytes=0;
  async function flush() {
    if(!entries.length) return;
    const data=Buffer.concat(buffers),blob=await durable(data);
    await record(entries.map(e=>({...e,blob_key:blob})));changed+=entries.length;bytes+=size;
    console.log(JSON.stringify({namespace,imported:changed,bytes}));entries=[];buffers=[];size=0;
  }
  async function walk(dir) {
    for(const e of await fs.readdir(dir,{withFileTypes:true})) {
      if(excluded.has(e.name.toLowerCase()) || (e.name.startsWith('.env') || e.name.toLowerCase().endsWith('.env')) || /\.(pem|key)$/.test(e.name) || e.name.endsWith('.log') || e.isSymbolicLink()) continue;
      const file=path.join(dir,e.name),key=(prefix?prefix+'/':'')+path.relative(root,file).split(path.sep).join('/');
      if(e.isDirectory()) {await walk(file);continue;}if(!e.isFile())continue;
      const before=await fs.stat(file,{bigint:true});
      const prev=existing.get(key);
      if(prev?.deleted)continue;
      if(prev && prev.mtime_ns===String(before.mtimeNs) && Number(prev.byte_size)===Number(before.size)) continue;
      if(before.size>16777216n) {await flush();if(await importFile(namespace,key,file)){changed++;bytes+=Number(before.size);}continue;}
      const data=await fs.readFile(file),after=await fs.stat(file,{bigint:true});
      if(before.mtimeNs!==after.mtimeNs || before.size!==after.size) continue;
      if(size+data.length>16*1024*1024)await flush();
      entries.push({namespace,key,byte_offset:size,byte_size:data.length,sha256:hash(data),content_type:'application/octet-stream',mtime_ns:String(before.mtimeNs),mode:Number(before.mode)&511});
      buffers.push(data);size+=data.length;
      if(size>=16*1024*1024)await flush();
    }
  }
  await walk(root);await flush();return {namespace,imported:changed,bytes};
}
async function serve(req,res) {
  try {
    const url=new URL(req.url,'http://localhost'),namespace=url.searchParams.get('namespace')||'',key=url.searchParams.get('key')||'';
    permit(req,namespace);
    const suppliedOrigin=req.headers['x-storage-origin'];
    const origin=typeof suppliedOrigin==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(suppliedOrigin)?suppliedOrigin:'background';
    if(url.pathname==='/v1/events'&&req.method==='GET') {
      const namespaces=new Set(String(req.headers['x-storage-namespaces']||namespace).split(','));
      if(namespaces.size>12||changeSubscribers.size>=32)throw Object.assign(Error('Too many subscriptions'),{status:429});
      for(const name of namespaces){validate(name,'root');permit(req,name);}
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});
      res.flushHeaders();res.write('event: ready\ndata: {}\n\n');
      const client={res,namespaces};changeSubscribers.add(client);
      res.on('close',()=>changeSubscribers.delete(client));return;
    }
    if(url.pathname==='/health') {await sql`SELECT 1`;res.end(JSON.stringify({status:'ok',provider:'backblaze-cloudflare',index:'postgresql'}));return;}
    if(url.pathname==='/v1/metadata' && req.method==='GET') {
      validate(namespace,key||'root');
      const file=key?(await sql`SELECT byte_size,updated_at,mtime_ns,mode FROM overview_storage.objects WHERE namespace=${namespace} AND key=${key} AND NOT deleted`)[0]:null;
      const prefix=key?key+'/':'';
      if(file) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...file,kind:'file'}));return;}
      const child=(await sql`SELECT 1 FROM overview_storage.objects WHERE namespace=${namespace} AND NOT deleted AND starts_with(key,${prefix}) LIMIT 1`)[0];
      if(!child)throw Object.assign(Error('Not found'),{status:404});
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({kind:'directory',byte_size:0,updated_at:null}));return;
    }
    if(url.pathname==='/v1/directory' && req.method==='GET') {
      validate(namespace,key||'root');
      const prefix=key?key+'/':'';
      const rows=await sql`SELECT split_part(substr(key,length(${prefix})+1),'/',1) AS name,
        bool_or(position('/' in substr(key,length(${prefix})+1))>0) AS directory
        FROM overview_storage.objects WHERE namespace=${namespace} AND NOT deleted AND starts_with(key,${prefix})
        GROUP BY 1 ORDER BY 1`;
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(rows));return;
    }
    if(url.pathname==='/v1/list' && req.method==='GET') {
      const prefix=url.searchParams.get('prefix')||'';
      if(prefix)validate(namespace,prefix.replace(/\/$/,''));
      const rows=await sql`SELECT key,byte_size,sha256,updated_at,mtime_ns,mode FROM overview_storage.objects WHERE namespace=${namespace} AND NOT deleted AND starts_with(key,${prefix}) ORDER BY key`;
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(rows));return;
    }
    if(url.pathname==='/v1/pack' && req.method==='POST') {
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>24*1024*1024)throw Object.assign(Error('Pack too large'),{status:413});chunks.push(chunk);}
      const files=JSON.parse(Buffer.concat(chunks).toString()).files;
      if(!Array.isArray(files)||!files.length||files.length>1000)throw Object.assign(Error('Invalid pack'),{status:400});
      const buffers=[],entries=[];let offset=0;
      for(const f of files){validate(namespace,f.key);const data=Buffer.from(f.data,'base64');entries.push({namespace,key:f.key,byte_offset:offset,byte_size:data.length,sha256:hash(data),content_type:f.content_type||'application/octet-stream',mtime_ns:f.mtime_ns||null,mode:420});buffers.push(data);offset+=data.length;}
      const blob=await durable(Buffer.concat(buffers));await record(entries.map(e=>({...e,blob_key:blob})),origin);res.statusCode=201;res.end(JSON.stringify({files:entries.length}));return;
    }
    if(url.pathname!=='/v1/object')throw Object.assign(Error('Not found'),{status:404});
    validate(namespace,key);
    if(req.method==='PUT') {
      const declared=Number(req.headers['content-length']);
      if(!Number.isSafeInteger(declared)||declared<0||declared>1073741824)throw Object.assign(Error('Invalid content length'),{status:413});
      const tmp='/var/lib/overview-file-store/upload-'+crypto.randomUUID();
      let count=0;const digest=crypto.createHash('sha256');const file=await fs.open(tmp,'wx',0o600);
      try {
        for await (const chunk of req) {count+=chunk.length;if(count>declared)throw Error('Upload exceeds declared size');digest.update(chunk);await file.write(chunk);}
        await file.close();if(count!==declared)throw Error('Incomplete upload');
        const sha256=digest.digest('hex'),blob_key='studio/blobs/'+sha256;
        await s3.send(new PutObjectCommand({Bucket:b2.B2_BUCKET,Key:blob_key,Body:createReadStream(tmp),ContentLength:count,ServerSideEncryption:'AES256'}));
        const response=await remote(blob_key),verify=crypto.createHash('sha256');
        for await (const chunk of Readable.fromWeb(response.body))verify.update(chunk);
        if(verify.digest('hex')!==sha256)throw Error('Remote upload verification failed');
        await record([{namespace,key,blob_key,byte_offset:0,byte_size:count,sha256,content_type:req.headers['content-type']||'application/octet-stream',mtime_ns:req.headers['x-file-mtime-ns']||null,mode:420}],origin);
        res.statusCode=201;res.end(JSON.stringify({sha256,byte_size:count}));
      } finally {await file.close().catch(()=>{});await fs.unlink(tmp).catch(()=>{});}return;
    }
    const e=await object(namespace,key);
    if(!e) {
      const tombstone=(await sql`SELECT deleted FROM overview_storage.objects WHERE namespace=${namespace} AND key=${key}`)[0];
      throw Object.assign(Error('Not found'),{status:tombstone?.deleted?410:404});
    }
    if(req.method==='DELETE') {
      await sql.begin(async tx=>{await tx`SELECT set_config('overview_storage.writer',${origin},true)`;await tx`SELECT pg_advisory_xact_lock(hashtextextended(${namespace+':'+key},0))`;await tx`INSERT INTO overview_storage.versions(namespace,key,metadata) SELECT namespace,key,to_jsonb(o) FROM overview_storage.objects o WHERE namespace=${namespace} AND key=${key} AND NOT deleted`;await tx`UPDATE overview_storage.objects SET deleted=true,updated_at=now() WHERE namespace=${namespace} AND key=${key}`;});res.statusCode=204;res.end();return;
    }
    let start=0,end=Number(e.byte_size)-1;
    const range=req.headers.range;
    if(range) {
      const m=/^bytes=(\d+)-(\d*)$/.exec(range);
      if(!m)throw Object.assign(Error('Invalid range'),{status:416});
      start=Number(m[1]);end=m[2]?Math.min(end,Number(m[2])):end;
      if(start>end)throw Object.assign(Error('Invalid range'),{status:416});
      res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${e.byte_size}`);
    }
    res.setHeader('Content-Type',e.content_type);res.setHeader('Content-Length',Math.max(0,end-start+1));res.setHeader('ETag','"'+e.sha256+'"');res.setHeader('X-File-Sha256',e.sha256);res.setHeader('Cache-Control','no-store');
    res.setHeader('Last-Modified',new Date(e.updated_at).toUTCString());
    if(e.mtime_ns)res.setHeader('X-File-Mtime-Ns',e.mtime_ns);
    if(req.method==='HEAD' || Number(e.byte_size)===0) {res.end();return;}
    if(req.method!=='GET')throw Object.assign(Error('Unsupported method'),{status:405});
    const transfer=req.headers['x-storage-transfer-id'];let lastReport=0;
    const progress=typeof transfer==='string'&&/^[a-f0-9-]{36}$/.test(transfer)?value=>{
      const now=Date.now();if(value.phase==='downloading'&&value.received>0&&value.received<value.total&&now-lastReport<250)return;
      lastReport=now;sendChange('download',{id:transfer,namespace,key:e.key,...value});
    }:undefined;
    const cached=await readCache.read(e,progress);
    if(cached){res.end(cached.subarray(start,end+1));return;}
    const offset=Number(e.byte_offset),r=await remote(e.blob_key,`bytes=${offset+start}-${offset+end}`);
    if(progress){
      let received=0;const total=end-start+1;progress({phase:'downloading',received,total});
      const meter=new Transform({transform(chunk,_encoding,done){received+=chunk.length;progress({phase:'downloading',received,total});done(null,chunk);}});
      await pipeline(Readable.fromWeb(r.body),meter,res);progress({phase:'ready',received,total});
    }else await pipeline(Readable.fromWeb(r.body),res);
  }catch(e) {
    if(res.headersSent){res.destroy();return;}
    for(const h of ['Content-Length','Content-Range','ETag','X-File-Sha256'])res.removeHeader(h);
    res.statusCode=e.status||503;res.end(JSON.stringify({error:e.status?e.message:'File storage temporarily unavailable'}));
    if(!e.status)console.error('File store request failed:',e.name);
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  await initialize();
  if(process.argv[2]==='import') {try {console.log(JSON.stringify(await importRoot(process.argv[3],process.argv[4],process.argv[5]||'')));}finally{await sql.end();}}
  else if(process.argv[2]==='import-file') {try {console.log(JSON.stringify({imported:await importFile(process.argv[3],process.argv[4],process.argv[5])}));}finally{await sql.end();}}
  else if(process.argv[2]==='checkpoint') {try {await checkpoint();}finally{await sql.end();}}
  else {
    await sql`CREATE OR REPLACE FUNCTION overview_storage.notify_file_change() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE ns text; item_key text; area text;
      BEGIN
        IF TG_OP='UPDATE' THEN
          IF ROW(NEW.sha256,NEW.deleted,NEW.mode,NEW.content_type,NEW.byte_size) IS NOT DISTINCT FROM ROW(OLD.sha256,OLD.deleted,OLD.mode,OLD.content_type,OLD.byte_size) THEN RETURN NULL; END IF;
        END IF;
        IF TG_OP='DELETE' THEN ns:=OLD.namespace;item_key:=OLD.key;ELSE ns:=NEW.namespace;item_key:=NEW.key;END IF;
        -- Ephemeral worker heartbeats and transcripts must not wake build reconciliation.
        IF ns='studio-jobs' AND item_key !~ '/(request|runner-state|compiler-state|preview-state|compile-request|project-result)[.]json$' THEN RETURN NULL; END IF;
        area:=CASE WHEN ns<>'studio-data' THEN 'library' WHEN item_key ~ '^blueprints/([^/]+/)?[.]builds/' THEN 'builds' WHEN starts_with(item_key,'blueprint-thumbnails/') THEN 'thumbnails' WHEN starts_with(item_key,'blueprints/') THEN 'library' ELSE 'other' END;
        PERFORM pg_notify('overview_storage_changed',json_build_object('namespace',ns,'area',area,'origin',coalesce(nullif(current_setting('overview_storage.writer',true),''),'background'))::text);
        RETURN NULL;
      END $body$`;
    await sql`CREATE OR REPLACE TRIGGER overview_storage_file_change AFTER INSERT OR UPDATE OR DELETE ON overview_storage.objects FOR EACH ROW EXECUTE FUNCTION overview_storage.notify_file_change()`;
    await sql.listen('overview_storage_changed',payload=>{
      try {sendChange('change',JSON.parse(payload));}catch { /* Ignore malformed external notifications. */ }
    },()=>sendChange('ready',{}));
    const socket='/run/overview-file-store/store.sock';await fs.unlink(socket).catch(()=>{});
    const server=http.createServer(serve);server.requestTimeout=300000;
    server.listen(socket,async()=>{await fs.chmod(socket,0o660);await fs.chown(socket,0,1001);console.log('Overview file store ready');});
    process.on('SIGTERM',()=>{for(const client of changeSubscribers)client.res.end();server.close(async()=>{await sql.end();process.exit(0);});});
  }
}
