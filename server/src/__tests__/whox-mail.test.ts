import { describe,it,expect,vi,beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({mx:vi.fn(),connect:vi.fn(),close:vi.fn(),verify:vi.fn(),sendMail:vi.fn(),list:vi.fn(),getMailboxLock:vi.fn(),release:vi.fn(),search:vi.fn(),fetchAll:vi.fn()}));
vi.mock('node:dns/promises',()=>({resolveMx:mocks.mx}));
vi.mock('imapflow',()=>({ImapFlow:class {on(){} connect=mocks.connect;close=mocks.close;list=mocks.list;getMailboxLock=mocks.getMailboxLock;search=mocks.search;fetchAll=mocks.fetchAll;}}));
vi.mock('nodemailer',()=>({default:{createTransport:()=>({sendMail:mocks.sendMail,close:mocks.close})}}));
import { mailAgentAllowed,mailHost,mailSchemas,executeMail,isWhoxMail } from '../services/whox-mail.js';
import { whoxMailRoutes } from '../routes/whox-mail.js';
import express from 'express';
import request from 'supertest';
beforeEach(()=>{vi.clearAllMocks();mocks.mx.mockResolvedValue([{priority:20,exchange:'glacier-relay.mxrouting.net'},{priority:10,exchange:'glacier.mxrouting.net'}]);mocks.connect.mockResolvedValue(undefined);mocks.list.mockResolvedValue([]);mocks.getMailboxLock.mockResolvedValue({release:mocks.release});mocks.search.mockResolvedValue([]);mocks.fetchAll.mockResolvedValue([]);});
describe('WHOX Mail permissions',()=>{
  it('defaults deny and isolates agents',()=>{expect(mailAgentAllowed({},'a','mail_read')).toBe(false);expect(mailAgentAllowed({mailAgentPermissions:{a:{read:true,write:true}}},'b','mail_read')).toBe(false);});
  it('keeps reads and writes independent and fails closed for unknown tools',()=>{const config={mailAgentPermissions:{a:{read:true,write:false},b:{read:false,write:true}}};expect(mailAgentAllowed(config,'a','mail_read')).toBe(true);expect(mailAgentAllowed(config,'a','mail_send')).toBe(false);expect(mailAgentAllowed(config,'b','mail_send')).toBe(true);expect(mailAgentAllowed(config,'b','mail_read')).toBe(false);expect(mailAgentAllowed(config,'b','other')).toBe(false);expect(mailAgentAllowed(config,null,'mail_send')).toBe(false);});
  it('recognizes generic connections to the bridge too',()=>{expect(isWhoxMail({url:'https://overviewlabs.ai/api/whox-mail/mcp?mailbox=a%40b.com'})).toBe(true);});
});
describe('mail transport',()=>{
 it('discovers only the primary MXRoute server',async()=>{expect(await mailHost('team@whox.ai')).toBe('glacier.mxrouting.net');mocks.mx.mockResolvedValue([{priority:10,exchange:'attacker.example'}]);await expect(mailHost('team@whox.ai')).rejects.toThrow('supported');});
 it('rejects header injection and arbitrary senders',()=>{expect(mailSchemas.mail_send.safeParse({to:['admin@whox.ai'],subject:'hello\r\nBcc: x@x.com',text:'x'}).success).toBe(false);expect(mailSchemas.mail_send.safeParse({from:'other@whox.ai',to:['admin@whox.ai'],subject:'x',text:'x'}).success).toBe(false);});
 it('always closes the mailbox on authentication failure',async()=>{mocks.connect.mockRejectedValue({authenticationFailed:true});await expect(executeMail('team@whox.ai','secret','mail_list_folders',{})).rejects.toBeDefined();expect(mocks.close).toHaveBeenCalled();});
 it('returns JSON-safe matching headers with lossless modification sequences and flags',async()=>{
  mocks.search.mockResolvedValue([1,2,3]);
  mocks.fetchAll.mockResolvedValue([
   {uid:2,envelope:{subject:'Earlier'},flags:new Set(['\\Seen']),modseq:9007199254740993n},
   {uid:3,envelope:{subject:'Latest'},flags:new Set(),modseq:9007199254740994n},
  ]);
  const r=await executeMail('team@whox.ai','secret','mail_search',{folder:'INBOX',text:'OCC',limit:2});
  const wire=JSON.parse(JSON.stringify(r));
  expect(wire).toEqual([{uid:3,envelope:{subject:'Latest'},flags:[],modseq:'9007199254740994'},{uid:2,envelope:{subject:'Earlier'},flags:['\\Seen'],modseq:'9007199254740993'}]);
  expect(mocks.fetchAll).toHaveBeenCalledWith('3,2',{uid:true,envelope:true,flags:true},{uid:true});
  expect(mocks.release).toHaveBeenCalledOnce();expect(mocks.close).toHaveBeenCalledOnce();
 });
 it('returns no matches without issuing an invalid empty fetch',async()=>{
  const r=await executeMail('team@whox.ai','secret','mail_search',{text:'absent'});
  expect(r).toEqual([]);expect(mocks.fetchAll).not.toHaveBeenCalled();expect(mocks.release).toHaveBeenCalledOnce();
 });
 it('sends once with the authenticated mailbox as sender',async()=>{mocks.sendMail.mockResolvedValue({messageId:'id',accepted:['admin@whox.ai'],rejected:[]});await executeMail('team@whox.ai','secret','mail_send',{to:['admin@whox.ai'],subject:'Test',text:'Test'});expect(mocks.sendMail).toHaveBeenCalledOnce();expect(mocks.sendMail.mock.calls[0][0].from).toBe('team@whox.ai');});
});
describe('MCP bridge',()=>{
 function app(){const a=express();a.use(express.json());a.use(whoxMailRoutes());return a;}
 it('requires credentials',async()=>{expect((await request(app()).post('/api/whox-mail/mcp?mailbox=team@whox.ai').send({jsonrpc:'2.0',id:1,method:'initialize'})).status).toBe(401);});
 it('verifies credentials and exposes read and write tools',async()=>{const r=await request(app()).post('/api/whox-mail/mcp?mailbox=team@whox.ai').set('Authorization','Bearer secret').send({jsonrpc:'2.0',id:1,method:'tools/list'});expect(r.body.result.tools).toHaveLength(5);expect(mocks.connect).toHaveBeenCalledOnce();expect(JSON.stringify(r.body)).not.toContain('Bearer secret');});
 it('delivers a matching search result through MCP instead of a serialization error',async()=>{
  mocks.search.mockResolvedValue([42]);mocks.fetchAll.mockResolvedValue([{uid:42,envelope:{subject:'Provider reply'},flags:new Set(['\\Seen']),modseq:42n}]);
  const r=await request(app()).post('/api/whox-mail/mcp?mailbox=team@whox.ai').set('Authorization','Bearer secret').send({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'mail_search',arguments:{text:'OCC'}}});
  expect(r.body.error).toBeUndefined();expect(JSON.parse(r.body.result.content[0].text)[0]).toMatchObject({uid:42,modseq:'42',flags:['\\Seen']});
 });
 it('sanitizes provider errors',async()=>{mocks.connect.mockRejectedValue({authenticationFailed:true,message:'secret password'});const r=await request(app()).post('/api/whox-mail/mcp?mailbox=team@whox.ai').set('Authorization','Bearer secret').send({jsonrpc:'2.0',id:1,method:'initialize'});expect(r.body.error.message).toContain('login failed');expect(JSON.stringify(r.body)).not.toContain('secret password');});
 it('reports invalid limits as correctable tool errors without breaking the connection',async()=>{
  const a=app();
  const r=await request(a).post('/api/whox-mail/mcp?mailbox=team@whox.ai').set('Authorization','Bearer secret').send({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'mail_search',arguments:{limit:50}}});
  expect(r.body.error).toBeUndefined();expect(r.body.result.isError).toBe(true);
  expect(r.body.result.content[0].text).toContain('limit');expect(r.body.result.content[0].text).toContain('25');
  expect(mocks.connect).not.toHaveBeenCalled();
  const retry=await request(a).post('/api/whox-mail/mcp?mailbox=team@whox.ai').set('Authorization','Bearer secret').send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'mail_search',arguments:{limit:25}}});
  expect(retry.body.error).toBeUndefined();expect(JSON.parse(retry.body.result.content[0].text)).toEqual([]);
 });
});
