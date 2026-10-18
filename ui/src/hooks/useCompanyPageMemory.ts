import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { extractCompanyPrefixFromPath, normalizeCompanyPrefix, toCompanyRelativePath } from "../lib/company-routes";
import {
  getRememberedPathOwnerCompanyId,
  isRememberableCompanyPath,
  getCompanySwitchPath,
  saveCompanyPath,
} from "../lib/company-page-memory";

/**
 * Remembers the last visited page per company and navigates to it on company switch.
 * Falls back to /dashboard if no page was previously visited for a company.
 */
export function useCompanyPageMemory() {
  const { companies, selectedCompanyId, selectedCompany, selectionSource, setSelectedCompanyId } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const prevCompanyId = useRef<string | null>(selectedCompanyId);
  const rememberedPathOwnerCompanyId = useMemo(
    () =>
      getRememberedPathOwnerCompanyId({
        companies,
        pathname: location.pathname,
        fallbackCompanyId: prevCompanyId.current,
      }),
    [companies, location.pathname],
  );

  // Save current path for current company on every location change.
  // Uses prevCompanyId ref so we save under the correct company even
  // during the render where selectedCompanyId has already changed.
  const fullPath = location.pathname + location.search;
  useEffect(() => {
    const companyId = rememberedPathOwnerCompanyId;
    const relativePath = toCompanyRelativePath(fullPath);
    if (companyId && isRememberableCompanyPath(relativePath)) {
      saveCompanyPath(companyId, relativePath);
    }
  }, [fullPath, rememberedPathOwnerCompanyId]);

  // Navigate to saved path when company changes
  useEffect(() => {
    if (!selectedCompanyId) return;

    if (
      prevCompanyId.current !== null &&
      selectedCompanyId !== prevCompanyId.current
    ) {
      if (selectionSource === "manual" && selectedCompany) {
        navigate(getCompanySwitchPath(selectedCompany), { replace: true });
        setSelectedCompanyId(selectedCompanyId, { source: "route_sync" });
      }
    } else if (selectionSource === "manual" && selectedCompany
      && extractCompanyPrefixFromPath(location.pathname) === normalizeCompanyPrefix(selectedCompany.issuePrefix)) {
      // A completed manual selection must not suppress later clicks or history navigation.
      setSelectedCompanyId(selectedCompanyId, { source: "route_sync" });
    }
    prevCompanyId.current = selectedCompanyId;
  }, [selectedCompany, selectedCompanyId, selectionSource, navigate, setSelectedCompanyId, location.pathname]);
}
