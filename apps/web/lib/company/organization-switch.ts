/**
 * Pure multi-company switching logic (Company Architecture Completion,
 * Sprint v2 §5). Client-safe, no IO — the server resolvers
 * (lib/company/active-organization.ts) and the header switcher both consume
 * these helpers so the "which org is active / is a switcher shown at all"
 * decisions have exactly one implementation.
 *
 * Honesty contract:
 *   - a switcher is offered ONLY when the profile really belongs to MORE
 *     than one organization (a single-company user sees no switcher — no
 *     fake multi-tenancy chrome);
 *   - the active organization is ALWAYS membership-validated: a stored
 *     pointer that no longer matches a membership (org deleted, ownership
 *     transferred, stale value) silently falls back to the first
 *     membership, never to a fabricated org and never to a foreign org.
 *
 * Guard: lib/company/organization-switch.test.ts +
 * lib/guards/company-architecture-v1.test.ts.
 */

export interface SwitchableOrganization {
  readonly id: string;
  /** Human label — display_name, else legal_name (resolved by the reader). */
  readonly name: string;
}

/** A switcher is rendered ONLY for a real multi-company profile. */
export function shouldOfferOrganizationSwitch(
  organizations: readonly SwitchableOrganization[],
): boolean {
  return organizations.length > 1;
}

/**
 * Membership-validated active-organization resolution.
 *
 *   - stored pointer matches a membership → that org;
 *   - stored pointer stale / null → the FIRST membership (readers order by
 *     created_at asc, so this matches the migration backfill's "oldest owned
 *     org" default);
 *   - no memberships → null (an honest "no company yet" — never fabricated).
 */
export function resolveActiveOrganizationId(
  organizations: readonly SwitchableOrganization[],
  storedActiveOrganizationId: string | null,
): string | null {
  if (organizations.length === 0) return null;
  if (
    storedActiveOrganizationId !== null &&
    organizations.some((o) => o.id === storedActiveOrganizationId)
  ) {
    return storedActiveOrganizationId;
  }
  return organizations[0].id;
}
