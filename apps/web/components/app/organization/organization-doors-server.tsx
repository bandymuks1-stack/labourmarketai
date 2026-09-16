import { getTranslations } from "next-intl/server";

import {
  loadOrganizationDoors,
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
  const [state, t] = await Promise.all([
    loadOrganizationDoors(),
    getTranslations("organizationDoors"),
  ]);
  if (state.organizationId === null) return null;
  // SEP-4 (DEMAND ≠ SUPPLY): a staffing agency's intake declares what it
  // OFFERS (`agency_offer`), so its door is named for supply, not for need.
  const doors: OrganizationDoorItem[] = state.doors.map((id) => ({
    id,
    href: ORGANIZATION_DOOR_ROUTES[id],
    label: id === "needs" && state.isStaffingAgency ? t("needsAgency") : t(id),
  }));
  return (
    <OrganizationDoors
      doors={doors}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
