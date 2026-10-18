import { Router } from 'express';
import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import { executeMail, mailIdentity, mailSchemas, mailTools, withMailbox, type MailTool } from '../services/whox-mail.js';

// Stateless MCP bridge. Passwords arrive only from the encrypted connection vault.
export function whoxMailRoutes() {
  const router=Router();
  const active=new Set<string>();
  const attempts=new Map<string,{count:number;until:number}>();
  router.post('/api/whox-mail/mcp',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const identity=mailIdentity.safeParse(req.query.mailbox);
    const password=req.get('authorization')?.replace(/^Bearer /,'');
    if(!identity.success || !password || password.length>1024) {res.status(401).json({error:'Mailbox email and password are required.'});return;}
    const email=identity.data;
    const key=createHash('sha256').update(email.toLowerCase()).digest('hex');
    const now=Date.now();for(const[k,v]of attempts)if(v.until<now)attempts.delete(k);
    if((attempts.get(key)?.count??0)>=5){res.status(429).json({error:'Mailbox sign-in failed repeatedly. Check the password and retry in a minute.'});return;}
    if(active.has(key)){res.status(429).json({error:'Another mailbox operation is in progress. Retry shortly.'});return;}
    const body=req.body;
    if(!body || body.jsonrpc!=='2.0' || typeof body.method!=='string'){res.status(400).json({error:'Invalid MCP request'});return;}
    if(body.method==='notifications/initialized'){res.status(202).end();return;}
    active.add(key);
    try {
      let result:unknown;
      if(body.method==='initialize') {
        await withMailbox(email,password,async()=>true);
        result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'WHOX Mail',version:'1.0.0'}};
      }else if(body.method==='tools/list') {await withMailbox(email,password,async()=>true);result={tools:mailTools};}
      else if(body.method==='tools/call' && Object.hasOwn(mailSchemas,body.params?.name??'')) {
        const value=await executeMail(email,password,body.params.name as MailTool,body.params.arguments);
        result={content:[{type:'text',text:JSON.stringify(value)}]};
      } else {res.json({jsonrpc:'2.0',id:body.id??null,error:{code:-32601,message:'Method or tool not found'}});return;}
      attempts.delete(key);
      res.json({jsonrpc:'2.0',id:body.id??null,result});
    }catch(error){
      if(error instanceof ZodError){
        // A malformed tool call is not a broken mailbox connection. Return an
        // MCP tool error so the caller can correct the arguments without
        // degrading connection health or requesting another sign-in.
        const details=error.issues.map(issue=>`${issue.path.join('.') || 'arguments'}: ${issue.message}`).join('; ');
        res.json({jsonrpc:'2.0',id:body.id??null,result:{isError:true,content:[{type:'text',text:`Invalid mail tool arguments. ${details}`}]}});
        return;
      }
      const e=error as {authenticationFailed?:boolean;code?:string;name?:string};
      const auth=e.authenticationFailed===true || e.code==='EAUTH';
      if(auth){const old=attempts.get(key);attempts.set(key,{count:(old?.count??0)+1,until:now+60000});}
      const message=auth?'Mailbox login failed. Check the email and password.':e.name==='ZodError'?'Invalid mail tool arguments.':'Mail operation failed. Check the mailbox server and connection; a send must not be retried automatically because delivery may have occurred.';
      res.json({jsonrpc:'2.0',id:body.id??null,error:{code:-32000,message}});
    }finally{active.delete(key);}
  });
  return router;
}
