import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildLibrary,libraryReadme} from './library-layout.mjs';
const require=createRequire('/var/lib/whox/.whox/cli/current/node_modules/@whoxos/server/package.json');
const postgres=require('postgres');
const {S3Client,PutObjectCommand}=require('@aws-sdk/client-s3');
const stateDir='/var/lib/overview-file-store';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const settings=JSON.parse(await fs.readFile(stateDir+'/config.json','utf8'));
const connection=JSON.parse(await fs.readFile('/var/lib/whox/.whox/instances/default/config.json','utf8'));
const db=postgres(connection.database.connectionString,{max:1,onnotice:()=>{}});
const previous=await fs.readFile(stateDir+'/library-status.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return {objects:{}}});
const state={objects:{...previous.objects}};
const env=text=>Object.fromEntries(text.split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
function storage(c){return {bucket:c.B2_BUCKET,gateway:c.GATEWAY,signing:c.GATEWAY_SECRET,s3:new S3Client({endpoint:'https://s3.us-east-005.backblazeb2.com',region:'us-east-005',forcePathStyle:true,credentials:{accessKeyId:c.B2_WRITE_KEY_ID,secretAccessKey:c.B2_WRITE_KEY}})};}
const studio=storage(settings.b2);
const tqlEnv=env(await fs.readFile('/.WHOX/organizations/tql-wms/application/deploy/standalone/.b2-files.env','utf8'));
const wms=storage({B2_BUCKET:tqlEnv.TQL_B2_BUCKET,GATEWAY:tqlEnv.TQL_FILES_GATEWAY,GATEWAY_SECRET:tqlEnv.TQL_FILES_GATEWAY_SECRET,B2_WRITE_KEY_ID:tqlEnv.TQL_B2_WRITE_KEY_ID,B2_WRITE_KEY:tqlEnv.TQL_B2_WRITE_KEY});
let writes=0;
async function publish(target,key,value,type='application/json') {
 const allowed=target.bucket==='ovl-studio'?'studio/library/':target.bucket==='tql-wms'?'crm-documents/library/':null;
 if(!allowed||!key.startsWith(allowed)||key.split('/').some(p=>!p||p==='.'||p==='..')||/[\\\x00-\x1f\x7f]/.test(key))throw Error('Invalid library object key');
 const data=Buffer.from(type==='application/json'?JSON.stringify(value)+'\n':value);
 // Large source catalogs exceed 16 MiB; compact JSON preserves the format.
 if(data.length>64*1024*1024)throw Error('Library catalog exceeds maximum size');
 const digest=sha(data),identity=target.bucket+'/'+key;
 if(state.objects[identity]===digest)return {key,sha256:digest,bytes:data.length};
 await target.s3.send(new PutObjectCommand({Bucket:target.bucket,Key:key,Body:data,ContentLength:data.length,ContentType:type,ServerSideEncryption:'AES256',Metadata:{'catalog-format':'overview-labs-storage-library-v1'}}));
 const uri='/objects/'+key.split('/').map(encodeURIComponent).join('/'),stamp=String(Math.floor(Date.now()/1000));
 const signature=crypto.createHmac('sha256',target.signing).update(['GET',uri,'',stamp].join('\n')).digest('hex');
 const r=await fetch(target.gateway+uri,{headers:{'User-Agent':'Overview-Labs-Storage-Library/1.0','X-Gateway-Time':stamp,'X-Gateway-Signature':signature},redirect:'manual',signal:AbortSignal.timeout(120000),cache:'no-store'});
 if(r.status!==200||sha(Buffer.from(await r.arrayBuffer()))!==digest)throw Error('Storage library read-back verification failed');
 state.objects[identity]=digest;writes++;return {key,sha256:digest,bytes:data.length};
}
try {
 const snapshot=await db.begin(async tx=>{
  await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
  const rows=await tx`WITH previous AS (SELECT namespace,key,count(*) AS n FROM overview_storage.versions GROUP BY namespace,key) SELECT o.*,coalesce(p.n,0) AS previous_versions FROM overview_storage.objects o LEFT JOIN previous p USING(namespace,key) WHERE NOT o.deleted ORDER BY namespace,key`;
  const companies=await tx`SELECT id,name FROM companies`;
  const assets=await tx`SELECT object_key,original_filename FROM assets`;
  return {rows,companies,assets};
 });
 const metadata=JSON.parse(execFileSync('python3',[fileURLToPath(new URL('./catalog-metadata.py',import.meta.url))],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const maintenance=JSON.parse(await fs.readFile(stateDir+'/maintenance-status.json','utf8'));
 metadata.workspaces=maintenance.workspaceIdentities??Object.fromEntries(maintenance.workspaces.map(root=>[sha(root).slice(0,20),root]));
 metadata.companies=Object.fromEntries(snapshot.companies.map(c=>[c.id,c.name]));
 metadata.assetNames=Object.fromEntries(snapshot.assets.filter(a=>a.original_filename).map(a=>[a.object_key,a.original_filename]));
 const library=buildLibrary(snapshot.rows,metadata),catalogs=[];
 for(const catalog of library.catalogs){const receipt=await publish(studio,catalog.key,catalog);catalogs.push({...receipt,title:catalog.title,fileCount:catalog.fileCount,totalBytes:catalog.totalBytes});}
 const pointer='studio/manifests/'+sha('overview-primary-file-index-latest-v1');
 let legacySnapshot=null;
 try {const legacy=JSON.parse(await fs.readFile('/.WHOX/.System/studio-b2/state.json','utf8'));legacySnapshot={title:'Retained Studio archive snapshot',manifestKey:legacy.manifestKey,categories:legacy.categories};}
 catch(e){if(e.code!=='ENOENT')throw e;}
 await publish(studio,'studio/library/system/recovery/catalog.json',{format:'overview-labs-recovery-catalog/v1',bucket:'ovl-studio',fileIndex:{title:'Latest shared file-index recovery checkpoint',objectKey:pointer},studioArchive:legacySnapshot,recoveryKeys:'Stored separately in protected operator configuration; never in this catalog.'});
 await publish(studio,'studio/library/README.txt',libraryReadme,'text/plain; charset=utf-8');
 await publish(wms,'crm-documents/library/documents/catalog.json',{format:'overview-labs-crm-document-catalog/v1',bucket:'tql-wms',title:'TQL WMS CRM documents',fileCount:metadata.wmsDocuments.length,files:metadata.wmsDocuments.map(d=>({...d,storage:{bucket:'tql-wms',objectKey:'crm-documents/'+d.documentId}}))});
 await publish(wms,'crm-documents/library/README.txt','TQL WMS document library\n\nStart with crm-documents/library/index.json. The documents/catalog.json lists the original filenames, document names and storage object keys of active Backblaze-backed CRM uploads.\n\nThis is a private metadata catalog; use TQL WMS for ordinary document downloads so customer and owner permissions are checked. Existing local-only documents stay local and are not falsely listed as Backblaze uploads. WMS database/deployment backups and workspace files are cataloged separately in ovl-studio/studio/library/. No recovery keys or application credentials are included.\n','text/plain; charset=utf-8');
 await publish(wms,'crm-documents/library/index.json',{format:'overview-labs-storage-library/v1',title:'TQL WMS document library',bucket:'tql-wms',catalog:'crm-documents/library/documents/catalog.json',activeCloudDocumentCount:metadata.wmsDocuments.length,localOnlyDocumentCount:metadata.localWmsDocumentCount,sharedBackups:{bucket:'ovl-studio',catalog:'studio/library/backups/databases/tql-wms/catalog.json'}});
 await publish(studio,'studio/library/index.json',{format:'overview-labs-storage-library/v1',title:'Overview Labs shared storage library',bucket:'ovl-studio',description:'Blueprints, websites, application files, workspaces and encrypted backups with original filenames and content locations.',fileCount:library.totalFiles,totalBytes:library.totalBytes,catalogCount:catalogs.length,catalogs,recoveryCatalog:'studio/library/system/recovery/catalog.json',wmsDocuments:{bucket:'tql-wms',catalog:'crm-documents/library/index.json'}});
 state.completedAt=new Date().toISOString();state.fileCount=library.totalFiles;state.catalogCount=catalogs.length;state.writesThisRun=writes;
 const tmp=stateDir+'/library-status.new';await fs.writeFile(tmp,JSON.stringify(state,null,2),{mode:0o600});await fs.rename(tmp,stateDir+'/library-status.json');
 console.log(JSON.stringify({library:'updated',files:library.totalFiles,catalogs:catalogs.length,writes,wmsCloudDocuments:metadata.wmsDocuments.length}));
}finally{await db.end();}
