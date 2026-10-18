import { describe, expect, it, vi } from "vitest";
import { assertCanCreateCompanySecret, assertCanResolveProposal } from "./secret-proposal-authorization.js";

describe("company secret approval authority", () => {
  const companyId = "company-a";

  it("permits an owner or admin to create a company secret", () => {
    for (const membershipRole of ["owner", "admin"]) {
      expect(() => assertCanCreateCompanySecret({
        type: "board", source: "session", memberships: [{ companyId, status: "active", membershipRole }],
      }, companyId)).not.toThrow();
    }
  });

  it("does not let a member or agent create a company secret through a cascaded binding", async () => {
    const member = { type: "board" as const, source: "session" as const,
      memberships: [{ companyId, status: "active", membershipRole: "member" }] };
    expect(() => assertCanCreateCompanySecret(member, companyId)).toThrow("Company admin access required");
    expect(() => assertCanCreateCompanySecret({ type: "agent", companyId }, companyId)).toThrow("Company admin access required");

    const checkAdmin = vi.fn(() => assertCanCreateCompanySecret(member, companyId));
    await expect(assertCanResolveProposal({
      db: {} as never, actor: member, companyId, proposal: { kind: "secret", targetId: null },
      assertSecretDefinitionAdmin: checkAdmin,
    })).rejects.toThrow("Company admin access required");
    expect(checkAdmin).toHaveBeenCalledOnce();
  });
});
