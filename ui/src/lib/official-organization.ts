// Deployment identity, never derived from an editable organization name.
export const OFFICIAL_ORGANIZATION_ID = "79255634-54f2-4a25-b72f-19f2808ad251";
export function officialOrganizationFirst<T extends { id: string }>(companies: T[]): T[] {
  return [...companies].sort((a, b) => Number(b.id === OFFICIAL_ORGANIZATION_ID) - Number(a.id === OFFICIAL_ORGANIZATION_ID));
}
