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

/**
 * Does the organization ALSO act as a client (a buyer of people)? An agency by
 * company type only is agency-only; any other type, or one that declared the
 * `employer` role, is a client as well. Capability answer, never authority.
 */
export function actsAsClient(
  companyType: string | null | undefined,
  capabilities: readonly string[],
): boolean {
  return companyType !== "staffing_agency" || capabilities.includes("employer");
}

export type NeedsAudience = "need" | "offer";

/**
 * The /dashboard/company/needs audience (ORG-2). Not an agency -> "need".
 * Agency-only -> "offer" (unchanged). BOTH agency and client (a construction
 * company that also supplies people) -> the person CHOOSES; the default keeps
 * what each organization saw before (type staffing_agency -> offer, any other
 * type -> need). The choice only selects which already-allowed demand kind the
 * wizard submits; it grants nothing.
 */
export function resolveNeedsAudience(input: {
  companyType: string | null | undefined;
  capabilities: readonly string[];
  requested?: string | null;
}): { audience: NeedsAudience; canChoose: boolean } {
  const agency = actsAsAgency(input.companyType, input.capabilities);
  if (!agency) return { audience: "need", canChoose: false };
  const client = actsAsClient(input.companyType, input.capabilities);
  if (!client) return { audience: "offer", canChoose: false };
  const fallback: NeedsAudience = input.companyType === "staffing_agency" ? "offer" : "need";
  const audience: NeedsAudience =
    input.requested === "offer" || input.requested === "need" ? input.requested : fallback;
  return { audience, canChoose: true };
}
