/**
 * PUBLIC VACANCY CONTRACT v1 — the canonical shape every public employment
 * service vacancy takes once it has crossed into this codebase, whichever
 * country published it.
 *
 * WHY A SEPARATE CONTRACT FROM `IntelligenceObservationV1`:
 *   an observation is a *statistic* (metric + value + window). A vacancy is a
 *   *demand record* (an employer wants N people with these skills, here, from
 *   this date). They share governance (source-governance.ts) and accounting
 *   (import-session.ts) but they are not the same object, and forcing one into
 *   the other would produce a lie in both directions.
 *
 * WHAT THIS IS NOT:
 *   - NOT a second demand model. A canonical vacancy is converted into the
 *     platform's ONE `MatchNeed` by ./vacancy-need.ts — the existing matching
 *     engine (lib/market/match-v1.ts) is never duplicated or forked.
 *   - NOT a job board. An imported vacancy is a clearly-attributed EXTERNAL
 *     record; it never becomes a LabourMarket.ai customer request, and it
 *     never carries a platform employer identity.
 *   - NOT a scraper output. Every field here arrives from an official public
 *     employment service API through the one bounded adapter, and only after
 *     the owner has activated that source in lib/intelligence/source-governance.
 *
 * Pure module: no IO, no env, no fetch, no Date.now. i18n codes only —
 * `titleRaw` / `descriptionRaw` are the publisher's own words, held verbatim
 * and never translated in this layer.
 */

/** ISO-3166 alpha-2 of the country whose public service published the ad. */
export type VacancyCountryIso = string;

/**
 * Stable provider key. It is ALSO the `lib/intelligence/source-governance.ts`
 * registry key for the same source — one governance row per provider, never a
 * second allowlist. Adding a country adds one entry in both places.
 */
export type VacancyProviderKey = "arbetsformedlingen";

/**
 * How the batch reached us. Every public employment service offers some
 * subset of these three, and a provider descriptor declares which it supports:
 *   - `snapshot` — the full current set of live ads, for a cold start or a
 *     periodic reconciliation;
 *   - `stream`   — deltas since a timestamp, for keeping the set fresh;
 *   - `links`    — an aggregated ad-LINK feed (JobTech "JobAd Links" and its
 *     equivalents). A links record carries identity, employer, location and a
 *     canonical URL but typically NO description body. That is honest and
 *     expected: `descriptionRaw` is empty and the record's value is the link.
 */
export type VacancyImportChannel = "snapshot" | "stream" | "links";

/** What the publisher said happened to this ad in a stream delta. */
export type VacancyLifecycle = "published" | "removed";

/** Employment form, normalized to the platform's own closed vocabulary.
 *  `unknown` is honest: the publisher did not say, and we never guess. */
export type VacancyEmploymentForm =
  | "permanent"
  | "temporary"
  | "seasonal"
  | "assignment"
  | "unknown";

/** Working-time extent, normalized. `unknown` = not stated by the publisher. */
export type VacancyWorkingTime = "full_time" | "part_time" | "unknown";

/** Where a canonical field's value came from. `publisher` = stated in the
 *  payload; `derived` = computed by this pipeline from publisher text (and
 *  therefore always labelled as a suggestion downstream, never as fact). */
export type VacancyFieldOrigin = "publisher" | "derived";

/**
 * The translation stage's honest result. The pipeline NEVER translates by
 * itself — it delegates to the platform's ONE translation service
 * (lib/translation/translation-service.ts), which ships with no provider
 * configured and answers `unavailable`. A vacancy therefore keeps the
 * publisher's own words until an owner wires a real provider; it is never
 * shown a machine translation that does not exist.
 */
export interface VacancyTranslationV1 {
  /** Platform locale the translation was requested for. */
  readonly targetLanguage: string;
  /** Verbatim status from the translation service — never re-interpreted. */
  readonly status: "pending" | "unavailable" | "available" | "failed" | "needs_review";
  /** Non-null ONLY when status === "available". Never the original echoed. */
  readonly titleText: string | null;
  readonly descriptionText: string | null;
  /** Which provider produced it, or null when none is configured. */
  readonly provider: string | null;
}

/** Geography as the publisher stated it. Coordinates are carried ONLY when
 *  the publisher supplied them — this pipeline never geocodes (there is no
 *  geocoder in the product, and inventing coordinates is a §7 violation). */
export interface VacancyLocation {
  readonly country: VacancyCountryIso;
  /** Publisher region/county label, verbatim. */
  readonly region: string | null;
  /** Publisher municipality/city label, verbatim. */
  readonly city: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** The publisher's employer identity. NEVER linked to a platform company —
 *  an external employer is an external employer until a human says otherwise. */
export interface VacancyEmployer {
  /** Employer name as published. */
  readonly name: string | null;
  /** Publisher's own organisation number / id, verbatim. Not a platform id. */
  readonly externalOrgId: string | null;
  /** Bare hostname (no scheme) when the publisher supplied a website. This
   *  layer never builds a fetchable URL. */
  readonly homepage: string | null;
}

/** Compensation, only ever as the publisher stated it. No currency
 *  conversion happens here: a SEK figure stays a SEK figure. Converting it to
 *  EUR would require an FX rate this pipeline does not have and must not
 *  invent. */
export interface VacancyCompensation {
  readonly currency: string | null;
  readonly min: number | null;
  readonly max: number | null;
  /** Publisher's own salary description, verbatim. */
  readonly description: string | null;
}

/**
 * The canonical record. Every field is either a verbatim publisher fact or
 * explicitly marked derived. There is no field on this record that the
 * pipeline may fill with a guess.
 */
export interface PublicVacancyV1 {
  /** Registry/governance key of the publishing source. */
  readonly providerKey: VacancyProviderKey;
  /** The publisher's own ad id — stable across snapshot and stream. */
  readonly externalId: string;
  /** Content-addressable identity hash (./vacancy-hash.ts). */
  readonly contentHash: string;
  readonly lifecycle: VacancyLifecycle;
  readonly channel: VacancyImportChannel;

  /** Publisher's headline, verbatim, bounded. */
  readonly titleRaw: string;
  /** Publisher's description, verbatim, bounded. */
  readonly descriptionRaw: string;
  /** BCP-47-ish language code of the publisher text (e.g. "sv"). Declared by
   *  the provider descriptor, never sniffed from the text. */
  readonly sourceLanguage: string;

  readonly employer: VacancyEmployer;
  readonly location: VacancyLocation;
  readonly compensation: VacancyCompensation;

  readonly employmentForm: VacancyEmploymentForm;
  readonly workingTime: VacancyWorkingTime;
  /** Headcount the ad asks for. null = not stated (never defaulted to 1). */
  readonly positions: number | null;
  /** ISO date the work starts, when stated. */
  readonly startDate: string | null;
  /** ISO timestamp the ad was published by the source. */
  readonly publishedAt: string;
  /** ISO timestamp the ad stops being valid, when stated. */
  readonly expiresAt: string | null;
  /** ISO timestamp WE captured it. Supplied by the caller's clock. */
  readonly capturedAt: string;

  /** Publisher occupation label, verbatim (e.g. Swedish SSYK label). */
  readonly occupationRaw: string | null;
  /** Publisher's own occupation taxonomy concept id, verbatim. */
  readonly occupationConceptId: string | null;

  /** Platform profession slug this vacancy maps to, or null when the
   *  categorizer could not recognize one. ALWAYS derived — see
   *  ./vacancy-categorization.ts. Never presented as a publisher fact. */
  readonly professionSlug: string | null;
  /** Platform skill catalogue slugs, derived by the SAME recognition engine
   *  the platform's own demand intake uses. Suggestion-grade by construction. */
  readonly skillSlugs: readonly string[];
  /** Which of the two fields above were derived rather than published. */
  readonly categorizationOrigin: VacancyFieldOrigin;

  /** Language codes the ad requires, when the publisher stated them. */
  readonly requiredLanguages: readonly string[];

  /**
   * The publisher's own canonical ad address, verbatim, when supplied. This
   * is what ATTRIBUTION links to and what "JobAd Links"-style aggregation
   * carries instead of a body. Absent (null) is common and honest — never
   * synthesised from an id.
   */
  readonly applicationUrl: string | null;
  /**
   * i18n code naming the source that must be credited when this record is
   * displayed, taken from the provider descriptor. A record whose provider
   * requires attribution can never be rendered without it — pinned by the
   * boundary guard.
   */
  readonly attributionCode: string;

  /** Translation stage result, or null when no target locale was requested. */
  readonly translation: VacancyTranslationV1 | null;

  /** Import provenance — which run produced this record. */
  readonly transformVersion: string;
  /** Bounded, secret-free reference to the exact request that produced it. */
  readonly requestRef: string;
}

/**
 * Hard bounds every provider inherits. A provider descriptor may tighten
 * these but never loosen them — enforced by ./vacancy-provider-registry.ts.
 */
export const VACANCY_IMPORT_BOUNDS = {
  /** Longest publisher headline kept, in characters. */
  maxTitleChars: 300,
  /** Longest publisher description kept, in characters. */
  maxDescriptionChars: 8_000,
  /** Most canonical records one import session may accept. */
  maxAcceptedPerSession: 5_000,
  /** Most records one adapter page may return. */
  maxItemsPerPage: 100,
  /** Most pages one session may request from one provider. */
  maxPagesPerSession: 50,
  /** Largest single HTTP response body accepted, in bytes. */
  maxResponseBytes: 16 * 1024 * 1024,
  /** Per-request timeout. */
  requestTimeoutMs: 20_000,
  /** Retries on TRANSIENT failure only (never on a 4xx). */
  maxRetries: 2,
  /** Linear backoff step between retries. */
  retryBackoffMs: 1_000,
  /** Most derived skill slugs kept per vacancy. */
  maxDerivedSkills: 24,
  /** Most required-language codes kept per vacancy. */
  maxRequiredLanguages: 8,
} as const;

/** Stable machine reasons a raw item never became a canonical vacancy. */
export type VacancyRejectReason =
  | "missing_external_id"
  | "missing_title"
  | "missing_published_at"
  | "invalid_published_at"
  | "invalid_expires_at"
  | "invalid_start_date"
  | "country_not_in_provider_scope"
  | "payload_not_an_object"
  | "title_too_long_after_bound"
  | "positions_not_positive_integer"
  | "compensation_range_inverted";

/** Stable machine reasons a well-formed candidate was still not accepted. */
export type VacancyGateReason =
  | "unknown_provider"
  | "source_not_activated"
  | "legal_status_unconfirmed"
  | "activation_off"
  | "channel_not_supported"
  | "duplicate"
  | "session_accept_cap";

/** The activation-gated subset: a candidate blocked ONLY by these is a
 *  well-formed vacancy waiting for an owner decision, not a data defect.
 *  Mirrors the Eurostat importer's `validAfterActivation` semantics. */
export const VACANCY_ACTIVATION_GATED_REASONS: ReadonlySet<VacancyGateReason> =
  new Set<VacancyGateReason>([
    "source_not_activated",
    "legal_status_unconfirmed",
    "activation_off",
  ]);

/** True when every reason in the list is an owner-activation gate. */
export function isActivationGatedOnly(
  reasons: readonly VacancyGateReason[],
): boolean {
  return (
    reasons.length > 0 &&
    reasons.every((r) => VACANCY_ACTIVATION_GATED_REASONS.has(r))
  );
}
