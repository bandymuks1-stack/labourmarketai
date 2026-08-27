/**
 * WHAT DOES YOUR ORGANIZATION DO? — the human half of organization capabilities.
 *
 * `organization_roles` is live (migration 20260827050000) and until now had no
 * user-facing way to reach it: an education institution could hold the
 * `training_provider` capability in the database and had no screen on which to
 * say so. This module is the vocabulary that closes that gap.
 *
 * ── THE RULE THIS EXISTS TO KEEP ───────────────────────────────────────────
 * The reader is an institution's administrator, not a database author. They
 * must never meet `training_provider`, `workforce_provider`, `role_slug` or
 * `organization_role_types`. They answer one plain question and tick what
 * applies; this module is the only place the two vocabularies meet.
 *
 * ── NOT A SECOND CLASSIFICATION ────────────────────────────────────────────
 * `companies.company_type` (construction / manufacturing / services / …) is a
 * different axis: it says which INDUSTRY an organization is in. This says what
 * it DOES, and unlike the industry it is MANY-valued — a vocational school
 * both trains people and employs them. Do not merge the two: collapsing them
 * would rebuild the single-value trap that
 * ORGANIZATION_ROLE_ORCHESTRATION_V1 exists to forbid.
 *
 * ── ONLY WHAT THE MODEL REALLY SUPPORTS ────────────────────────────────────
 * Every slug below is one of the ten seeded in `organization_role_types`. No
 * capability is invented for UI completeness: "we provide services" has no
 * counterpart in the model, so it is NOT offered rather than faked, and the
 * three platform-partner roles (payroll / logistics / verification) are left
 * out because they are granted by agreement, not self-declared. Offering all
 * ten would be the wall of controls this is meant to avoid.
 *
 * Pure data. No IO, no server-only.
 */
import type { OrganizationRole } from "@/lib/product-gate/organization-roles";

export interface CapabilityChoice {
  /** The stored slug. NEVER rendered to a human. */
  readonly slug: OrganizationRole;
  /** i18n key for the plain-language answer the reader ticks. */
  readonly labelKey: string;
  /** i18n key for the one line that removes any doubt about what it means. */
  readonly hintKey: string;
}

/**
 * The self-declarable capabilities, in the order they are offered.
 *
 * Education leads deliberately. The pilot's first-run user is an institution,
 * and the first thing it needs to be able to say is the thing the product
 * previously had no way to hear.
 */
export const CAPABILITY_CHOICES: readonly CapabilityChoice[] = [
  {
    slug: "training_provider",
    labelKey: "organizationCapabilities.choices.training.label",
    hintKey: "organizationCapabilities.choices.training.hint",
  },
  {
    slug: "employer",
    labelKey: "organizationCapabilities.choices.employer.label",
    hintKey: "organizationCapabilities.choices.employer.hint",
  },
  {
    slug: "workforce_provider",
    labelKey: "organizationCapabilities.choices.workforce.label",
    hintKey: "organizationCapabilities.choices.workforce.hint",
  },
  {
    slug: "recruitment_partner",
    labelKey: "organizationCapabilities.choices.recruitment.label",
    hintKey: "organizationCapabilities.choices.recruitment.hint",
  },
  {
    slug: "project_operator",
    labelKey: "organizationCapabilities.choices.project.label",
    hintKey: "organizationCapabilities.choices.project.hint",
  },
  {
    slug: "client",
    labelKey: "organizationCapabilities.choices.client.label",
    hintKey: "organizationCapabilities.choices.client.hint",
  },
] as const;

/** Slugs a person may declare about their own organization. */
export const SELF_DECLARABLE_CAPABILITIES: readonly OrganizationRole[] =
  CAPABILITY_CHOICES.map((c) => c.slug);

export function isSelfDeclarable(slug: string): boolean {
  return (SELF_DECLARABLE_CAPABILITIES as readonly string[]).includes(slug);
}

/**
 * What the form should offer, given what is already true.
 *
 * `add_organization_role_v1` is ADDITIVE by design — it can grant a capability
 * and never revoke one, because withdrawing a capability has consequences for
 * everyone who relied on it and that decision was deliberately left out of the
 * minimum slice. So the screen must not render an unticked checkbox for
 * something already declared: a control that cannot be turned off must not
 * look like one. Declared capabilities are shown as SETTLED, and only the rest
 * are offered as choices.
 */
export function partitionCapabilities(
  declared: readonly string[],
): {
  readonly settled: readonly CapabilityChoice[];
  readonly offered: readonly CapabilityChoice[];
} {
  const have = new Set(declared);
  return {
    settled: CAPABILITY_CHOICES.filter((c) => have.has(c.slug)),
    offered: CAPABILITY_CHOICES.filter((c) => !have.has(c.slug)),
  };
}
