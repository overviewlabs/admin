import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {importFile, object, remote, sql, checkpoint} from '/usr/local/libexec/overview-file-store/store.mjs';
const retry=async fn=>{
 for(let attempt=0;;attempt++)try{return await fn();}catch(error){if(attempt>=3)throw error;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
};
try {
 const [action,key,file]=process.argv.slice(2);
 if(action==='put') {
  await retry(()=>importFile('backups',key,file));
  const e=await object('backups',key);
  console.log(JSON.stringify({namespace:'backups',key,blob_key:e.blob_key,byte_offset:Number(e.byte_offset),byte_size:Number(e.byte_size),sha256:e.sha256}));
 } else if(action==='get') {
  const e=JSON.parse(await fs.readFile(key,'utf8'));
  const offset=Number(e.byte_offset),size=Number(e.byte_size),hash=crypto.createHash('sha256');
  const out=await fs.open(file,'wx',0o600);
  try {
   for(let at=0;at<size;at+=32*1024**2){
    const count=Math.min(32*1024**2,size-at);
    const chunk=await retry(async()=>{
     const response=await remote(e.blob_key,`bytes=${offset+at}-${offset+at+count-1}`,120000);
     const data=Buffer.from(await response.arrayBuffer());
     if(data.length!==count)throw Error('Incomplete remote range');return data;
    });
    hash.update(chunk);await out.writeFile(chunk);
   }
   if(hash.digest('hex')!==e.sha256)throw Error('Remote checksum mismatch');
  } catch(error){await fs.unlink(file).catch(()=>{});throw error;}
  finally{await out.close();}
 } else if(action==='checkpoint') await retry(()=>checkpoint());
 else throw Error('Unknown action');
} finally {await sql.end();}
