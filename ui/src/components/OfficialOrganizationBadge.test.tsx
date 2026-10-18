// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OfficialOrganizationBadge } from "./OfficialOrganizationBadge";
import { OFFICIAL_ORGANIZATION_ID, officialOrganizationFirst } from "@/lib/official-organization";
afterEach(cleanup);
it("marks only the pinned official organization", () => {
 const { rerender } = render(<OfficialOrganizationBadge companyId={OFFICIAL_ORGANIZATION_ID} />);
 expect(screen.getByLabelText("Official WHOXOS, main organization")).toBeTruthy();
 rerender(<OfficialOrganizationBadge companyId="another-org" />);
 expect(screen.queryByLabelText("Official WHOXOS, main organization")).toBeNull();
});
it("pins the main organization without changing other organizations' order", () => {
 const input=[{id:'b'},{id:OFFICIAL_ORGANIZATION_ID},{id:'a'}];
 expect(officialOrganizationFirst(input).map(c=>c.id)).toEqual([OFFICIAL_ORGANIZATION_ID,'b','a']);
 expect(input[0].id).toBe('b');
});
