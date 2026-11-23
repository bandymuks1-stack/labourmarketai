import { getTranslations } from "next-intl/server";

import {
  loadOrganizationDoors,
  organizationDoorLabelKey,
  ORGANIZATION_DOOR_ROUTES,
} from "@/lib/company/organization-doors";
import {
  OrganizationDoors,
  type OrganizationDoorItem,
} from "@/components/app/organization/organization-doors";

/**
 * Server half of the organization doors: resolves WHICH doors this
 * organization has (request-cached) and their labels in the active locale,
 * then hands a plain list to the client strip. Rendered by the company
 * layout and by the manager branch of `/dashboard/projects`.
 */
export async function OrganizationDoorsServer({
  ariaLabel,
  className,
}: {
  ariaLabel: string;
  className?: string;
}) {
  const [state, t, tAll] = await Promise.all([
    loadOrganizationDoors(),
    getTranslations("organizationDoors"),
    getTranslations(),
  ]);
  if (state.organizationId === null) return null;
  // SEP-4 (DEMAND ≠ SUPPLY): a staffing agency's intake declares what it
  // OFFERS (`agency_offer`), so its door is named for supply, not for need.
  const doors: OrganizationDoorItem[] = state.doors.map((id) => ({
    id,
    href: ORGANIZATION_DOOR_ROUTES[id],
    // One label key per route, shared with the header's areas (spec N7).
    label: id === "needs" && state.isStaffingAgency ? t("needsAgency") : tAll(organizationDoorLabelKey(id)),
  }));
  return (
    <OrganizationDoors
      doors={doors}
      ariaLabel={ariaLabel}
      swipeHint={tAll("siteNav.nav.swipe")}
      prevLabel={tAll("common.nav.previous")}
      nextLabel={tAll("common.nav.next")}
      className={className}
    />
  );
}
