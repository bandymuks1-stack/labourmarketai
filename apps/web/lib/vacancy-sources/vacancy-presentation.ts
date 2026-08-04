/**
 * VACANCY PRESENTATION CONTRACT — the rule that an imported vacancy is an
 * OPPORTUNITY, not a second product.
 *
 * The failure mode this module exists to prevent: a source integration
 * quietly grows its own card, its own field order, its own ranking and its
 * own "external jobs" section, and six months later the platform has two
 * marketplaces that disagree. Nothing here renders anything. It produces the
 * SAME canonical fields a directly-created labourmarket.ai opportunity
 * carries, plus a truthful provenance block, so a single card component can
 * render both and there is nothing for a second one to do.
 *
 * WHAT MAY DIFFER between an imported and a direct opportunity: only
 * provenance and management state — where it came from, and whether the
 * employer has claimed it here yet. Everything else is the same contract.
 *
 * WHAT THIS MODULE REFUSES TO SAY, ever:
 *   - that the employer is a labourmarket.ai client or partner;
 *   - that the employer approved our reading of their ad;
 *   - that we deliver candidates to them;
 *   - that the vacancy is managed here;
 *   - that we are anyone's official recruitment channel.
 * Those are claims about a relationship that does not exist, and an external
 * public ad never creates one.
 *
 * Pure module: no IO, no env, no fetch, no JSX. i18n CODES only — no user
 * text, and no technical enum ever reaches a screen.
 */
import type { PublicVacancyV1 } from "./vacancy-contract";

/**
 * How the opportunity got here. This is the ONLY axis on which an imported
 * opportunity differs from a direct one.
 */
export type OpportunityOrigin = "direct" | "external_public_source";

/**
 * Whether the employer has taken ownership of this opportunity INSIDE
 * labourmarket.ai. Until they have, we are looking at someone's public ad and
 * must behave like it.
 */
export type OpportunityManagementState = "unclaimed_external" | "claimed";

/**
 * Where a worker's "apply" action must go.
 *   - `source_original` — out to the publisher's own application route. This
 *     is the ONLY correct answer for an unclaimed external vacancy: the
 *     employer never agreed to receive applications through us, and a button
 *     that implies they did would strand the worker.
 *   - `platform_internal` — our own flow. Reserved for direct opportunities
 *     and, later, for external ones after a verified employer claim.
 *   - `unavailable` — the ad carried no usable application route. Honest and
 *     not rare; the alternative is inventing a link.
 */
export type OpportunityApplicationRoute =
  | "source_original"
  | "platform_internal"
  | "unavailable";

export interface OpportunityProvenanceV1 {
  readonly origin: OpportunityOrigin;
  readonly managementState: OpportunityManagementState;
  /** i18n code naming the publisher — rendered, never the provider key. */
  readonly attributionCode: string;
  /** i18n code for the "public external source" explanation shown to users. */
  readonly originNoteCode: string;
  /** i18n code explaining that the employer has not claimed this here yet. */
  readonly managementNoteCode: string;
  readonly applicationRoute: OpportunityApplicationRoute;
  /** The publisher's own application address, when it exists. */
  readonly applicationUrl: string | null;
}

/**
 * The canonical opportunity view. Field-for-field what a direct opportunity
 * carries — deliberately NOT a superset with extra imported-only fields,
 * because an extra field is how a second card is born.
 */
export interface CanonicalOpportunityViewV1 {
  readonly title: string;
  readonly description: string;
  readonly employerName: string | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly professionSlug: string | null;
  readonly skillSlugs: readonly string[];
  readonly languages: readonly string[];
  readonly employmentForm: string;
  readonly workingTime: string;
  readonly positions: number | null;
  readonly startDate: string | null;
  readonly publishedAt: string;
  /** Compensation exactly as published; never converted, never estimated. */
  readonly payCurrency: string | null;
  readonly payMin: number | null;
  readonly payMax: number | null;
  readonly provenance: OpportunityProvenanceV1;
}

/** i18n codes for the provenance copy. Codes, never sentences. */
export const OPPORTUNITY_ORIGIN_NOTE_CODE =
  "vacancySources.provenance.externalPublicSource";
export const OPPORTUNITY_UNCLAIMED_NOTE_CODE =
  "vacancySources.provenance.employerHasNotClaimed";
export const OPPORTUNITY_CLAIMED_NOTE_CODE =
  "vacancySources.provenance.employerManagesHere";

/**
 * Canonical vacancy → canonical opportunity view.
 *
 * `claimed` defaults to false and must be proven by a real verified claim.
 * The claim workflow does not exist yet, so today this is always false — and
 * that is the honest value, not a placeholder.
 */
export function toCanonicalOpportunityView(
  vacancy: PublicVacancyV1,
  options: { readonly employerHasClaimed?: boolean } = {},
): CanonicalOpportunityViewV1 {
  const claimed = options.employerHasClaimed === true;

  // An unclaimed external vacancy ALWAYS routes the worker back to the
  // publisher. There is no configuration that changes this, because the
  // employer has not agreed to anything else.
  const applicationRoute: OpportunityApplicationRoute = claimed
    ? "platform_internal"
    : vacancy.applicationUrl !== null
      ? "source_original"
      : "unavailable";

  return {
    title: vacancy.titleRaw,
    description: vacancy.descriptionRaw,
    employerName: vacancy.employer.name,
    country: vacancy.location.country || null,
    city: vacancy.location.city,
    professionSlug: vacancy.professionSlug,
    skillSlugs: vacancy.skillSlugs,
    languages: vacancy.requiredLanguages,
    employmentForm: vacancy.employmentForm,
    workingTime: vacancy.workingTime,
    positions: vacancy.positions,
    startDate: vacancy.startDate,
    publishedAt: vacancy.publishedAt,
    payCurrency: vacancy.compensation.currency,
    payMin: vacancy.compensation.min,
    payMax: vacancy.compensation.max,
    provenance: {
      origin: "external_public_source",
      managementState: claimed ? "claimed" : "unclaimed_external",
      attributionCode: vacancy.attributionCode,
      originNoteCode: OPPORTUNITY_ORIGIN_NOTE_CODE,
      managementNoteCode: claimed
        ? OPPORTUNITY_CLAIMED_NOTE_CODE
        : OPPORTUNITY_UNCLAIMED_NOTE_CODE,
      applicationRoute,
      applicationUrl: vacancy.applicationUrl,
    },
  };
}

/**
 * Capabilities the product may offer on an opportunity. An unclaimed external
 * vacancy grants NONE of the employer-side ones: there is no inbox to deliver
 * to, no shortlist anyone will read, and no booking anyone agreed to honour.
 * Offering them would be a control that does nothing — the exact "fake
 * control" the doctrine forbids.
 */
export interface OpportunityCapabilitiesV1 {
  readonly canApplyInternally: boolean;
  readonly canShortlistForEmployer: boolean;
  readonly canBookThroughPlatform: boolean;
  readonly canMessageEmployerInbox: boolean;
  readonly mustShowSourceAttribution: boolean;
}

export function opportunityCapabilities(
  provenance: OpportunityProvenanceV1,
): OpportunityCapabilitiesV1 {
  const claimed = provenance.managementState === "claimed";
  const external = provenance.origin === "external_public_source";
  return {
    canApplyInternally: claimed,
    canShortlistForEmployer: claimed,
    canBookThroughPlatform: claimed,
    canMessageEmployerInbox: claimed,
    // Attribution survives a claim: the ad still came from the publisher.
    mustShowSourceAttribution: external,
  };
}
