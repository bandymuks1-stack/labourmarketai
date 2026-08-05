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

/**
 * Workspace context (real-user workflow rebuild W1). A "workspace" is NOT a
 * new module or a second dashboard — it is only the ACTIVE WORK CONTEXT a
 * person is acting in right now: their personal space, or one of the
 * organizations they own / manage / work for. The DB spine already expresses
 * this (organizations + engagement_contexts, doctrine §5.5); these types are
 * the thin client-safe projection of it.
 */
export const PERSONAL_WORKSPACE_ID = "personal";

export type WorkspaceRelationship = "owner" | "manager" | "employee" | "other";

export interface WorkspaceInfo {
  /** Organization id, or PERSONAL_WORKSPACE_ID for the personal space. */
  readonly id: string;
  /** Org display name; empty string for the personal workspace (the client
   *  substitutes the localized "personal space" label — never a fabricated
   *  org name). */
  readonly name: string;
  readonly kind: "personal" | "organization";
  readonly organizationType?: "company" | "agency" | "team" | "other";
  readonly relationship?: WorkspaceRelationship;
  /** Stable accent hue index (0..WORKSPACE_ACCENT_COUNT-1) derived from the
   *  org id — the SAME org always renders the SAME accent, everywhere. The
   *  hues map onto the EXISTING brand tokens (no new palette). */
  readonly accentIndex: number;
}

/** Number of workspace accent hues — matches the existing brand token set
 *  (blue, cyan, violet, purple, orange) in tokens/colors.ts. */
export const WORKSPACE_ACCENT_COUNT = 5;

/** Deterministic, dependency-free hash → accent index. Pure so the server
 *  resolver and any client code agree without a round trip. */
export function workspaceAccentIndex(organizationId: string): number {
  let h = 0;
  for (let i = 0; i < organizationId.length; i += 1) {
    h = (h * 31 + organizationId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % WORKSPACE_ACCENT_COUNT;
}

/**
 * Membership-validated active-WORKSPACE resolution.
 *
 *   - a stored org pointer that matches a real membership always wins;
 *   - company identity with EXACTLY ONE organization → that organization
 *     (an unambiguous default is not a guess — M-P0-2's "single
 *     unambiguous row" doctrine at the workspace level);
 *   - company identity with SEVERAL organizations and no valid pointer →
 *     the personal workspace, FAIL CLOSED (M-P0-5: the person explicitly
 *     picks in the chip; the old `organizationIds[0]` fallback was exactly
 *     the forbidden first/oldest-organization inference and made a revoked
 *     workspace silently snap to another org);
 *   - person identity with no valid pointer → the personal workspace;
 *   - never a fabricated org, never a foreign org.
 */
export function resolveActiveWorkspaceId(
  identity: "person" | "company" | null,
  organizationIds: readonly string[],
  storedOrganizationId: string | null,
): string {
  if (
    storedOrganizationId !== null &&
    organizationIds.includes(storedOrganizationId)
  ) {
    return storedOrganizationId;
  }
  if (identity === "company" && organizationIds.length === 1) {
    return organizationIds[0];
  }
  return PERSONAL_WORKSPACE_ID;
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
 *   - EXACTLY ONE membership → that org (unambiguous default);
 *   - SEVERAL memberships and a stale/null pointer → null, FAIL CLOSED
 *     (M-P0-5: the surface renders an explicit chooser state — the old
 *     `organizations[0]` fallback silently picked the first/oldest org,
 *     the exact inference the multi-org doctrine forbids);
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
  return organizations.length === 1 ? organizations[0].id : null;
}
