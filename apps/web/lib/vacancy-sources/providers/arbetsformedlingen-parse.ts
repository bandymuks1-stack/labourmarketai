/**
 * ARBETSFÖRMEDLINGEN (JobTech) PAYLOAD PARSER — the ONE provider-specific
 * module. Everything a Swedish ad's JSON shape implies is confined here; the
 * rest of the pipeline never learns that Sweden exists.
 *
 * That confinement IS the "future countries without redesign" guarantee: a
 * second country adds a sibling file plus one registry entry, and touches no
 * shared stage.
 *
 * Shapes handled (all three JobTech channels):
 *   - /snapshot — an array of full ad objects;
 *   - /stream   — an array of the same objects, each with `removed` telling
 *     you whether this delta publishes or withdraws the ad;
 *   - /joblinks — the aggregated JobAd Links feed: identity + employer +
 *     location + a canonical URL, usually with no description body.
 *
 * The parser is TOTAL and DEFENSIVE. Every field is read through a typed
 * accessor, an unexpected shape yields a rejection with a stable reason, and
 * a single malformed ad never aborts the batch. It performs no IO and knows
 * nothing about activation — validation and gating happen downstream.
 *
 * Pure module: no IO, no env, no fetch, no Date.now.
 */
import {
  VACANCY_IMPORT_BOUNDS,
  type PublicVacancyV1,
  type VacancyImportChannel,
  type VacancyRejectReason,
} from "../vacancy-contract";
import { computeVacancyContentHash } from "../vacancy-hash";
import {
  clampText,
  normalizeAmount,
  normalizeApplicationUrl,
  normalizeCoordinate,
  normalizeCountryIso,
  normalizeCurrency,
  normalizeDescription,
  normalizeEmploymentForm,
  normalizeHostname,
  normalizeIsoDate,
  normalizeIsoTimestamp,
  normalizeLanguageList,
  normalizeOptionalText,
  normalizePositions,
  normalizeTitle,
  normalizeWorkingTime,
} from "../vacancy-normalization";
import { categorizeVacancy } from "../vacancy-categorization";
import { getVacancyProvider } from "../vacancy-provider-registry";

const PROVIDER_KEY = "arbetsformedlingen" as const;
/** JobTech states everything in Swedish kronor; ads rarely name the currency
 *  explicitly, so this is the fallback used ONLY when a salary number exists
 *  and no currency was stated. It is never used to invent an amount. */
const DEFAULT_CURRENCY = "SEK";

// ── typed accessors over an unknown payload ─────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function field(source: Record<string, unknown>, key: string): unknown {
  return source[key];
}

/** Read `parent.child` where parent may be absent or not an object. */
function nested(
  source: Record<string, unknown>,
  parentKey: string,
  childKey: string,
): unknown {
  const parent = asRecord(field(source, parentKey));
  return parent === null ? undefined : parent[childKey];
}

/** JobTech expresses several booleans as `{ "value": true }` wrappers. */
function unwrapBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const rec = asRecord(value);
  if (rec !== null && typeof rec.value === "boolean") return rec.value;
  return null;
}

/** JobTech's `must_have.languages` / `nice_to_have.languages` are arrays of
 *  `{ label }` objects; older shapes use bare strings. Both are accepted. */
function languageLabels(source: Record<string, unknown>, group: string): unknown[] {
  const groupRec = asRecord(field(source, group));
  const list = groupRec === null ? undefined : groupRec.languages;
  if (!Array.isArray(list)) return [];
  return list.map((entry) => {
    const rec = asRecord(entry);
    return rec === null ? entry : (rec.label ?? rec.concept_id ?? null);
  });
}

// ── result types ────────────────────────────────────────────────────────────

export type ArbetsformedlingenParseOutcome =
  | { readonly kind: "parsed"; readonly vacancy: PublicVacancyV1 }
  | { readonly kind: "rejected"; readonly reason: VacancyRejectReason };

export interface ArbetsformedlingenParseRequest {
  /** The decoded response body — an array of ads, or an object wrapping one. */
  readonly body: unknown;
  readonly channel: VacancyImportChannel;
  /** ISO timestamp of capture, from the caller's clock. */
  readonly capturedAt: string;
  /** Secret-free reference to the request that produced this body. */
  readonly requestRef: string;
}

export interface ArbetsformedlingenParseResult {
  readonly ok: boolean;
  /** Stable reason when the whole body was unusable. */
  readonly bodyReason: "body_not_a_list" | null;
  readonly outcomes: readonly ArbetsformedlingenParseOutcome[];
}

/**
 * The JobAd Links feed nests its ads under `hits`; snapshot and stream return
 * a bare array. Accept both without guessing at anything else.
 */
function extractItems(body: unknown): readonly unknown[] | null {
  if (Array.isArray(body)) return body;
  const rec = asRecord(body);
  if (rec !== null && Array.isArray(rec.hits)) return rec.hits;
  return null;
}

export function parseArbetsformedlingenBatch(
  req: ArbetsformedlingenParseRequest,
): ArbetsformedlingenParseResult {
  const items = extractItems(req.body);
  if (items === null) {
    return { ok: false, bodyReason: "body_not_a_list", outcomes: [] };
  }
  const outcomes = items.map((item) =>
    parseArbetsformedlingenAd({
      item,
      channel: req.channel,
      capturedAt: req.capturedAt,
      requestRef: req.requestRef,
    }),
  );
  return { ok: true, bodyReason: null, outcomes };
}

/** Parse ONE ad. Never throws — an unexpected shape becomes a rejection. */
export function parseArbetsformedlingenAd(args: {
  item: unknown;
  channel: VacancyImportChannel;
  capturedAt: string;
  requestRef: string;
}): ArbetsformedlingenParseOutcome {
  const ad = asRecord(args.item);
  if (ad === null) {
    return { kind: "rejected", reason: "payload_not_an_object" };
  }

  const externalId = normalizeOptionalText(field(ad, "id"));
  if (externalId === null) {
    return { kind: "rejected", reason: "missing_external_id" };
  }

  // A stream delta marks withdrawal with `removed: true`. A withdrawal
  // legitimately carries almost no other content, so it is parsed on a short
  // path: identity plus lifecycle is all a removal needs to mean anything.
  const removed = unwrapBoolean(field(ad, "removed")) === true;

  const titleRaw = normalizeTitle(field(ad, "headline"));
  if (titleRaw.length === 0 && !removed) {
    return { kind: "rejected", reason: "missing_title" };
  }

  const publishedAt = normalizeIsoTimestamp(field(ad, "publication_date"));
  if (publishedAt === null) {
    // A removal delta may omit the original publication date; the capture
    // time is then the only honest ordering signal we have, and it is
    // recorded as such rather than left blank.
    if (!removed) {
      return {
        kind: "rejected",
        reason:
          normalizeOptionalText(field(ad, "publication_date")) === null
            ? "missing_published_at"
            : "invalid_published_at",
      };
    }
  }

  const provider = getVacancyProvider(PROVIDER_KEY);
  // The descriptor is a code fact; this is a defensive read, not a branch the
  // product can reach with the registry as written.
  const sourceLanguage = provider?.sourceLanguage ?? "sv";
  const transformVersion =
    provider?.transformVersion ?? "vacancy-arbetsformedlingen-v1";
  const countryIso = provider?.countryIso ?? "SE";
  const attributionCode =
    provider?.attributionCode ?? "vacancySources.attribution.arbetsformedlingen";

  const descriptionRaw = normalizeDescription(
    nested(ad, "description", "text") ??
      nested(ad, "description", "text_formatted"),
  );

  // JobTech nests geography under workplace_address; the country is a Swedish
  // label ("Sverige") rather than an ISO code, so the provider's own declared
  // country is authoritative and the payload only refines region/city.
  const address = asRecord(field(ad, "workplace_address"));
  const country =
    normalizeCountryIso(address?.country_code) ?? countryIso;

  const salaryMin = normalizeAmount(field(ad, "salary_min"));
  const salaryMax = normalizeAmount(field(ad, "salary_max"));
  const salaryDescription = normalizeOptionalText(
    field(ad, "salary_description"),
  );
  const statedCurrency = normalizeCurrency(field(ad, "currency"));
  const hasAmount = salaryMin !== null || salaryMax !== null;

  const occupationRaw = normalizeOptionalText(nested(ad, "occupation", "label"));

  const categorization = categorizeVacancy({
    titleRaw,
    descriptionRaw,
    occupationRaw,
  });

  const requiredLanguages = normalizeLanguageList([
    ...languageLabels(ad, "must_have"),
    ...languageLabels(ad, "nice_to_have"),
  ]);

  const identity = {
    providerKey: PROVIDER_KEY,
    externalId,
    titleRaw,
    descriptionRaw,
    sourceLanguage,
    employer: {
      name: normalizeOptionalText(nested(ad, "employer", "name")),
      externalOrgId: normalizeOptionalText(
        nested(ad, "employer", "organization_number"),
      ),
      homepage: normalizeHostname(nested(ad, "employer", "url")),
    },
    location: {
      country,
      region: normalizeOptionalText(address?.region),
      city: normalizeOptionalText(address?.municipality),
      lat: normalizeCoordinate(address?.coordinates_lat, "lat"),
      lng: normalizeCoordinate(address?.coordinates_long, "lng"),
    },
    compensation: {
      // Only claim a currency when there is an amount to denominate.
      currency: hasAmount ? (statedCurrency ?? DEFAULT_CURRENCY) : statedCurrency,
      min: salaryMin,
      max: salaryMax,
      description: salaryDescription,
    },
    employmentForm: normalizeEmploymentForm(
      nested(ad, "employment_type", "label"),
    ),
    workingTime: normalizeWorkingTime(nested(ad, "working_hours_type", "label")),
    positions: normalizePositions(field(ad, "number_of_vacancies")),
    startDate: normalizeIsoDate(field(ad, "access")),
    publishedAt: publishedAt ?? args.capturedAt,
    expiresAt: normalizeIsoTimestamp(field(ad, "application_deadline")),
    transformVersion,
  } as const;

  const vacancy: PublicVacancyV1 = {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: removed ? "removed" : "published",
    channel: args.channel,
    capturedAt: args.capturedAt,
    occupationRaw,
    occupationConceptId: normalizeOptionalText(
      nested(ad, "occupation", "concept_id"),
    ),
    professionSlug: categorization.professionSlug,
    skillSlugs: categorization.skillSlugs,
    categorizationOrigin: categorization.origin,
    requiredLanguages,
    applicationUrl:
      normalizeApplicationUrl(nested(ad, "application_details", "url")) ??
      normalizeApplicationUrl(field(ad, "webpage_url")) ??
      normalizeApplicationUrl(field(ad, "source_links")),
    attributionCode,
    // The translation stage runs in the importer (it may await a provider);
    // a freshly parsed record has not been through it yet, and says so.
    translation: null,
    requestRef: clampText(args.requestRef, VACANCY_IMPORT_BOUNDS.maxTitleChars),
  };

  return { kind: "parsed", vacancy };
}

/** The categorization tier for a parsed ad, recomputed on demand for the
 *  MatchNeed bridge (the stored record keeps slugs, not the tier). */
export function categorizationSourceFor(
  vacancy: PublicVacancyV1,
): ReturnType<typeof categorizeVacancy>["skillSource"] {
  return categorizeVacancy({
    titleRaw: vacancy.titleRaw,
    descriptionRaw: vacancy.descriptionRaw,
    occupationRaw: vacancy.occupationRaw,
  }).skillSource;
}
