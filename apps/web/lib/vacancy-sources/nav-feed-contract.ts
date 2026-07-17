/**
 * NAV (arbeidsplassen.no) STILLING FEED CONTRACT — pure, versioned zod
 * schemas for the official Norwegian public vacancy feed
 * (https://pam-stilling-feed.nav.no, docs: navikt.github.io/pam-stilling-feed).
 *
 * ARCHITECTURE (Official Vacancy Source — NAV Norway v1):
 *   - lib/vacancy-sources is a NEW, SEPARATE module namespace for PER-AD
 *     external vacancy records. It deliberately does NOT live inside
 *     lib/intelligence: market_intelligence_observations is AGGREGATES ONLY
 *     (one sourced dated market DATA POINT — observation-contract.ts), and a
 *     job ad is not an aggregate. The module still follows the intelligence
 *     layer's conventions: PURE (no fetch, no HTTP, no fs, no env), i18n
 *     codes over display strings, fail-closed validation.
 *   - Any HTTP lives in apps/web/scripts/nav-vacancy-*.ts (operator scripts,
 *     eurostat-import.ts precedent) — never in this layer, never in the app.
 *   - Activation is owner-gated through lib/intelligence/source-governance
 *     (key "nav_arbeidsplassen", shipped legalStatus "unconfirmed" +
 *     activation "off" — nothing runs, nothing renders).
 *
 * Schema fidelity: field names/types verified 2026-07-17 against the
 * official OpenAPI (pam-stilling-feed.ekstern.dev.nav.no/api/openapi.json):
 * feed page = { version, title, home_page_url, feed_url, description, id,
 * next_url|null, next_id|null, items: FeedLine[] }; FeedLine = { id, url,
 * title, content_text, date_modified|null, _feed_entry }; _feed_entry =
 * { uuid, status, title, businessName, municipal, sistEndret }; entry detail
 * = { uuid, sistEndret, status, ad_content: FeedAd|null }.
 *
 * MASKING HONOUR: NAV masks fields (title / employer / contacts) on
 * actively-stopped ads. Every maskable field is therefore nullable here —
 * a masked stopped ad must parse, so its deactivation is processed instead
 * of dropped.
 */
import { z } from "zod";

export const NAV_SOURCE_KEY = "nav_arbeidsplassen" as const;

/** Bump on ANY change to schemas/normalization that alters output shape. */
export const NAV_TRANSFORM_VERSION = "nav-vacancy-transform-v1";

/** Attribution string stored on every normalized row (terms: republished
 *  ads must be clearly attributed; the UI badge adds the localized label). */
export const NAV_SOURCE_ATTRIBUTION = "arbeidsplassen.no (NAV)";

/** The ONLY host the operator scripts may ever contact (host-pinned; the
 *  feed's own next_url/item url values must stay on this origin). */
export const NAV_FEED_ORIGIN = "https://pam-stilling-feed.nav.no";

/**
 * Hard bounds for ONE bounded operator session (conservative first-import
 * defaults; NAV publishes no rate limits, so we self-impose polite ones).
 * The feed pages hold ~20–100 items each; 10 pages comfortably covers a
 * bounded first import while maxEntriesPerSession (200) is the true cap.
 */
export const NAV_IMPORT_BOUNDS = {
  maxPagesPerSession: 10,
  maxEntriesPerSession: 200,
  requestTimeoutMs: 15_000,
  maxResponseBytes: 2_000_000,
  minRequestSpacingMs: 1_000,
  /** Sanitized plain-text description cap (bounded storage, never raw HTML). */
  maxDescriptionChars: 8_000,
} as const;

/**
 * Pure paging governor: may the session request ANOTHER page? False as
 * soon as either cap is reached — the scripts must consult this before
 * every request (guard-tested; an unbounded crawl can never ship by
 * accident).
 */
export function shouldContinuePaging(
  state: { pagesFetched: number; entriesSeen: number },
  bounds: {
    maxPagesPerSession: number;
    maxEntriesPerSession: number;
  } = NAV_IMPORT_BOUNDS,
): boolean {
  return (
    state.pagesFetched < bounds.maxPagesPerSession &&
    state.entriesSeen < bounds.maxEntriesPerSession
  );
}

/** ACTIVE | INACTIVE (verbatim NAV enum). Unknown statuses fail closed. */
export const navFeedStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export type NavFeedStatus = z.infer<typeof navFeedStatusSchema>;

/** _feed_entry — the summary NAV embeds in every feed line. Maskable
 *  fields nullable (stopped-ad masking must still parse). */
export const navFeedEntrySummarySchema = z.object({
  uuid: z.string().min(1),
  status: navFeedStatusSchema,
  title: z.string().nullish(),
  businessName: z.string().nullish(),
  municipal: z.string().nullish(),
  sistEndret: z.string().nullish(),
});

/** One feed line (JSON-Feed style item). */
export const navFeedLineSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().nullish(),
  content_text: z.string().nullish(),
  date_modified: z.string().nullish(),
  _feed_entry: navFeedEntrySummarySchema,
});
export type NavFeedLine = z.infer<typeof navFeedLineSchema>;

/** One feed PAGE. next_url/next_id null = end of feed. */
export const navFeedPageSchema = z.object({
  version: z.string().nullish(),
  title: z.string().nullish(),
  home_page_url: z.string().nullish(),
  feed_url: z.string().nullish(),
  description: z.string().nullish(),
  id: z.string().min(1),
  next_url: z.string().nullable(),
  next_id: z.string().nullable(),
  items: z.array(navFeedLineSchema),
});
export type NavFeedPage = z.infer<typeof navFeedPageSchema>;

export const navWorkLocationSchema = z.object({
  country: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  postalCode: z.string().nullish(),
  county: z.string().nullish(),
  municipal: z.string().nullish(),
});

export const navEmployerSchema = z.object({
  name: z.string().nullish(),
  orgnr: z.string().nullish(),
  description: z.string().nullish(),
  homepage: z.string().nullish(),
});

/**
 * contactList item — PARSED so a real payload validates, but the
 * normalizer NEVER carries any of these fields forward (privacy
 * minimization: personal contact data is unnecessary for v1 display and is
 * not persisted, even though the NAV terms would allow it). Guard-tested.
 */
export const navContactSchema = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  role: z.string().nullish(),
  title: z.string().nullish(),
});

/** Occupation category — passthrough labels, stored as derived-from-source
 *  strings only (never mapped onto the platform's own taxonomy here). */
export const navOccupationCategorySchema = z
  .object({
    level1: z.string().nullish(),
    level2: z.string().nullish(),
    name: z.string().nullish(),
  })
  .passthrough();

/** The ad payload (FeedAd). Every maskable/optional field nullable. */
export const navFeedAdSchema = z.object({
  uuid: z.string().min(1),
  title: z.string().nullish(),
  jobtitle: z.string().nullish(),
  link: z.string().nullish(),
  sourceurl: z.string().nullish(),
  sector: z.string().nullish(),
  published: z.string().nullish(),
  expires: z.string().nullish(),
  updated: z.string().nullish(),
  employer: navEmployerSchema.nullish(),
  workLocations: z.array(navWorkLocationSchema).nullish(),
  contactList: z.array(navContactSchema).nullish(),
  occupationCategories: z.array(navOccupationCategorySchema).nullish(),
  categoryList: z.array(z.object({}).passthrough()).nullish(),
  description: z.string().nullish(),
  applicationUrl: z.string().nullish(),
  applicationDue: z.string().nullish(),
  engagementtype: z.string().nullish(),
  extent: z.string().nullish(),
  starttime: z.string().nullish(),
  positioncount: z.union([z.string(), z.number()]).nullish(),
});
export type NavFeedAd = z.infer<typeof navFeedAdSchema>;

/** Entry DETAIL response ({feed item url}) — ad_content null on masked /
 *  removed ads; the envelope status is authoritative for deactivation. */
export const navFeedEntryDetailSchema = z.object({
  uuid: z.string().min(1),
  sistEndret: z.string().nullish(),
  status: navFeedStatusSchema,
  ad_content: navFeedAdSchema.nullish(),
});
export type NavFeedEntryDetail = z.infer<typeof navFeedEntryDetailSchema>;

export type NavContractParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "schema_invalid"; readonly detail: string };

function parseWith<T>(schema: z.ZodType<T>, body: unknown): NavContractParseResult<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "schema_invalid",
      detail: parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}:${i.code}`)
        .join(","),
    };
  }
  return { ok: true, value: parsed.data };
}

export function parseNavFeedPage(body: unknown): NavContractParseResult<NavFeedPage> {
  return parseWith(navFeedPageSchema, body);
}

export function parseNavFeedEntryDetail(
  body: unknown,
): NavContractParseResult<NavFeedEntryDetail> {
  return parseWith(navFeedEntryDetailSchema, body);
}
