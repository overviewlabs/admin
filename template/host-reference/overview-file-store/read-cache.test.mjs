import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadCache} from './read-cache.mjs';
const entry=data=>({namespace:'studio-previews',key:'site.js',byte_size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
test('parallel reads share one verified download and indexed revisions replace old content',async()=>{
 let reads=0;const contents=new Map();const old=Buffer.from('old content'),fresh=Buffer.from('new content');
 contents.set(entry(old).sha256,old);contents.set(entry(fresh).sha256,fresh);
 const cache=createReadCache({load:async e=>{reads++;await new Promise(r=>setTimeout(r,10));return contents.get(e.sha256);}});
 const values=await Promise.all(Array.from({length:40},()=>cache.read(entry(old))));
 assert.equal(reads,1);assert(values.every(v=>v.equals(old)));
 assert((await cache.read(entry(fresh))).equals(fresh));assert.equal(reads,2);
});
test('LRU respects memory budget and large files bypass buffering',async()=>{
 let reads=0;const values=['aaaaaa','bbbbbb','cccccc'].map(s=>Buffer.from(s)),lookup=new Map(values.map(v=>[entry(v).sha256,v]));
 const cache=createReadCache({maxBytes:12,maxFileBytes:6,load:async e=>{reads++;return lookup.get(e.sha256);}});
 for(const value of values)await cache.read(entry(value));assert.equal(cache.state().bytes,12);
 await cache.read(entry(values[0]));assert.equal(reads,4);assert.equal(cache.state().entries,2);
 assert.equal(await cache.read(entry(Buffer.alloc(7))),null);assert.equal(reads,4);
});
test('corrupt downloads and failures are not cached, and download concurrency is bounded',async()=>{
 let active=0,maximum=0,fail=true;
 const values=Array.from({length:16},(_,i)=>Buffer.from(String(i))),lookup=new Map(values.map(v=>[entry(v).sha256,v]));
 const cache=createReadCache({concurrency:2,load:async e=>{
  maximum=Math.max(maximum,++active);try{await new Promise(r=>setTimeout(r,5));return fail?Buffer.from('corrupt'):lookup.get(e.sha256);}finally{active--;}
 }});
 await assert.rejects(cache.read(entry(values[0])),/integrity/);assert.equal(cache.state().entries,0);
 fail=false;await Promise.all(values.map(v=>cache.read(entry(v))));assert.equal(maximum,2);
 assert.equal(cache.state().pending,0);assert.equal(cache.state().active,0);
});
test('local reads are verified, stale bytes and escaping symlinks fall back to the immutable origin',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'file-cache-')),outside=await fs.mkdtemp(path.join(os.tmpdir(),'file-private-'));
 t.after(async()=>{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});});
 const data=Buffer.from('verified'),e=entry(data);let reads=0;
 const options={roots:{'studio-previews':root},load:async()=>{reads++;return data;}};
 await fs.writeFile(path.join(root,'site.js'),data);assert((await createReadCache(options).read(e)).equals(data));assert.equal(reads,0);
 await fs.writeFile(path.join(root,'site.js'),'modified');assert((await createReadCache(options).read(e)).equals(data));assert.equal(reads,1);
 await fs.unlink(path.join(root,'site.js'));await fs.writeFile(path.join(outside,'secret.js'),data);await fs.symlink(path.join(outside,'secret.js'),path.join(root,'site.js'));
 assert((await createReadCache(options).read(e)).equals(data));assert.equal(reads,2);
});
test('coalesced readers each receive real byte progress and cached reads need no download',async()=>{
 const data=Buffer.from('abcd'),first=[],second=[];let release,loads=0;
 const cache=createReadCache({load:async(_entry,progress)=>{loads++;progress({phase:'downloading',received:2});await new Promise(resolve=>release=resolve);progress({phase:'downloading',received:4});return data;}});
 const a=cache.read(entry(data),p=>first.push(p));
 await new Promise(r=>setImmediate(r));
 const b=cache.read(entry(data),p=>second.push(p));release();await Promise.all([a,b]);
 assert.equal(loads,1);assert(first.some(p=>p.received===2&&p.total===4));assert(second.some(p=>p.received===2&&p.total===4));assert.equal(second.at(-1).phase,'ready');
 const hit=[];await cache.read(entry(data),p=>hit.push(p));assert.equal(hit[0].phase,'cached');assert.equal(loads,1);assert.equal(cache.state().pending,0);
});
