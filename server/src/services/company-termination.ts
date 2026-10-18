import { assertOrganizationDeletable } from "./organization-protection.js";
import { and, eq, sql } from "drizzle-orm";
import { agents, assets, companies, companyMemberships, heartbeatRuns, type Db } from "@whoxos/db";
import { rm } from "node:fs/promises";
import path from "node:path";
import { forbidden, notFound, unprocessable } from "../errors.js";
import { resolveWHOXOSInstanceRoot, resolveDefaultAgentWorkspaceDir } from "../home-paths.js";
import { getStorageService } from "../storage/index.js";
import { loadConfig } from "../config.js";
import { callRootExecutor, isProductionRootScope } from "./production-root.js";

/** Delete every company-scoped table, including new feature tables omitted by
 * the legacy fixed delete list. Savepoints allow dependency-order discovery;
 * failure rolls the entire database purge back, never disabling constraints. */
export async function purgeCompanyRows(db: Db, companyId: string) {
  assertOrganizationDeletable(companyId);
  return db.transaction(async tx => {
    const tables = await tx.execute(sql`select table_name from information_schema.columns
      where table_schema='public' and column_name='company_id' order by table_name`);
    const nullableReferences = await tx.execute(sql`select distinct c.relname as table_name, a.attname as column_name
      from pg_constraint f join pg_class c on c.oid=f.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum=any(f.conkey)
      where f.contype='f' and n.nspname='public' and not a.attnotnull and a.attname<>'company_id'
      and exists(select 1 from pg_attribute x where x.attrelid=c.oid and x.attname='company_id')`);
    for (const row of nullableReferences) {
      await tx.execute(sql`update ${sql.identifier(String(row.table_name))} set ${sql.identifier(String(row.column_name))}=null where company_id=${companyId}::uuid`);
    }
    let pending = tables.map(row => String(row.table_name));
    while (pending.length) {
      const retry: string[] = [];
      for (const table of pending) {
        try {
          await tx.transaction(async nested => {
            await nested.execute(sql`delete from ${sql.identifier(table)} where company_id=${companyId}::uuid`);
          });
        } catch (error) {
          const cause = error as { code?: string; cause?: { code?: string } };
          if ((cause.code ?? cause.cause?.code) !== '23503') throw error;
          retry.push(table);
        }
      }
      if (retry.length === pending.length) throw unprocessable("Organization cleanup could not finish. Retry after resolving dependent records.", { tables: retry });
      pending = retry;
    }
    await tx.delete(companies).where(eq(companies.id, companyId));
  });
}

export async function assertTerminationOwner(db: Db, companyId: string, userId: string | null | undefined) {
  assertOrganizationDeletable(companyId);
  if (!userId) throw forbidden("An organization owner must terminate the organization");
  const [membership] = await db.select().from(companyMemberships).where(and(
    eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"),
    eq(companyMemberships.principalId, userId), eq(companyMemberships.status, "active"),
  ));
  if (!membership || !["owner", "admin"].includes(membership.membershipRole ?? "")) throw forbidden("Only organization owners and administrators can terminate it");
}

export async function terminateCompanyData(db: Db, companyId: string) {
  assertOrganizationDeletable(companyId);
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw notFound("Organization not found");
  if (company.status !== "archived") throw unprocessable("Stop the organization before terminating it");
  const running = await db.select({ status: heartbeatRuns.status }).from(heartbeatRuns).where(eq(heartbeatRuns.companyId, companyId));
  if (running.some(r => ["running", "queued"].includes(r.status))) throw unprocessable("Agent work is still stopping. Retry termination shortly.");
  const members = await db.select({ id: agents.id }).from(agents).where(eq(agents.companyId, companyId));
  for (const agent of members.filter(agent => isProductionRootScope(companyId, agent.id))) {
    await callRootExecutor({ operation: "grant", companyId, agentId: agent.id, enabled: false, actorId: "organization-termination" });
  }
  const storage = getStorageService();
  const objects = await db.select().from(assets).where(eq(assets.companyId, companyId));
  for (const object of objects) {
    if (object.provider !== storage.provider) throw unprocessable("An older storage provider must be connected before all organization files can be removed");
    await storage.deleteObject(companyId, object.objectKey);
  }
  const root = resolveWHOXOSInstanceRoot();
  const directories = ["companies", "projects", "skills", "voice-workspaces"].map(dir => path.join(root, dir, companyId));
  directories.push(path.join(process.env.RUN_LOG_BASE_PATH ?? path.join(root, "data", "run-logs"), companyId));
  if (storage.provider === "local_disk") directories.push(path.join(loadConfig().storageLocalDiskBaseDir, companyId));
  for (const agent of members) directories.push(resolveDefaultAgentWorkspaceDir(agent.id));
  // Only platform-owned UUID paths. Never recursively remove agent-supplied cwd,
  // repositories, shared server directories, or third-party accounts.
  for (const directory of directories) await rm(directory, { recursive: true, force: true });
  await purgeCompanyRows(db, companyId);
  return { ok: true as const };
}
