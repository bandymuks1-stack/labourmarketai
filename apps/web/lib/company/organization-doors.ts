import "server-only";
import { cache } from "react";

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { listMyConnectionInvites } from "@/lib/agency/bridge-read";

/**
 * THE ORGANIZATION'S DOORS (owner IA correction 2026-09-16, design/final/03 §2).
 *
 * One request-cached answer to "which doors does THIS organization have":
 * the fixed set (now · people · work · needs · calendar · history · settings)
 * plus the two that depend on what the organization IS or has:
 *
 *   partners   a staffing agency always has a client door; any other
 *              organization gets it only once an agency has invited it, so a
 *              first-visit employer is not shown an empty relationship room;
 *   education  the `training_provider` capability, the SAME axis the company
 *              hub used to decide whether to render the learners/programmes
 *              sections.
 *
 * Every door is an EXISTING canonical route. This module reads; it never
 * decides authority — each door page re-checks its own reads under RLS.
 */
export type OrganizationDoorId =
  | "now"
  | "people"
  | "work"
  | "needs"
  | "calendar"
  | "partners"
  | "education"
  | "history"
  | "settings";

export const ORGANIZATION_DOOR_ROUTES: Readonly<
  Record<OrganizationDoorId, string>
> = {
  now: "/dashboard/company",
  people: "/dashboard/company/people",
  work: "/dashboard/projects",
  needs: "/dashboard/company/needs",
  calendar: "/dashboard/company/planning",
  partners: "/dashboard/company/partners",
  education: "/dashboard/company/education",
  history: "/dashboard/company/history",
  settings: "/dashboard/company/settings",
};

/** The order the strip renders — the organization's operating rhythm, not
 *  the order the code was written in. */
export const ORGANIZATION_DOOR_ORDER: readonly OrganizationDoorId[] = [
  "now",
  "people",
  "work",
  "needs",
  "calendar",
  "partners",
  "education",
  "history",
  "settings",
];

export interface OrganizationDoorsState {
  /** `null` when the caller has no company workspace — the strip renders
   *  nothing and the page shows its own honest setup state. */
  readonly organizationId: string | null;
  readonly isStaffingAgency: boolean;
  readonly hasEducation: boolean;
  readonly hasPartners: boolean;
  readonly doors: readonly OrganizationDoorId[];
}

export const loadOrganizationDoors = cache(
  async function loadOrganizationDoors(): Promise<OrganizationDoorsState> {
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind !== "ok") {
      return {
        organizationId: null,
        isStaffingAgency: false,
        hasEducation: false,
        hasPartners: false,
        doors: [],
      };
    }
    const company = await getOwnedCompanyById(ctx.companyId);
    const isStaffingAgency =
      company.kind === "ok" && company.row?.companyType === "staffing_agency";
    const [capabilities, invites] = await Promise.all([
      readOrganizationCapabilities(ctx.organizationId),
      isStaffingAgency ? null : listMyConnectionInvites(),
    ]);
    const hasEducation = capabilities.includes("training_provider");
    const hasPartners =
      isStaffingAgency ||
      (invites !== null && invites.kind === "ok" && invites.rows.length > 0);
    return {
      organizationId: ctx.organizationId,
      isStaffingAgency,
      hasEducation,
      hasPartners,
      doors: ORGANIZATION_DOOR_ORDER.filter((id) =>
        id === "partners"
          ? hasPartners
          : id === "education"
            ? hasEducation
            : true,
      ),
    };
  },
);
