import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Immutable content hashes keep cached reads current without polling or timers.
export function createReadCache({roots={},load,maxBytes=32*1024**2,maxFileBytes=4*1024**2,concurrency=4}) {
 const cache=new Map(),pending=new Map(),waiting=[];let bytes=0,active=0;
 const digest=value=>createHash('sha256').update(value).digest('hex');
 async function local(entry){
  const root=roots[entry.namespace];if(!root)return null;
  try{
   const base=await fs.realpath(root),file=await fs.realpath(path.resolve(root,entry.key));
   if(!file.startsWith(base+path.sep))return null;
   const info=await fs.stat(file);if(!info.isFile()||info.size!==Number(entry.byte_size))return null;
   const chunks=[];let size=0;
   for await(const chunk of createReadStream(file,{end:Number(entry.byte_size)})){
    size+=chunk.length;if(size>Number(entry.byte_size))return null;chunks.push(chunk);
   }
   const data=Buffer.concat(chunks);
   return data.length===Number(entry.byte_size)&&digest(data)===entry.sha256?data:null;
  }catch{return null;}
 }
 async function limited(task){
  if(active>=concurrency){
   if(waiting.length>=512)throw new Error('File read queue is full');
   await new Promise(resolve=>waiting.push(resolve));
  }else active++;
  try{return await task();}finally{const next=waiting.shift();if(next)next();else active--;}
 }
 return {
  async read(entry,onProgress){
   const size=Number(entry.byte_size),key=entry.sha256;
   const report=value=>{try{onProgress?.(value);}catch{}};
   if(!/^[a-f0-9]{64}$/.test(key)||size<0||size>maxFileBytes||size>maxBytes)return null;
   const hit=cache.get(key);
   if(hit){if(hit.length!==size)throw new Error('File integrity verification failed');cache.delete(key);cache.set(key,hit);report({phase:'cached',received:size,total:size});return hit;}
   let transfer=pending.get(key);
   if(!transfer){
    transfer={listeners:new Set(),snapshot:{phase:'queued',received:0,total:size},promise:null};
    const update=value=>{transfer.snapshot={...value,total:size};for(const listener of transfer.listeners)listener(transfer.snapshot);};
    transfer.promise=limited(async()=>{
    const available=await local(entry);
    const value=available||await load(entry,update);
    update({phase:available?'cached':'verifying',received:size});
    if(value.length!==size||digest(value)!==key)throw new Error('File integrity verification failed');
    while(cache.size&&(bytes+value.length>maxBytes||cache.size>=4096)){
     const oldest=cache.keys().next().value;bytes-=cache.get(oldest).length;cache.delete(oldest);
    }
    cache.set(key,value);bytes+=value.length;update({phase:'ready',received:size});return value;
   }).catch(error=>{update({phase:'error',received:transfer.snapshot.received});throw error;}).finally(()=>pending.delete(key));
   pending.set(key,transfer);
   }
   if(onProgress)transfer.listeners.add(report);
   report(transfer.snapshot);
   try{const value=await transfer.promise;if(value.length!==size)throw new Error('File integrity verification failed');return value;}
   finally{transfer.listeners.delete(report);}
  },
  state(){return {bytes,entries:cache.size,pending:pending.size,active,waiting:waiting.length};},
 };
}
