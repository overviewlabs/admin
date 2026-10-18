import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { Db } from "@whoxos/db";
vi.mock("./production-root.js", () => ({ assertProductionRootExecution: vi.fn(), callRootExecutor: vi.fn() }));
vi.mock("./activity-log.js", () => ({ logActivity: vi.fn() }));
import { assertProductionRootExecution, callRootExecutor } from "./production-root.js";
import { executeServerManagement, serverManagementMiddleware, serverManagementSchema, sanitizeServerManagementResult } from "./server-management.js";
import { assertCompanyAccess } from "../routes/authz.js";
import { errorHandler } from "../middleware/error-handler.js";
const actor = { type: "board", source: "board_key", userId: "owner", isInstanceAdmin: true, companyIds: [] };
let server: ReturnType<express.Express["listen"]>;
let port: number;
let writes = 0;
beforeEach(async () => {
 vi.resetAllMocks(); writes=0;
 vi.mocked(callRootExecutor).mockResolvedValue({ available:true,enabled:true });
 const app=express();app.use(express.json());app.use(serverManagementMiddleware);
 app.post('/api/companies', (req,res)=>{assertCompanyAccess(req,'other');writes++;res.status(201).json({name:req.body.name,owner:req.actor.userId,password:'hidden'});});
 app.get('/api/companies',(_req,res)=>res.status(403).json({error:'Denied by canonical policy'}));
 app.use(errorHandler);
 await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>resolve());});port=(server.address() as any).port;
});
afterEach(async()=>{vi.restoreAllMocks();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
const db = { select: () => ({ from: async () => [{ id: "main" }, { id: "other" }] }) } as unknown as Db;
const req=()=>({actor,socket:{localPort:port},method:'POST'} as unknown as Request);
describe('server management delegation',()=>{
 it('creates through the canonical API with responsible human attribution and secret filtering',async()=>{
  const result=await executeServerManagement(db,req(),'main','ceo',{method:'POST',path:'/api/companies',body:{name:'New org'}});
  expect(result).toEqual({success:true,status:201,result:{name:'New org',owner:'owner'}});expect(writes).toBe(1);
  expect(assertProductionRootExecution).toHaveBeenCalledTimes(2);
 });
 it('preserves canonical denial instead of reporting success',async()=>{
  expect(await executeServerManagement(db,req(),'main','ceo',{method:'GET',path:'/api/companies'})).toMatchObject({success:false,status:403});
 });
 it('does not invoke routes without root authority',async()=>{
  vi.mocked(assertProductionRootExecution).mockRejectedValue({status:403});
  await expect(executeServerManagement(db,req(),'other','ceo',{method:'POST',path:'/api/companies',body:{name:'No'}})).rejects.toMatchObject({status:403});expect(writes).toBe(0);
 });
 it('rechecks grants at dispatch, preventing revoked writes',async()=>{
  vi.mocked(callRootExecutor).mockResolvedValueOnce({available:true,enabled:true}).mockResolvedValueOnce({available:true,enabled:false});
  const result=await executeServerManagement(db,req(),'main','ceo',{method:'POST',path:'/api/companies',body:{name:'No'}});
  expect(result).toMatchObject({success:false,status:403});expect(writes).toBe(0);
 });
 it('binds delegation to request body and consumes it on a tampered attempt',async()=>{
  const originalFetch=globalThis.fetch;
  let replayStatus=0;
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
    const tampered=await originalFetch(url,{...options,body:JSON.stringify({name:'Changed'})});
    expect(tampered.status).toBe(403);
    const replay=await originalFetch(url,options);replayStatus=replay.status;return replay;
  });
  const result=await executeServerManagement(db,req(),'main','ceo',{method:'POST',path:'/api/companies',body:{name:'Original'}});
  expect(result.success).toBe(false);expect(replayStatus).toBe(403);expect(writes).toBe(0);
 });
 it('rejects forged delegation headers',async()=>{
  const r=await request(server).post('/api/companies').set('x-overview-server-management','forged').send({name:'No'});expect(r.status).toBe(403);expect(writes).toBe(0);
 });
 it('rejects SSRF, traversal, recursive dispatch and root grant routes',()=>{
  for(const path of ['https://example.com','//example.com','/api/companies/../auth','/api/companies/%2e%2e/auth','/api/companies/x/voice-sessions','/api/companies/x/agents/y/server-api','/api/companies/x/agents/y/production-root','/api/auth','/api/companies#x']) expect(serverManagementSchema.safeParse({method:'GET',path}).success).toBe(false);
 });
 it('removes sensitive configuration recursively',()=>{
  expect(sanitizeServerManagementResult({agents:[{name:'CEO',adapterConfig:{env:{KEY:'hidden'}},apiKey:'hidden'}]})).toEqual({agents:[{name:'CEO'}]});
 });
});
