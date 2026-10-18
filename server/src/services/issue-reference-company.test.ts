import { describe, expect, it } from "vitest";
import type { Db } from "@whoxos/db";
import type { Request } from "express";
import { issueReferenceCompanyId } from "./issue-reference-company.js";

function dbWithCompany(id: string | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => id ? [{ id }] : [] }),
      }),
    }),
  } as unknown as Db;
}

function request(route: string, actor: Record<string, unknown>) {
  return {
    actor,
    header: (name: string) => name === "x-whoxos-route" ? route : undefined,
  } as unknown as Request;
}

describe("issueReferenceCompanyId", () => {
  it("uses the organization route to disambiguate TASK numbers", async () => {
    await expect(issueReferenceCompanyId(dbWithCompany("treasury"), request("/TRE/issues/TASK-1", {
      type: "board", companyIds: ["whox", "treasury"],
    }))).resolves.toBe("treasury");
  });

  it("uses an agent's own organization even without a browser route", async () => {
    await expect(issueReferenceCompanyId(dbWithCompany(null), request("", {
      type: "agent", companyId: "whox",
    }))).resolves.toBe("whox");
  });

  it("does not guess when a board user has multiple organizations and no route", async () => {
    await expect(issueReferenceCompanyId(dbWithCompany(null), request("", {
      type: "board", companyIds: ["whox", "treasury"],
    }))).resolves.toBeUndefined();
  });
});
