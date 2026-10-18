import { describe, expect, it } from "vitest";
import {
  getRememberedPathOwnerCompanyId,
  sanitizeRememberedPathForCompany,
  isRememberableCompanyPath,
} from "../lib/company-page-memory";

const companies = [
  { id: "for", issuePrefix: "FOR" },
  { id: "pap", issuePrefix: "PAP" },
];

describe("getRememberedPathOwnerCompanyId", () => {
  it("uses the route company instead of stale selected-company state for prefixed routes", () => {
    expect(
      getRememberedPathOwnerCompanyId({
        companies,
        pathname: "/FOR/issues/FOR-1",
        fallbackCompanyId: "pap",
      }),
    ).toBe("for");
  });

  it("skips saving when a prefixed route cannot yet be resolved to a known company", () => {
    expect(
      getRememberedPathOwnerCompanyId({
        companies: [],
        pathname: "/FOR/issues/FOR-1",
        fallbackCompanyId: "pap",
      }),
    ).toBeNull();
  });

  it("falls back to the previous company for unprefixed board routes", () => {
    expect(
      getRememberedPathOwnerCompanyId({
        companies,
        pathname: "/dashboard",
        fallbackCompanyId: "pap",
      }),
    ).toBe("pap");
  });

  it("treats unprefixed skills routes as board routes instead of company prefixes", () => {
    expect(
      getRememberedPathOwnerCompanyId({
        companies,
        pathname: "/skills/skill-123/files/SKILL.md",
        fallbackCompanyId: "pap",
      }),
    ).toBe("pap");
  });
});

describe("sanitizeRememberedPathForCompany", () => {
  it.each(["/admin", "/admin?view=monitor", "/admin/settings/models", "/PAP/admin", "/instance/settings", "/FOR/projects", "//external.example/path", "https://external.example/path"])("rejects an Admin, global or foreign destination: %s", (path) => {
    expect(sanitizeRememberedPathForCompany({ path, companyPrefix: "PAP" })).toBe("/dashboard");
  });

  it("retains a saved prefix only when it belongs to the clicked organization", () => {
    expect(sanitizeRememberedPathForCompany({ path: "/PAP/projects?tab=all", companyPrefix: "PAP" })).toBe("/projects?tab=all");
  });

  it("does not remember Admin pages as organization pages", () => {
    expect(isRememberableCompanyPath("/admin/settings/models")).toBe(false);
    expect(isRememberableCompanyPath("/admin?view=monitor")).toBe(false);
  });
  it("keeps remembered issue paths that belong to the target company", () => {
    expect(
      sanitizeRememberedPathForCompany({
        path: "/issues/PAP-12",
        companyPrefix: "PAP",
      }),
    ).toBe("/issues/PAP-12");
  });

  it("falls back to dashboard for remembered issue identifiers from another company", () => {
    expect(
      sanitizeRememberedPathForCompany({
        path: "/issues/FOR-1",
        companyPrefix: "PAP",
      }),
    ).toBe("/dashboard");
  });

  it("falls back to dashboard when no remembered path exists", () => {
    expect(
      sanitizeRememberedPathForCompany({
        path: null,
        companyPrefix: "PAP",
      }),
    ).toBe("/dashboard");
  });

  it("keeps remembered skills paths intact for the target company", () => {
    expect(
      sanitizeRememberedPathForCompany({
        path: "/skills/skill-123/files/SKILL.md",
        companyPrefix: "PAP",
      }),
    ).toBe("/skills/skill-123/files/SKILL.md");
  });
});
