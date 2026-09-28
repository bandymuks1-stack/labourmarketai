/**
 * ONE meaning of "this organization acts as an agency" (owner decision
 * 2026-09-28, AGENCY CAPABILITY CONSISTENCY).
 *
 *   acts as agency = company_type 'staffing_agency'
 *                    OR the organization declared a workforce role
 *                       (workforce_provider / talent_provider / recruitment_partner)
 *
 * Production walk 2026-09-28: QA-SYNTHETIC Gama (a construction company that
 * declared workforce_provider + recruitment_partner) saw "Pakviesti klientą"
 * on Home — Home used the union — while the chat, the partners page and the
 * two SECURITY DEFINER RPCs accepted only company_type, so the invite ended
 * in "not an agency workspace". A construction company may legitimately also
 * provide workforce; its type is not rewritten to satisfy old code.
 *
 * The SQL twin is `public.company_acts_as_agency(uuid)` (migration
 * 20260928180000); both read the same two facts. This is a CAPABILITY rule,
 * never an authorization: membership / ownership / RLS still decide who may
 * act for the organization.
 */
export const AGENCY_CAPABILITY_ROLES = [
  "workforce_provider",
  "talent_provider",
  "recruitment_partner",
] as const;

export function actsAsAgency(
  companyType: string | null | undefined,
  capabilities: readonly string[],
): boolean {
  if (companyType === "staffing_agency") return true;
  return AGENCY_CAPABILITY_ROLES.some((r) => capabilities.includes(r));
}
