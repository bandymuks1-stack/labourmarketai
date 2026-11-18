import "server-only";

import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { actsAsAgency } from "@/lib/company/agency-capability";

/**
 * `actsAsAgency` for a company the caller already read: its type, plus the
 * organization's declared roles (RLS-read; an unreadable list is "none").
 * A capability answer only — the caller's own membership gate still decides
 * whether they may act.
 */
export async function readActsAsAgency(
  companyType: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<boolean> {
  if (companyType === "staffing_agency") return true;
  if (!organizationId) return false;
  return actsAsAgency(companyType, await readOrganizationCapabilities(organizationId));
}
