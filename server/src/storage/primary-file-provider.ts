import http from "node:http";
import { readFileSync } from "node:fs";
import type { StorageProvider } from "./types.js";
import { createLocalDiskStorageProvider } from "./local-disk-provider.js";
import {notFound} from "../errors.js";

// Namespace authorization happens in the private file service; company-key
// authorization stays in StorageService and the existing asset routes.
export function createPrimaryFileProvider(localRoot: string, configFile: string): StorageProvider {
  const config = JSON.parse(readFileSync(configFile, "utf8")) as {socket:string;token:string};
  const legacy = createLocalDiskStorageProvider(localRoot);
  const request = (key:string, method:string, body?: Buffer | NodeJS.ReadableStream, length?:number, range?:string) => new Promise<http.IncomingMessage>((resolve,reject)=>{
    const req=http.request({socketPath:config.socket,path:"/v1/object?"+new URLSearchParams({namespace:"whoxos-assets",key}),method,
      headers:{Authorization:"Bearer "+config.token,...(length!==undefined?{"Content-Length":length}:{}),...(range?{Range:range}:{})}},resolve);
    req.setTimeout(300000,()=>req.destroy(new Error("Primary file storage timed out")));req.on("error",reject);
    if(body && !Buffer.isBuffer(body)) body.on("error",e=>req.destroy(e)).pipe(req); else req.end(body);
  });
  const consume = async (r:http.IncomingMessage) => {for await(const _ of r) { /* drain */ }};
  const checked = async (r:http.IncomingMessage) => {if((r.statusCode||500)>=300){await consume(r);throw new Error("Primary file storage unavailable ("+r.statusCode+")");}return r;};
  return {
    id:"s3",
    async putObject(input) {
      // Keep an atomic local spool until the remote acknowledgement. This also
      // preserves uploads when the account cap or network blocks new writes.
      await legacy.putObject(input);
      try {
        const spool=await legacy.getObject({objectKey:input.objectKey});
        await consume(await checked(await request(input.objectKey,"PUT",spool.stream,input.contentLength)));
        await legacy.deleteObject({objectKey:input.objectKey});
      } catch {
        console.warn("File queued locally until primary storage accepts uploads");
      }
    },
    async getObject(input) {
      const range=input.range?`bytes=${input.range.start}-${input.range.end}`:undefined;
      const response=await request(input.objectKey,"GET",undefined,undefined,range);
      if(response.statusCode===410){await consume(response);throw notFound("Object not found");}
      if(response.statusCode===404) {await consume(response);return legacy.getObject(input);}
      await checked(response);
      return {stream:response,contentLength:Number(response.headers["content-length"]),contentType:String(response.headers["content-type"]||"application/octet-stream"),etag:String(response.headers.etag||"")};
    },
    async headObject(input) {
      const r=await request(input.objectKey,"HEAD");await consume(r);
      if(r.statusCode===410)return {exists:false};
      if(r.statusCode===404)return legacy.headObject(input);
      await checked(r);return {exists:true,contentLength:Number(r.headers["content-length"])};
    },
    async deleteObject(input) {
      const r=await request(input.objectKey,"DELETE");if(![404,410].includes(r.statusCode||500))await checked(r);await consume(r);
      // A legacy file must not reappear through the migration fallback.
      await legacy.deleteObject(input);
    },
  };
}
