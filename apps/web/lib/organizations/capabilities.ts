/**
 * WHAT AN ORGANIZATION CAN DO — the multi-capability read layer.
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * `organizations.organization_type` is ONE text column with a closed CHECK
 * (`company | agency | team | other`). An education institution therefore had
 * no honest way to register: it had to call itself a company, or not exist.
 *
 * That column also contradicts doctrine already on record. The binding
 * ORGANIZATION_ROLE_ORCHESTRATION_V1 says one organization holds MANY roles at
 * once, and PLATFORM_DOCTRINE §10 says a taxonomy is a slug registry, "never a
 * hardcoded enum for anything extensible". `lib/product-gate/organization-roles.ts`
 * has recorded the gap since 2026-07-28 (verdict `single_type_directory`).
 *
 * ── WHAT THIS MODULE IS ────────────────────────────────────────────────────
 * The pure read side of the repair. It answers "can this organization act as
 * X?" from the CAPABILITY rows (`organization_roles`), and falls back to the
 * legacy column when those rows are absent.
 *
 * THE FALLBACK IS THE POINT. It lets this ship and behave correctly BEFORE the
 * owner-gated migration is applied, and keeps every organization that predates
 * the migration answering correctly afterwards. There is no flag day and no
 * moment where the product tells a user something false about an organization.
 *
 * ── ONE VOCABULARY, NOT TWO ────────────────────────────────────────────────
 * The role names come from ORGANIZATION_ROLES in
 * `lib/product-gate/organization-roles.ts` — the single owner-locked list.
 * This module imports it and defines no second list (guard:
 * organization-capabilities.test.ts). `training_provider` IS the education
 * role; no new name was invented for the pilot.
 *
 * Pure. No IO, no server-only, no env.
 */
import {
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from "@/lib/product-gate/organization-roles";

/** The legacy single-value column. Kept for compatibility, never extended. */
export type LegacyOrganizationType = "company" | "agency" | "team" | "other";

/**
 * Legacy column → the capability it always implied.
 *
 * Deliberately partial. `team` and `other` map to NOTHING: a brigade is a
 * workforce UNIT, not an orchestration capability, and "other" asserts nothing
 * at all. Inventing a capability for either would be fabricated data about a
 * real organization — the same dishonesty as the missing education type,
 * pointed the other way.
 */
export const LEGACY_TYPE_ROLE: Readonly<
  Partial<Record<LegacyOrganizationType, OrganizationRole>>
> = Object.freeze({
  company: "employer",
  agency: "workforce_provider",
});

/** The education/training capability. Named once, here. */
export const EDUCATION_ROLE: OrganizationRole = "training_provider";

export interface OrganizationCapabilityInput {
  /** Rows from `organization_roles`. Absent/empty ⇒ fall back to the column. */
  readonly roleSlugs?: readonly string[] | null;
  /** `organizations.organization_type`. */
  readonly legacyType?: string | null;
}

/**
 * Every capability this organization holds, de-duplicated and stable-ordered.
 *
 * Explicit rows WIN. Once an organization has declared its capabilities, the
 * legacy column is no longer consulted — otherwise an organization that
 * declared itself a training provider and nothing else would silently keep the
 * `employer` its old column implied.
 */
export function organizationCapabilities(
  input: OrganizationCapabilityInput,
): readonly OrganizationRole[] {
  const declared = (input.roleSlugs ?? []).filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  if (declared.length > 0) return stableUnique(declared);

  const legacy = LEGACY_TYPE_ROLE[input.legacyType as LegacyOrganizationType];
  return legacy ? [legacy] : [];
}

export function hasCapability(
  input: OrganizationCapabilityInput,
  role: OrganizationRole,
): boolean {
  return organizationCapabilities(input).includes(role);
}

/** Can this organization act as an education/training institution? */
export function isEducationInstitution(
  input: OrganizationCapabilityInput,
): boolean {
  return hasCapability(input, EDUCATION_ROLE);
}

/**
 * Is this slug in the owner-locked vocabulary?
 *
 * Note the asymmetry with the DB: the registry table is the runtime authority
 * and rows may be ADDED to it as data (that is the future-proof rule). This
 * function answers the narrower question "is this one of the ten the owner
 * named", which is what product code branching on a role needs.
 */
export function isKnownOrganizationRole(slug: string): boolean {
  return (ORGANIZATION_ROLES as readonly string[]).includes(slug);
}

/** Order-preserving de-duplication — the read order is the display order. */
function stableUnique(slugs: readonly string[]): readonly OrganizationRole[] {
  const seen = new Set<string>();
  const out: OrganizationRole[] = [];
  for (const s of slugs) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s as OrganizationRole);
  }
  return out;
}
