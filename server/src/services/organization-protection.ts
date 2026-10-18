import { forbidden } from "../errors.js";

// Stable identity: renaming an organization never changes deletion protection.
export const PROTECTED_ORGANIZATION_ID = "79255634-54f2-4a25-b72f-19f2808ad251";
export function assertOrganizationDeletable(companyId: string) {
  if (companyId === PROTECTED_ORGANIZATION_ID) {
    throw forbidden("WHOXOS is the main organization and cannot be terminated or deleted.");
  }
}
