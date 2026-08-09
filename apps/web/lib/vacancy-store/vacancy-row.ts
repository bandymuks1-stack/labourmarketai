/**
 * VACANCY ROW MAPPING — the pure boundary between the canonical record
 * (`PublicVacancyV1`) and the `public_vacancies` table.
 *
 * WHY THIS IS ITS OWN PURE MODULE. Field mapping is where a persistence layer
 * actually goes wrong: a column silently left null, a publisher fact written
 * into a derived field, a withdrawal stored as if it were live. None of those
 * need a database to catch — they need a test. Keeping the mapping pure (no
 * IO, no env, no clock) means every one of those failure modes is provable in
 * a unit test, and the repository around it is left with nothing but the three
 * statements it genuinely needs a connection for.
 *
 * The clock is a PARAMETER, never `Date.now()`. Two runs over the same input
 * must produce byte-identical rows, otherwise "did this ad change?" stops
 * being answerable.
 */
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";

/**
 * One row of `public_vacancies`, exactly as the table declares it. Written as
 * an explicit interface rather than a generated type so that a column added to
 * the migration without a mapping here is a TYPE ERROR rather than a null.
 */
export interface PublicVacancyRowV1 {
  readonly provider_key: string;
  readonly external_id: string;
  readonly content_hash: string;
  readonly channel: string;
  readonly lifecycle: string;

  readonly title_raw: string;
  readonly description_raw: string;
  readonly source_language: string;

  readonly employer_name: string | null;
  readonly employer_external_org_id: string | null;
  readonly employer_homepage: string | null;

  readonly country: string;
  readonly region: string | null;
  readonly city: string | null;
  readonly lat: number | null;
  readonly lng: number | null;

  readonly compensation_currency: string | null;
  readonly compensation_min: number | null;
  readonly compensation_max: number | null;
  readonly compensation_description: string | null;

  readonly employment_form: string;
  readonly working_time: string;
  readonly positions: number | null;

  readonly start_date: string | null;
  readonly published_at: string;
  readonly expires_at: string | null;
  readonly captured_at: string;

  readonly occupation_raw: string | null;
  readonly occupation_concept_id: string | null;

  readonly profession_slug: string | null;
  readonly skill_slugs: readonly string[];
  readonly categorization_origin: string;

  readonly required_languages: readonly string[];

  readonly application_url: string | null;
  readonly attribution_code: string;

  readonly translation_target_language: string | null;
  readonly translation_status: string | null;
  readonly translation_title_text: string | null;
  readonly translation_description_text: string | null;
  readonly translation_provider: string | null;

  readonly transform_version: string;
  readonly request_ref: string;
  readonly import_session_id: string | null;

  /**
   * OUR store's liveness, derived from the publisher's own lifecycle and
   * nothing else. A `removed` delta deactivates the row rather than deleting
   * it, so an ad the publisher re-posts can be reactivated and the accounting
   * stays auditable.
   *
   * Expiry is deliberately NOT folded in here. `expires_at` is a fact with a
   * timestamp; whether it has passed is a question about *now*, and baking the
   * answer into a stored boolean at write time makes the row wrong the moment
   * the clock moves. The read layer filters on `expires_at` instead.
   */
  readonly is_active: boolean;

  readonly last_seen_at: string;
  readonly updated_at: string;
}

/**
 * Canonical record -> table row. Pure. `seenAt` is the caller's capture clock.
 *
 * `importSessionId` is the runner's session — a RUN fact, not a vacancy fact,
 * which is why it arrives as a parameter instead of widening the pure
 * `PublicVacancyV1` contract. It is required (not defaulted) so a caller that
 * has no session must SAY null; a silent default is how 87 production rows
 * once landed with the column empty.
 *
 * A `links`-channel record legitimately has an empty description: that feed
 * carries identity, employer, location and a canonical URL but no body. The
 * empty string is stored as-is rather than as null, matching the contract's
 * own `descriptionRaw: string` and the table's `not null default ''`.
 */
export function toPublicVacancyRow(
  vacancy: PublicVacancyV1,
  seenAt: string,
  importSessionId: string | null,
): PublicVacancyRowV1 {
  return {
    provider_key: vacancy.providerKey,
    external_id: vacancy.externalId,
    content_hash: vacancy.contentHash,
    channel: vacancy.channel,
    lifecycle: vacancy.lifecycle,

    title_raw: vacancy.titleRaw,
    description_raw: vacancy.descriptionRaw,
    source_language: vacancy.sourceLanguage,

    employer_name: vacancy.employer.name,
    employer_external_org_id: vacancy.employer.externalOrgId,
    employer_homepage: vacancy.employer.homepage,

    country: vacancy.location.country,
    region: vacancy.location.region,
    city: vacancy.location.city,
    lat: vacancy.location.lat,
    lng: vacancy.location.lng,

    compensation_currency: vacancy.compensation.currency,
    compensation_min: vacancy.compensation.min,
    compensation_max: vacancy.compensation.max,
    compensation_description: vacancy.compensation.description,

    employment_form: vacancy.employmentForm,
    working_time: vacancy.workingTime,
    positions: vacancy.positions,

    start_date: vacancy.startDate,
    published_at: vacancy.publishedAt,
    expires_at: vacancy.expiresAt,
    captured_at: vacancy.capturedAt,

    occupation_raw: vacancy.occupationRaw,
    occupation_concept_id: vacancy.occupationConceptId,

    profession_slug: vacancy.professionSlug,
    skill_slugs: vacancy.skillSlugs,
    categorization_origin: vacancy.categorizationOrigin,

    required_languages: vacancy.requiredLanguages,

    application_url: vacancy.applicationUrl,
    attribution_code: vacancy.attributionCode,

    // A translation the service never produced is stored as the status it
    // actually returned, with null text. The pipeline never echoes the
    // original into the translated field — an untranslated ad must be
    // distinguishable from a translated one.
    translation_target_language: vacancy.translation?.targetLanguage ?? null,
    translation_status: vacancy.translation?.status ?? null,
    translation_title_text: vacancy.translation?.titleText ?? null,
    translation_description_text: vacancy.translation?.descriptionText ?? null,
    translation_provider: vacancy.translation?.provider ?? null,

    transform_version: vacancy.transformVersion,
    request_ref: vacancy.requestRef,
    import_session_id: importSessionId,

    is_active: vacancy.lifecycle === "published",

    last_seen_at: seenAt,
    updated_at: seenAt,
  };
}

/** The natural key, as one string. Used to partition a batch against what is
 *  already stored without a second round trip per record. The separator is a
 *  NUL, which neither half can contain — written as an escape, because a raw
 *  NUL byte in the source makes ripgrep treat the whole file as binary and
 *  silently drop it from every code search. */
export function vacancyRowKey(providerKey: string, externalId: string): string {
  return `${providerKey}\u0000${externalId}`;
}
