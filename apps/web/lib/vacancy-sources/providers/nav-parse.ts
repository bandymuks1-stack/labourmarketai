/**
 * NAV / ARBEIDSPLASSEN.NO (`pam-stilling-feed`) PAYLOAD PARSER.
 *
 * The one Norway-specific module. Everything a NAV ad's JSON shape implies is
 * confined here; the shared pipeline never learns that Norway exists.
 *
 * ── PROVENANCE OF THE FIELD MAP ────────────────────────────────────────────
 * Verified against a REAL feed on 2026-09-30 (read-only, public token; no
 * payload is stored in the repository). What was observed:
 *   - a feed page: `{ items: [ { url, _feed_entry: { uuid, status, title,
 *     businessName, municipal, sistEndret } } ], next_url, next_id }`;
 *   - a full ad, at the entry's `url`: `{ uuid, sistEndret, status,
 *     ad_content: { published, expires, updated, title, description,
 *     applicationUrl, sourceurl, jobtitle, engagementtype, extent, starttime,
 *     positioncount, sector, employer{name,orgnr,description,homepage},
 *     workLocations[{country,county,municipal,city,postalCode,address}],
 *     categoryList[{categoryType,code,name,score}], contactList[...] } }`.
 * The adapter (two-level fan-out, `vacancy-detail-fanout.ts`) resolves the
 * page into `{ uuid, ad_content, status }` for a live ad and `{ uuid, status,
 * title }` for a withdrawn one BEFORE this parser runs, so the parser sees
 * exactly those two shapes. `status` sits on the wrapper, not on `ad_content`.
 * `contactList` (named persons, e-mail, phone) is NEVER read or stored: the
 * terms forbid contact data for inactive ads and nothing here needs it.
 *
 * What is NOT assumed:
 *   - the parser is TOTAL and DEFENSIVE: an unexpected shape yields a
 *     rejection with a stable reason, a single malformed ad never aborts the
 *     batch, and an unknown key simply reads as "not stated";
 *   - the occupation label is stored VERBATIM in `occupationRaw` and the
 *     publisher's own category code in `occupationConceptId`. No ESCO
 *     concept is invented here — profession/skill slugs come from the ONE
 *     shared deterministic recognizer and are marked `derived`, exactly as
 *     for every other provider;
 *   - the "apply" route prefers the publisher's own application URL and
 *     falls back to the source URL, because NAV's terms require the apply
 *     function to deep-link back to the original system supplier. The
 *     parser never synthesises a URL from an id.
 *
 * Pure module: no IO, no env, no fetch, no Date.now.
 */
import {
  VACANCY_IMPORT_BOUNDS,
  type PublicVacancyV1,
  type VacancyEmploymentForm,
  type VacancyImportChannel,
  type VacancyRejectReason,
} from "../vacancy-contract";
import { computeVacancyContentHash } from "../vacancy-hash";
import {
  clampText,
  normalizeAmount,
  normalizeApplicationUrl,
  normalizeCountryIso,
  normalizeCurrency,
  normalizeDescription,
  normalizeEmploymentForm,
  normalizeHostname,
  normalizeIsoDate,
  normalizeIsoTimestamp,
  normalizeOptionalText,
  normalizePositions,
  normalizeText,
  normalizeTitle,
  normalizeWorkingTime,
} from "../vacancy-normalization";
import { categorizeVacancy } from "../vacancy-categorization";
import { getVacancyProvider } from "../vacancy-provider-registry";

const PROVIDER_KEY = "nav" as const;
/** Norway states compensation in kroner. Used ONLY when a salary number
 *  exists and no currency was stated — never to invent an amount. The feed
 *  is not documented to carry salary numbers at all; this is a guard. */
const DEFAULT_CURRENCY = "NOK";

/**
 * The field map, one row per canonical field, with the assumption status of
 * every key it reads. `assumed: true` means the key name comes from the docs
 * matrix / public documentation and has not been observed on a real payload.
 * Exported so the activation gate can diff it against a captured page.
 */
export const NAV_FIELD_MAP = {
  externalId: { keys: ["uuid"], assumed: false },
  status: { keys: ["status"], assumed: false },
  title: { keys: ["ad_content.title"], assumed: false },
  description: { keys: ["ad_content.description"], assumed: false },
  publishedAt: { keys: ["ad_content.published"], assumed: false },
  expiresAt: { keys: ["ad_content.expires"], assumed: false },
  startDate: { keys: ["ad_content.starttime"], assumed: false },
  positions: { keys: ["ad_content.positioncount"], assumed: false },
  employmentType: { keys: ["ad_content.engagementtype"], assumed: false },
  workingTime: { keys: ["ad_content.extent"], assumed: false },
  employer: {
    keys: ["ad_content.employer.name", "ad_content.employer.orgnr", "ad_content.employer.homepage"],
    assumed: false,
  },
  location: {
    keys: [
      "ad_content.workLocations[0].country",
      "ad_content.workLocations[0].county",
      "ad_content.workLocations[0].municipal",
    ],
    assumed: false,
  },
  occupation: {
    keys: ["ad_content.categoryList[].name", "ad_content.categoryList[].categoryType", "ad_content.categoryList[].code"],
    assumed: false,
  },
  applicationUrl: { keys: ["ad_content.applicationUrl", "ad_content.sourceurl"], assumed: false },
  /** Feed page wrapper: where the entries sit and where the next token is. */
  page: { keys: ["items", "items[]._feed_entry", "items[].url", "next_id"], assumed: false },
} as const;

// ── typed accessors over an unknown payload ─────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function field(source: Record<string, unknown>, key: string): unknown {
  return source[key];
}

function nested(
  source: Record<string, unknown>,
  parentKey: string,
  childKey: string,
): unknown {
  const parent = asRecord(field(source, parentKey));
  return parent === null ? undefined : parent[childKey];
}

/** First element of an array-valued field, as a record, or null. */
function firstRecord(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const list = field(source, key);
  if (!Array.isArray(list) || list.length === 0) return null;
  return asRecord(list[0]);
}

/**
 * ASSUMED withdrawal vocabulary. The docs describe an ad `status` with an
 * active state and one or more inactive states; the exact literals are not
 * observed. Anything that is not clearly active is treated as a withdrawal —
 * the safe direction for a source whose terms require immediate removal.
 */
const INACTIVE_STATUS = /^(inactive|deleted|stopped|rejected|expired|removed)$/i;

/** A live ad must say it is live. `ACTIVE` is the only value NAV publishes for
 *  a live ad (observed alongside `INACTIVE`); anything else — including a
 *  MISSING status — is treated as a withdrawal, the safe direction for a
 *  source whose terms require immediate removal. */
const ACTIVE_STATUS = /^active$/i;

/**
 * The publisher's occupation category: the ESCO-typed one when NAV supplies it
 * (observed: ESCO, JANZZ and STYRK08 entries side by side), otherwise the
 * first entry. The concept id keeps its type so nothing is re-interpreted.
 */
function preferredCategory(ad: Record<string, unknown>): Record<string, unknown> | null {
  const list = field(ad, "categoryList");
  if (!Array.isArray(list)) return null;
  const records = list.map(asRecord).filter((r): r is Record<string, unknown> => r !== null);
  return (
    records.find((r) => String(r.categoryType ?? "").toUpperCase() === "ESCO") ?? records[0] ?? null
  );
}

/**
 * Norwegian employment-form vocabulary (ASSUMED labels — the documented
 * family is "employment type"; the literals are the ones Arbeidsplassen.no
 * displays). Provider vocabulary belongs in the provider module; the shared
 * normalizer is the fallback for anything not matched here.
 */
function normalizeNorwegianEmploymentForm(value: unknown): VacancyEmploymentForm {
  const t = normalizeText(value).toLowerCase();
  if (t.length === 0) return "unknown";
  if (/\bfast\b/.test(t)) return "permanent";
  if (/sesong/.test(t)) return "seasonal";
  if (/vikariat|engasjement|midlertidig|prosjekt|trainee|lærling|laerling/.test(t)) {
    return "temporary";
  }
  if (/selvstendig|oppdrag|frilans/.test(t)) return "assignment";
  return normalizeEmploymentForm(value);
}

// ── result types ────────────────────────────────────────────────────────────

export type NavParseOutcome =
  | { readonly kind: "parsed"; readonly vacancy: PublicVacancyV1 }
  | { readonly kind: "rejected"; readonly reason: VacancyRejectReason };

export interface NavParseRequest {
  /** The decoded feed page — an array of ads, or a page object wrapping one. */
  readonly body: unknown;
  readonly channel: VacancyImportChannel;
  /** ISO timestamp of capture, from the caller's clock. */
  readonly capturedAt: string;
  /** Secret-free reference to the request that produced this body. */
  readonly requestRef: string;
}

export interface NavParseResult {
  readonly ok: boolean;
  readonly bodyReason: "body_not_a_list" | null;
  readonly outcomes: readonly NavParseOutcome[];
}

/**
 * ASSUMED page shape: `{ items: [ { ad_content: {...ad} } | {...ad} ] }`,
 * or a bare array of ads. The ad may sit under `ad_content` (the documented
 * feed-entry wrapper) or be the item itself; both are accepted without
 * guessing at anything else.
 */
function extractItems(body: unknown): readonly unknown[] | null {
  if (Array.isArray(body)) return body;
  const rec = asRecord(body);
  if (rec !== null && Array.isArray(rec.items)) return rec.items;
  return null;
}

function unwrapAd(item: unknown): Record<string, unknown> | null {
  const rec = asRecord(item);
  if (rec === null) return null;
  const content = asRecord(field(rec, "ad_content"));
  if (content !== null) {
    // The wrapper's own status (ACTIVE / INACTIVE) governs when the ad body
    // does not repeat it.
    return content.status === undefined && rec.status !== undefined
      ? { ...content, status: rec.status }
      : content;
  }
  return rec;
}

export function parseNavBatch(req: NavParseRequest): NavParseResult {
  const items = extractItems(req.body);
  if (items === null) {
    return { ok: false, bodyReason: "body_not_a_list", outcomes: [] };
  }
  const outcomes = items.map((item) =>
    parseNavAd({
      item,
      channel: req.channel,
      capturedAt: req.capturedAt,
      requestRef: req.requestRef,
    }),
  );
  return { ok: true, bodyReason: null, outcomes };
}

/** Parse ONE ad. Never throws — an unexpected shape becomes a rejection. */
export function parseNavAd(args: {
  item: unknown;
  channel: VacancyImportChannel;
  capturedAt: string;
  requestRef: string;
}): NavParseOutcome {
  const ad = unwrapAd(args.item);
  if (ad === null) {
    return { kind: "rejected", reason: "payload_not_an_object" };
  }

  const externalId =
    normalizeOptionalText(field(ad, "uuid")) ??
    normalizeOptionalText(field(ad, "id"));
  if (externalId === null) {
    return { kind: "rejected", reason: "missing_external_id" };
  }

  // Lifecycle from the ad status. NAV's terms require an ad removed from
  // NAV to leave our result lists IMMEDIATELY, so anything not clearly
  // active is a withdrawal (`removed` → is_active=false in the store).
  const status = normalizeOptionalText(field(ad, "status"));
  const removed = status === null || INACTIVE_STATUS.test(status) || !ACTIVE_STATUS.test(status);

  const titleRaw = normalizeTitle(field(ad, "title"));
  if (titleRaw.length === 0 && !removed) {
    return { kind: "rejected", reason: "missing_title" };
  }

  const publishedAt = normalizeIsoTimestamp(field(ad, "published"));
  if (publishedAt === null && !removed) {
    return {
      kind: "rejected",
      reason:
        normalizeOptionalText(field(ad, "published")) === null
          ? "missing_published_at"
          : "invalid_published_at",
    };
  }

  const provider = getVacancyProvider(PROVIDER_KEY);
  const sourceLanguage = provider?.sourceLanguage ?? "nb";
  const transformVersion = provider?.transformVersion ?? "vacancy-nav-v1";
  const countryIso = provider?.countryIso ?? "NO";
  const attributionCode =
    provider?.attributionCode ?? "vacancySources.attribution.nav";

  const descriptionRaw = normalizeDescription(field(ad, "description"));

  const workLocation = firstRecord(ad, "workLocations");
  const country = normalizeCountryIso(workLocation?.country) ?? countryIso;

  // Not documented to exist on the feed; read defensively so a stated
  // figure is never dropped, and never invented when absent.
  const salaryMin = normalizeAmount(field(ad, "salary_min"));
  const salaryMax = normalizeAmount(field(ad, "salary_max"));
  const statedCurrency = normalizeCurrency(field(ad, "currency"));
  const hasAmount = salaryMin !== null || salaryMax !== null;

  // Occupation: the publisher's FIRST category, verbatim. NAV categories may
  // be STYRK, JANZZ or ESCO typed; the type and code are kept together as the
  // concept id so nothing is re-interpreted here.
  const category = preferredCategory(ad);
  const occupationRaw = normalizeOptionalText(category?.name);
  const categoryType = normalizeOptionalText(category?.categoryType);
  const categoryCode = normalizeOptionalText(category?.code);
  const occupationConceptId =
    categoryCode === null
      ? null
      : categoryType === null
        ? categoryCode
        : `${categoryType}:${categoryCode}`;

  const categorization = categorizeVacancy({
    titleRaw,
    descriptionRaw,
    occupationRaw,
  });

  const identity = {
    providerKey: PROVIDER_KEY,
    externalId,
    titleRaw,
    descriptionRaw,
    sourceLanguage,
    employer: {
      name: normalizeOptionalText(nested(ad, "employer", "name")),
      // The Norwegian organisasjonsnummer, verbatim. Never a platform id.
      externalOrgId: normalizeOptionalText(nested(ad, "employer", "orgnr")),
      homepage: normalizeHostname(nested(ad, "employer", "homepage")),
    },
    location: {
      country,
      region: normalizeOptionalText(workLocation?.county),
      city: normalizeOptionalText(workLocation?.municipal),
      // The feed is not documented to carry coordinates; none are invented.
      lat: null,
      lng: null,
    },
    compensation: {
      currency: hasAmount ? (statedCurrency ?? DEFAULT_CURRENCY) : statedCurrency,
      min: salaryMin,
      max: salaryMax,
      description: null,
    },
    employmentForm: normalizeNorwegianEmploymentForm(field(ad, "engagementtype")),
    workingTime: normalizeWorkingTime(field(ad, "extent")),
    positions: normalizePositions(field(ad, "positioncount")),
    startDate: normalizeIsoDate(field(ad, "starttime")),
    publishedAt: publishedAt ?? args.capturedAt,
    expiresAt: normalizeIsoTimestamp(field(ad, "expires")),
    transformVersion,
  } as const;

  const vacancy: PublicVacancyV1 = {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: removed ? "removed" : "published",
    channel: args.channel,
    capturedAt: args.capturedAt,
    occupationRaw,
    occupationConceptId,
    professionSlug: categorization.professionSlug,
    skillSlugs: categorization.skillSlugs,
    categorizationOrigin: categorization.origin,
    // Not documented on the feed; never inferred from the text.
    requiredLanguages: [],
    // Deep-link duty: the publisher's own apply route first, the source ad
    // second, never a synthesised address.
    applicationUrl:
      normalizeApplicationUrl(field(ad, "applicationUrl")) ??
      normalizeApplicationUrl(field(ad, "sourceurl")),
    attributionCode,
    translation: null,
    requestRef: clampText(args.requestRef, VACANCY_IMPORT_BOUNDS.maxTitleChars),
  };

  return { kind: "parsed", vacancy };
}
