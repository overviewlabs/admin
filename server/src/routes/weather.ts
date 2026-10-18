import { Router, type Request } from "express";
import type { Db } from "@whoxos/db";
import { z } from "zod";
import { assertCompanyAccess } from "./authz.js";
import { accessService } from "../services/access.js";
import { forbidden } from "../errors.js";
import { systemWeather } from "../services/weather.js";
import { isWeatherTool, WEATHER_TOOL_DEFINITIONS } from "../services/weather-tools.js";

export async function executeWeather(db: Db, req: Request, companyId: string, tool: string, input: unknown, selectedAgentId?: string) {
  assertCompanyAccess(req,companyId);
  const actors=selectedAgentId?[req.actor,{type:"agent" as const,companyId,agentId:selectedAgentId}]:[req.actor];
  for(const actor of actors) {
    const decision=await accessService(db).decide({actor,action:actor.type==="agent"?"company_scope:read":"tools:use",resource:{type:"company",companyId}});
    if(!decision.allowed)throw forbidden(decision.explanation);
  }
  return systemWeather.call(tool,input);
}

export function weatherRoutes(db: Db) {
  const router=Router();
  for(const tool of WEATHER_TOOL_DEFINITIONS) router.post(`/companies/:companyId/weather/${tool.name.replace("weather_","")}`,async(req,res)=>{
    const companyId=z.string().uuid().parse(req.params.companyId);
    res.setHeader("Cache-Control","no-store");
    res.json(await executeWeather(db,req,companyId,tool.name,req.body??{}));
  });
  return router;
}

/** Local Admin adapters share this PUBLIC-DATA ONLY engine with company tools.
 * No tenant data, auth cookies, credentials or URLs are accepted. Proxy/browser
 * requests are rejected even when a reverse proxy connects over loopback.
 */
export function localSystemWeatherRoutes() {
  const router=Router();
  function localOnly(req: Request) {
    const address=req.socket.remoteAddress;
    // Node MCP clients set Sec-Fetch-Mode. Browsers additionally send Origin,
    // cookies or Sec-Fetch-Site; remote proxy requests carry forwarding headers.
    if(!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(address??"")||Object.keys(req.headers).some(name=>name==="origin"||name==="cookie"||name==="forwarded"||name.startsWith("x-forwarded-")||name==="sec-fetch-site"||name==="sec-fetch-dest")) throw forbidden("System weather bridge accepts direct loopback adapter requests only.");
  }
  router.post("/internal/system-weather",async(req,res)=>{
    localOnly(req);
    const body=z.object({tool:z.string().refine(isWeatherTool),arguments:z.record(z.string(),z.unknown()).default({})}).strict().parse(req.body);
    res.setHeader("Cache-Control","no-store");
    res.json(await systemWeather.call(body.tool,body.arguments));
  });
  router.post("/internal/weather/mcp",async(req,res)=>{
    localOnly(req);res.setHeader("Cache-Control","no-store");
    const body=z.object({jsonrpc:z.literal("2.0"),id:z.union([z.string(),z.number()]).optional(),method:z.string(),params:z.record(z.string(),z.unknown()).optional()}).strict().parse(req.body);
    if(body.id===undefined){res.status(202).end();return;}
    let result:unknown;
    if(body.method==="initialize")result={protocolVersion:"2025-03-26",capabilities:{tools:{listChanged:false}},serverInfo:{name:"overview-weather",version:"1"}};
    else if(body.method==="ping")result={};
    else if(body.method==="tools/list")result={tools:WEATHER_TOOL_DEFINITIONS};
    else if(body.method==="tools/call"){
      const params=z.object({name:z.string().refine(isWeatherTool),arguments:z.record(z.string(),z.unknown()).default({}),_meta:z.record(z.string(),z.unknown()).optional()}).strict().parse(body.params);
      try{const value=await systemWeather.call(params.name,params.arguments);result={content:[{type:"text",text:JSON.stringify(value)}],structuredContent:value};}
      catch(error){result={isError:true,content:[{type:"text",text:error instanceof Error?error.message:"Weather request failed"}]};}
    }else{res.json({jsonrpc:"2.0",id:body.id,error:{code:-32601,message:"Unknown method"}});return;}
    res.json({jsonrpc:"2.0",id:body.id,result});
  });
  return router;
}
