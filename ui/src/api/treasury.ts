import type { TreasurySettings, TreasuryLimits } from "@whoxos/shared";
import { api } from "./client";
export const treasuryApi = {
  settings: (companyId: string) => api.get<TreasurySettings>(`/companies/${companyId}/treasury/settings`, { cache: "no-store" }),
  save: (companyId: string, limits: TreasuryLimits, expectedRevision: string | null) =>
    api.put<TreasurySettings>(`/companies/${companyId}/treasury/settings`, { limits, expectedRevision }),
};
