import http from 'node:http';
import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
export function request(config,namespace,key,{method='GET',body,range,contentType,mtimeNs,prefix,list=false}={}) {
  const query=new URLSearchParams({namespace,...(list?{prefix:prefix||''}:{key})});
  return new Promise((resolve,reject)=>{
    const req=http.request({socketPath:config.socket,path:(list?'/v1/list':'/v1/object')+'?'+query,method,
      headers:{Authorization:'Bearer '+config.token,...(body?{'Content-Length':body.length}:{}),...(range?{Range:range}:{}),...(contentType?{'Content-Type':contentType}:{}),...(mtimeNs?{'X-File-Mtime-Ns':mtimeNs}:{})}},resolve);
    req.setTimeout(300000,()=>req.destroy(Error('File store timeout')));req.on('error',reject);req.end(body);
  });
}
export async function bytes(response) {const chunks=[];for await(const c of response)chunks.push(c);return Buffer.concat(chunks);}
export async function checked(response) {if(response.statusCode<200||response.statusCode>=300){await bytes(response);throw Object.assign(Error('File store request failed: '+response.statusCode),{status:response.statusCode});}return response;}
export async function uploadFile(config,namespace,key,filename) {
  const stat=fs.statSync(filename,{bigint:true});
  return new Promise((resolve,reject)=>{
    const q=new URLSearchParams({namespace,key});
    const req=http.request({socketPath:config.socket,path:'/v1/object?'+q,method:'PUT',headers:{Authorization:'Bearer '+config.token,'Content-Length':String(stat.size),'X-File-Mtime-Ns':String(stat.mtimeNs)}},async response=>{try{await checked(response);resolve(JSON.parse((await bytes(response)).toString()));}catch(e){reject(e);}});
    req.setTimeout(300000,()=>req.destroy(Error('File upload timeout')));req.on('error',reject);fs.createReadStream(filename).on('error',e=>req.destroy(e)).pipe(req);
  });
}
export async function restore(config,namespace,key,destination) {const r=await checked(await request(config,namespace,key));await pipeline(r,fs.createWriteStream(destination,{flags:'wx',mode:0o600}));}
