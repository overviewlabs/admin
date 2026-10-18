import {
  extractCompanyPrefixFromPath,
  normalizeCompanyPrefix,
  toCompanyRelativePath,
} from "./company-routes";

const GLOBAL_SEGMENTS = new Set(["admin", "instance", "auth", "invite", "board-claim", "cli-auth", "docs"]);
const STORAGE_KEY = "whoxos.companyPaths";

export function getCompanyPaths(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string"));
    }
  } catch {
    // Navigation must work even when browser storage is unavailable or corrupt.
  }
  return {};
}

export function saveCompanyPath(companyId: string, path: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getCompanyPaths(), [companyId]: path }));
  } catch {
    // A storage failure must not interrupt organization switching.
  }
}

export function getCompanySwitchPath(company: { id: string; issuePrefix: string }): string {
  const path = sanitizeRememberedPathForCompany({
    path: getCompanyPaths()[company.id],
    companyPrefix: company.issuePrefix,
  });
  return `/${company.issuePrefix}${path}`;
}

export function isRememberableCompanyPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  const pathname = path.split(/[?#]/)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  const [root] = segments;
  if (GLOBAL_SEGMENTS.has(root!.toLowerCase())) return false;
  return true;
}

function findCompanyByPrefix<T extends { id: string; issuePrefix: string }>(params: {
  companies: T[];
  companyPrefix: string;
}): T | null {
  const normalizedPrefix = normalizeCompanyPrefix(params.companyPrefix);
  return params.companies.find((company) => normalizeCompanyPrefix(company.issuePrefix) === normalizedPrefix) ?? null;
}

export function getRememberedPathOwnerCompanyId<T extends { id: string; issuePrefix: string }>(params: {
  companies: T[];
  pathname: string;
  fallbackCompanyId: string | null;
}): string | null {
  const routeCompanyPrefix = extractCompanyPrefixFromPath(params.pathname);
  if (!routeCompanyPrefix) {
    return params.fallbackCompanyId;
  }

  return findCompanyByPrefix({
    companies: params.companies,
    companyPrefix: routeCompanyPrefix,
  })?.id ?? null;
}

export function sanitizeRememberedPathForCompany(params: {
  path: string | null | undefined;
  companyPrefix: string;
}): string {
  const storedPrefix = params.path ? extractCompanyPrefixFromPath(params.path.split(/[?#]/)[0]!) : null;
  if (storedPrefix && storedPrefix !== normalizeCompanyPrefix(params.companyPrefix)) {
    return "/dashboard";
  }
  const relativePath = params.path ? toCompanyRelativePath(params.path) : "/dashboard";
  if (!isRememberableCompanyPath(relativePath)) {
    return "/dashboard";
  }

  const pathname = relativePath.split("?")[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const [root, entityId] = segments;
  if (root === "issues" && entityId) {
    const identifierMatch = /^([A-Za-z]+)-\d+$/.exec(entityId);
    if (
      identifierMatch &&
      normalizeCompanyPrefix(identifierMatch[1] ?? "") !== normalizeCompanyPrefix(params.companyPrefix)
    ) {
      return "/dashboard";
    }
  }

  return relativePath;
}
