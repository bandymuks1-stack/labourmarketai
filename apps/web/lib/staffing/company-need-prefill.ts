/**
 * Company-need prefill adapter (European Work & Project Calculator v1).
 *
 * Parses OPTIONAL query parameters into bounded default values for the public
 * company-need form. Only fields the form's server action ALREADY accepts are
 * supported (number_of_workers, country, profession, expected_duration,
 * description, engagement) — the adapter adds no new backend capability, it only saves
 * retyping. Everything is validated and bounded here AND re-validated by the
 * server action on submit; an invalid or out-of-range parameter is silently
 * dropped (never an error page, never a fabricated value).
 *
 * Privacy: the calculator bridge only ever SENDS number_of_workers + country
 * (non-PII, non-price). The other fields are accepted for completeness but
 * every value is length-bounded and used purely as a form default the user
 * reviews before submitting. PURE — no fs, no net, client-safe.
 *
 * `from` (owner P0 2026-11-10, attribution): the id of the public button that
 * opened the form (e.g. `companies_market_lu`), so an inquiry records which
 * page it came from. A page's own button id, never a person's identifier or
 * a campaign tag; a bounded slug or nothing.
 */
import { ALL_ISO_COUNTRIES } from "@/lib/location/country-model";
import { isWorkTypeSlug } from "@/lib/taxonomy/work-categories";

export interface CompanyNeedPrefill {
  readonly numberOfWorkers?: number;
  readonly country?: string;
  readonly profession?: string;
  readonly expectedDuration?: string;
  readonly description?: string;
  readonly entry?: string;
  /** How the labour is supplied; an intent page (subcontractors, agencies) preselects it. */
  readonly engagement?: PrefillEngagement;
}

/** A public button id: lower-case slug, bounded. */
export const COMPANY_NEED_ENTRY = /^[a-z0-9_]{1,40}$/;

/**
 * The form's `engagement_model` values. Kept here, not imported, because
 * `company-need.ts` pulls server-only modules into this client-safe file; a
 * test pins the two lists equal (company-need-prefill.test.ts).
 */
export const PREFILL_ENGAGEMENTS = ["employment", "subcontracting", "agency_supply"] as const;
export type PrefillEngagement = (typeof PREFILL_ENGAGEMENTS)[number];

const MAX_WORKERS = 1000; // mirrors the form input's max
const MAX_DURATION_CHARS = 120; // mirrors the form input's maxLength
const MAX_DESCRIPTION_CHARS = 1000; // conservative slice of the 8000 textarea

function text(value: string | null, maxLen: number): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Parse + bound the supported prefill params from a URL query. */
export function parseCompanyNeedPrefill(
  params: URLSearchParams,
): CompanyNeedPrefill {
  const out: {
    numberOfWorkers?: number;
    country?: string;
    profession?: string;
    expectedDuration?: string;
    description?: string;
    entry?: string;
    engagement?: PrefillEngagement;
  } = {};

  const workersRaw = params.get("number_of_workers");
  if (workersRaw != null && /^\d{1,4}$/.test(workersRaw.trim())) {
    const n = Number(workersRaw.trim());
    if (Number.isInteger(n) && n >= 1 && n <= MAX_WORKERS) {
      out.numberOfWorkers = n;
    }
  }

  const countryRaw = params.get("country");
  if (countryRaw) {
    const code = countryRaw.trim().toUpperCase();
    // Any ISO country the form lists, so a market page can preselect it (LU is
    // not a readiness country, and the select offers every ISO code).
    if (ALL_ISO_COUNTRIES.includes(code)) {
      out.country = code;
    }
  }

  const professionRaw = params.get("profession");
  if (professionRaw && isWorkTypeSlug(professionRaw.trim())) {
    out.profession = professionRaw.trim();
  }

  const duration = text(params.get("expected_duration"), MAX_DURATION_CHARS);
  if (duration) out.expectedDuration = duration;

  const description = text(params.get("description"), MAX_DESCRIPTION_CHARS);
  if (description) out.description = description;

  const entry = params.get("from")?.trim();
  if (entry && COMPANY_NEED_ENTRY.test(entry)) out.entry = entry;
  const engagement = params.get("engagement")?.trim();
  const known = PREFILL_ENGAGEMENTS.find((e) => e === engagement);
  if (known) out.engagement = known;

  return out;
}

/**
 * The sign-in return value cannot be longer than this (lib/auth/redirect.ts drops
 * a longer `next` and sends the person to the dashboard instead).
 */
export const COMPANY_NEED_RETURN_MAX_CHARS = 1000;

/**
 * Where to come back to after signing in or signing up from the public form,
 * with the person's typed answers as the form's own prefill (employer path P0
 * 2026-11-15). Only the fields `parseCompanyNeedPrefill` reads come along, and the
 * page's own `from`; never a name, an e-mail address or a phone number. The
 * description is shortened until the whole value fits the sign-in limit, so a
 * long text never costs the person the return.
 */
export function companyNeedReturnPath(
  locale: string,
  read: (name: string) => string,
  currentSearch = "",
): string {
  const base = `/${locale}/company-need`;
  const p = new URLSearchParams();
  const set = (key: string, value: string) => {
    const v = value.trim();
    if (v) p.set(key, v);
  };
  set("country", read("country"));
  const workers = read("number_of_workers").trim();
  if (workers && workers !== "1") set("number_of_workers", workers);
  set("profession", read("profession"));
  set("expected_duration", read("expected_duration").slice(0, MAX_DURATION_CHARS));
  const engagement = read("engagement_model").trim();
  if (engagement && engagement !== "employment") set("engagement", engagement);
  const entry = new URLSearchParams(currentSearch).get("from")?.trim();
  if (entry && COMPANY_NEED_ENTRY.test(entry)) p.set("from", entry);

  const build = (description: string) => {
    const q = new URLSearchParams(p);
    if (description) q.set("description", description);
    const query = q.toString();
    return query ? `${base}?${query}` : base;
  };
  let description = read("description").trim().slice(0, MAX_DESCRIPTION_CHARS);
  let value = build(description);
  while (value.length > COMPANY_NEED_RETURN_MAX_CHARS && description.length > 0) {
    description = description.slice(0, Math.floor(description.length * 0.8)).trim();
    value = build(description);
  }
  return value;
}
