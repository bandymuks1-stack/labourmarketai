/**
 * NAV / ARBEIDSPLASSEN.NO (`pam-stilling-feed`) PAYLOAD PARSER — SCAFFOLD.
 *
 * The one Norway-specific module. Everything a NAV ad's JSON shape implies is
 * confined here; the shared pipeline never learns that Norway exists.
 *
 * ── HONESTY NOTICE — READ BEFORE TRUSTING ANY FIELD BELOW ──────────────────
 * This parser was written on 2026-09-22 from the research matrix
 * (docs/research/eu-vacancy-source-matrix-2026-08-18.md §3), which records
 * the feed's DOCUMENTED field families (title, description, employment type,
 * occupation categories, position count, publication/expiry, application
 * URL, employer name + organisasjonsnummer, work address to municipality).
 * The feed itself has NEVER been called from this codebase, and no sample
 * payload exists in the repository. Every JSON key name in `NAV_FIELD_MAP`
 * is therefore ASSUMED — a best reading of the public docs, not a verified
 * contract — and MUST be re-verified against a real page captured under an
 * owner-provisioned token as the first step of
 * docs/human-gates/nav-activation-gate.md. Until then this parser is
 * exercised only by fixtures that mirror the same assumptions.
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
  externalId: { keys: ["uuid", "id"], assumed: true },
  status: { keys: ["status"], assumed: true },
  title: { keys: ["title"], assumed: true },
  description: { keys: ["description"], assumed: true },
  publishedAt: { keys: ["published"], assumed: true },
  expiresAt: { keys: ["expires"], assumed: true },
  startDate: { keys: ["starttime"], assumed: true },
  positions: { keys: ["positioncount"], assumed: true },
  employmentType: { keys: ["employmentType"], assumed: true },
  workingTime: { keys: ["extent"], assumed: true },
  employer: {
    keys: ["employer.name", "employer.orgnr", "employer.homepage"],
    assumed: true,
  },
  location: {
    keys: [
      "workLocations[0].country",
      "workLocations[0].county",
      "workLocations[0].municipal",
    ],
    assumed: true,
  },
  occupation: {
    keys: ["categoryList[0].name", "categoryList[0].categoryType", "categoryList[0].code"],
    assumed: true,
  },
  applicationUrl: { keys: ["applicationUrl", "sourceurl"], assumed: true },
  /** Feed page wrapper: where the ads sit and where the next token is. */
  page: { keys: ["items", "items[].ad_content", "next_id"], assumed: true },
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
  const removed = status !== null && INACTIVE_STATUS.test(status);

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
  const transformVersion = provider?.transformVersion ?? "vacancy-nav-v0-scaffold";
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
  const category = firstRecord(ad, "categoryList");
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
    employmentForm: normalizeNorwegianEmploymentForm(field(ad, "employmentType")),
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
