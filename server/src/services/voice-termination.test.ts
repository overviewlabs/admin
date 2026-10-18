import { beforeEach, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { Db } from "@whoxos/db";
vi.mock("./server-management.js",()=>({executeServerManagement:vi.fn()}));
import { executeServerManagement } from "./server-management.js";
import { callVoiceApi } from "./voice-direct-api.js";
const req={actor:{type:'board',userId:'owner'}} as Request;
const scope={companyId:'main',agentId:'ceo',userId:'owner',issueId:'chat'};
const id='a5f8662b-6a70-4a56-b628-c7918e2b5522';
beforeEach(()=>vi.resetAllMocks());
it('uses canonical termination with the exact named target',async()=>{
 vi.mocked(executeServerManagement).mockResolvedValue({success:true,status:200,result:{deleted:true}});
 const result=await callVoiceApi({} as Db,req,scope,{action:'terminate_organization',id,data:JSON.stringify({confirmationName:'Test organization'})});
 expect(executeServerManagement).toHaveBeenCalledWith({},req,'main','ceo',{method:'POST',path:`/api/companies/${id}/terminate`,body:{confirmationName:'Test organization'}});
 expect(result).toMatchObject({success:true});
});
it('rejects missing or ambiguous arguments without attempting deletion',async()=>{
 for(const args of [{action:'terminate_organization'},{action:'terminate_organization',id,data:'{}'},{action:'terminate_organization',id,data:'{"confirmationName":""}'}])await expect(callVoiceApi({} as Db,req,scope,args)).rejects.toBeDefined();
 expect(executeServerManagement).not.toHaveBeenCalled();
});
it('preserves a specific protected-organization result',async()=>{
 vi.mocked(executeServerManagement).mockResolvedValue({success:false,status:403,result:{error:'WHOXOS cannot be deleted.'}});
 expect(await callVoiceApi({} as Db,req,scope,{action:'terminate_organization',id,data:'{"confirmationName":"WHOXOS"}'})).toMatchObject({success:false,status:403,result:{error:'WHOXOS cannot be deleted.'}});
});
