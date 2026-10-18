import { BadgeCheck } from "lucide-react";
import { OFFICIAL_ORGANIZATION_ID } from "@/lib/official-organization";

export function OfficialOrganizationBadge({ companyId }: { companyId?: string }) {
  if (companyId === "0d8aad87-64f2-4f9c-a92c-94a261e140f7") {
    return <span title="Verified Treasury organization" aria-label="Verified Treasury organization" className="ml-1 inline-flex shrink-0 align-middle">
      <BadgeCheck aria-hidden="true" className="h-4 w-4 fill-(--status-task-icon-in_progress) text-background" />
    </span>;
  }
  if (companyId !== OFFICIAL_ORGANIZATION_ID) return null;
  return <span title="Official WHOXOS · Main organization" aria-label="Official WHOXOS, main organization" className="ml-1 inline-flex shrink-0 align-middle">
    <BadgeCheck aria-hidden="true" className="h-4 w-4 fill-(--official-organization-gold) text-background" />
  </span>;
}
