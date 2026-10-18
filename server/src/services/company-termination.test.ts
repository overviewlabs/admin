import { PROTECTED_ORGANIZATION_ID } from "./organization-protection.js";
import { companyService } from "./companies.js";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as home from "../home-paths.js";
import * as storageModule from "../storage/index.js";
import * as configModule from "../config.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { agents, companies, companyMemberships, createDb, issues, startEmbeddedPostgresTestDatabase } from "@whoxos/db";
import { assertTerminationOwner, purgeCompanyRows, terminateCompanyData } from "./company-termination.js";

describe("organization termination", () => {
 let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
 let db: ReturnType<typeof createDb>;
 beforeAll(async () => { temporary=await startEmbeddedPostgresTestDatabase('termination-');db=createDb(temporary.connectionString); },90000);
 afterAll(async()=>temporary?.cleanup());
 async function fixture() {
  const id=randomUUID();
  await db.insert(companies).values({id,name:'Disposable organization',issuePrefix:'T'+id.slice(0,8)});
  const [agent]=await db.insert(agents).values({companyId:id,name:'Test agent',role:'ceo'}).returning();
  await db.insert(issues).values({companyId:id,title:'Test task',assigneeAgentId:agent.id});
  return id;
 }
 it('deletes all scoped tables and cascaded children while preserving another organization',async()=>{
  const target=await fixture(),other=await fixture();
  await db.execute(sql`create table termination_feature_test (id uuid primary key, company_id uuid references companies(id), agent_id uuid references agents(id))`);
  await db.execute(sql`create table termination_child_test (id uuid primary key, parent_id uuid references termination_feature_test(id) on delete cascade)`);
  const parent=randomUUID();await db.execute(sql`insert into termination_feature_test values(${parent}::uuid,${target}::uuid,null)`);
  await db.execute(sql`insert into termination_child_test values(${randomUUID()}::uuid,${parent}::uuid)`);
  await purgeCompanyRows(db,target);
  expect(await db.select().from(companies).where(eq(companies.id,target))).toHaveLength(0);
  expect(await db.select().from(agents).where(eq(agents.companyId,target))).toHaveLength(0);
  expect(await db.select().from(issues).where(eq(issues.companyId,target))).toHaveLength(0);
  expect(await db.execute(sql`select * from termination_child_test`)).toHaveLength(0);
  expect(await db.select().from(issues).where(eq(issues.companyId,other))).toHaveLength(1);
  await db.execute(sql`drop table termination_child_test`);await db.execute(sql`drop table termination_feature_test`);
 });
 it('rolls database deletion back when an unknown restrictive dependency prevents cleanup',async()=>{
  const target=await fixture();await db.execute(sql`create table termination_restrict_test (company uuid references companies(id))`);
  await db.execute(sql`insert into termination_restrict_test values(${target}::uuid)`);
  await expect(purgeCompanyRows(db,target)).rejects.toThrow();
  expect(await db.select().from(issues).where(eq(issues.companyId,target))).toHaveLength(1);
  await db.execute(sql`drop table termination_restrict_test`);
 });
 it('requires active owner/admin membership',async()=>{
  const target=await fixture(),userId=randomUUID();
  await expect(assertTerminationOwner(db,target,userId)).rejects.toMatchObject({status:403});
  await db.insert(companyMemberships).values({companyId:target,principalType:'user',principalId:userId,membershipRole:'viewer'});
  await expect(assertTerminationOwner(db,target,userId)).rejects.toMatchObject({status:403});
  await db.update(companyMemberships).set({membershipRole:'owner'}).where(eq(companyMemberships.principalId,userId));
  await expect(assertTerminationOwner(db,target,userId)).resolves.toBeUndefined();
 });
 it('removes managed files without touching a neighboring organization directory',async()=>{
  const target=await fixture(), other=await fixture();
  const root=await mkdtemp(path.join(os.tmpdir(),'termination-files-'));
  const [agent]=await db.select().from(agents).where(eq(agents.companyId,target));
  const targetFile=path.join(root,'companies',target,'file');
  const keepFile=path.join(root,'companies',other,'file');
  for(const file of [targetFile,keepFile]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,'fixture');}
  vi.spyOn(home,'resolveWHOXOSInstanceRoot').mockReturnValue(root);
  vi.spyOn(home,'resolveDefaultAgentWorkspaceDir').mockImplementation(id=>path.join(root,'workspaces',id));
  vi.spyOn(storageModule,'getStorageService').mockReturnValue({provider:'local_disk',deleteObject:vi.fn()} as unknown as ReturnType<typeof storageModule.getStorageService>);
  vi.spyOn(configModule,'loadConfig').mockReturnValue({storageLocalDiskBaseDir:path.join(root,'storage')} as ReturnType<typeof configModule.loadConfig>);
  try {
   await expect(terminateCompanyData(db,target)).rejects.toMatchObject({status:422});
   await db.update(companies).set({status:'archived'}).where(eq(companies.id,target));
   await terminateCompanyData(db,target);
   await expect(access(targetFile)).rejects.toThrow();
   await expect(access(keepFile)).resolves.toBeUndefined();
   expect(await db.select().from(companies).where(eq(companies.id,target))).toHaveLength(0);
  } finally {vi.restoreAllMocks();await rm(root,{recursive:true,force:true});}
 });

 it('purges a normally provisioned organization including built-in agents and environments',async()=>{
  const c=await companyService(db).create({name:'Disposable full fixture'});
  await purgeCompanyRows(db,c.id);
  expect(await db.select().from(companies).where(eq(companies.id,c.id))).toHaveLength(0);
  expect(await db.select().from(agents).where(eq(agents.companyId,c.id))).toHaveLength(0);
 });

 it('protects the pinned main organization through every deletion entry point before side effects',async()=>{
  await db.insert(companies).values({id:PROTECTED_ORGANIZATION_ID,name:'Renamed main organization',issuePrefix:'PROTECTED'});
  const userId=randomUUID();
  await db.insert(companyMemberships).values({companyId:PROTECTED_ORGANIZATION_ID,principalType:'user',principalId:userId,membershipRole:'owner'});
  for(const operation of [
    ()=>assertTerminationOwner(db,PROTECTED_ORGANIZATION_ID,userId),
    ()=>terminateCompanyData(db,PROTECTED_ORGANIZATION_ID),
    ()=>purgeCompanyRows(db,PROTECTED_ORGANIZATION_ID),
    ()=>companyService(db).remove(PROTECTED_ORGANIZATION_ID),
  ]) await expect(operation()).rejects.toMatchObject({status:403});
  const [main]=await db.select().from(companies).where(eq(companies.id,PROTECTED_ORGANIZATION_ID));
  expect(main.status).toBe('active');
  const other=await companyService(db).create({name:'WHOXOS'});
  await purgeCompanyRows(db,other.id);
  expect(await db.select().from(companies).where(eq(companies.id,other.id))).toHaveLength(0);
 });

});
