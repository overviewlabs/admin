import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { EventEmitter } from "node:events";
import request from "supertest";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../services/routines.js", () => ({ routineService: () => ({ list: vi.fn(async () => []) }) }));
vi.mock("../services/activity-log.js", () => ({ logActivity: vi.fn(async () => undefined) }));
import { spawn } from "node:child_process";
import { hqlLeadRoutes } from "../routes/hql-leads.js";
const company = "6e796ff0-10ed-4c7d-bd6c-10c9386cd30a";
function app(actor: any) {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => { (req as any).actor=actor;next(); }); a.use(hqlLeadRoutes({} as any));
  a.use((err: any, _req: any, res: any, _next: any) => res.status(err.status ?? 500).json({error:err.message}));return a;
}
function fakeRegistry(result: any) {
  vi.mocked(spawn).mockImplementation(() => {
    const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr={resume:()=>undefined};child.kill=vi.fn();
    child.stdin={end:()=>queueMicrotask(()=>{child.stdout.emit('data',JSON.stringify(result));child.emit('close',0);})};return child;
  });
}
const owner={type:'board',source:'session',userId:'owner',companyIds:[company],memberships:[{companyId:company,status:'active',membershipRole:'owner'}]};
describe('Club HQL lead boundaries',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('blocks cross-company keys before registry access',async()=>{
    const r=await request(app({type:'agent',companyId:'other'})).get(`/companies/${company}/leads`);
    expect(r.status).toBe(403);expect(spawn).not.toHaveBeenCalled();
  });
  it('does not expose HQL registry under another company',async()=>{
    const r=await request(app({...owner,companyIds:['other']})).get('/companies/other/leads');
    expect(r.status).toBe(404);expect(spawn).not.toHaveBeenCalled();
  });
  it('rejects viewer note writes',async()=>{
    const actor={...owner,memberships:[{companyId:company,status:'active',membershipRole:'viewer'}]};
    const r=await request(app(actor)).post(`/companies/${company}/leads/HQL-123456789abc/notes`).send({text:'Note'});
    expect(r.status).toBe(403);expect(spawn).not.toHaveBeenCalled();
  });
  it('rejects empty notes before writing',async()=>{
    const r=await request(app(owner)).post(`/companies/${company}/leads/HQL-123456789abc/notes`).send({text:' '});
    expect(r.status).toBe(400);expect(spawn).not.toHaveBeenCalled();
  });
  it('reads the pipeline through the authenticated company boundary',async()=>{
    fakeRegistry({leads:[{id:'HQL-123456789abc',status:'candidate'}],pipeline:{candidate:1},research_status:null});
    const r=await request(app(owner)).get(`/companies/${company}/leads/pipeline`);
    expect(r.status).toBe(200);expect(r.body.leads[0].status).toBe('candidate');expect(r.body.routines).toEqual([]);
  });
  it('exports fresh records and guards spreadsheet formula values',async()=>{
    fakeRegistry({leads:[{id:'HQL-123456789abc',company:'=untrusted',contact:{phone:'+15550100'}}]});
    const r=await request(app(owner)).get(`/companies/${company}/leads/export.csv`);
    expect(r.status).toBe(200);expect(r.headers['content-type']).toContain('text/csv');expect(r.text).toContain("'=untrusted");expect(r.text).toContain("'+15550100");
  });
  it('rejects malformed lead IDs' ,async()=>{
    const r=await request(app(owner)).post(`/companies/${company}/leads/not-a-lead/notes`).send({text:'Note'});
    expect(r.status).toBe(404);expect(spawn).not.toHaveBeenCalled();
  });
});
