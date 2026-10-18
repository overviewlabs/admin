import type { Request } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@whoxos/db";
import { companies } from "@whoxos/db";

/** Selects an organization for an ambiguous TASK number; access checks still follow lookup. */
export async function issueReferenceCompanyId(db: Db, req: Request): Promise<string | undefined> {
  if (req.actor.type === "agent") return req.actor.companyId;
  const route = req.header("x-whoxos-route") ?? "";
  const prefix = /^\/([^/?#]+)\//.exec(route)?.[1];
  if (prefix) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.issuePrefix, prefix.toUpperCase()))
      .limit(1);
    if (company) return company.id;
  }
  if (req.actor.type === "board" && req.actor.companyIds?.length === 1) {
    return req.actor.companyIds[0];
  }
  return undefined;
}
