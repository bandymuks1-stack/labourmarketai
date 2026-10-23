import { activeLocales, type ActiveLocale } from "@/lib/i18n/config";

/**
 * PUBLIC CLAIMS ↔ PRODUCT TRUTH — the registry.
 *
 * WHY THIS EXISTS (owner order 2026-10-23). Agentai OS cites LabourMarket.ai
 * marketing claims in outreach only when it can re-verify them on the live
 * site. Its register used to hard-code English sentences and verify them by
 * exact contiguous match, so every copy edit or layout change made a working
 * claim "disappear" (measured 2026-10-23: 14 of 27 found). The fix is that the
 * product states its own public claims, from the SAME message keys the pages
 * render, and serves them at `GET /api/public/claims/v1` (contract
 * `lm-public-claims/v1`, consumed by Agentai — never rename a field).
 *
 * THE RULES (enforced by `lib/guards/public-claims-registry.test.ts`):
 *
 *   · A claim names MESSAGE KEYS, never sentences. Fragments are resolved from
 *     `messages/<locale>.json` at request time, so a reworded key updates the
 *     claim automatically and a removed key fails CI.
 *   · Every key of a page must actually be rendered by that page's component
 *     tree (static source check), in every listed locale.
 *   · Fragments are SEPARATE on purpose — text from different elements is
 *     never concatenated, because the consumer checks each fragment as one
 *     contiguous run of the page's visible text.
 *   · A claim is never deleted. When the page stops saying it, or it stops
 *     being true, it becomes `RETIRED` (listed, no pages) so a consumer stops
 *     citing it.
 *   · Every LIVE claim names the capability in `lib/product-gate/
 *     capability-register.ts` that makes it true; `null` only for a pure
 *     platform fact (the landing headline).
 *
 * Changing or removing a message key a claim uses requires updating THIS file
 * in the same PR (AGENTS.md § Public claims registry).
 */

export const PUBLIC_CLAIMS_SCHEMA = "lm-public-claims/v1" as const;

export type ClaimAudience = "WORKER" | "EMPLOYER" | "PARTNER" | "PLATFORM";
export type ClaimStatus = "LIVE" | "RETIRED";

/** One fragment = the rendered text of ONE message key (one element). */
export interface FragmentSpec {
  /** Dotted key with array indices, e.g. `companies.journey.steps[1].desc`. */
  readonly key: string;
  /**
   * ICU argument values, ONLY for a key whose rendered text interpolates a
   * value the page supplies (e.g. the price figure from `plans`). Simple
   * `{name}` arguments only; anything richer fails the guard.
   */
  readonly values?: Readonly<Record<string, string | number>>;
}

export interface ClaimPageSpec {
  /** Locale-less path: `""` is the locale root, else `/for-companies` etc. */
  readonly path: string;
  /**
   * The locales whose page renders the SAME keys. `"active"` = every active
   * locale (`activeLocales`). `en` must always be included.
   */
  readonly locales: "active" | readonly ActiveLocale[];
  readonly fragments: readonly FragmentSpec[];
}

export interface ClaimSpec {
  readonly claimId: string;
  readonly audience: ClaimAudience;
  readonly capabilityId: string | null;
  readonly status: ClaimStatus;
  readonly pages: readonly ClaimPageSpec[];
  readonly structural: null | {
    readonly kind: "locale-roots";
    readonly locales: readonly ActiveLocale[];
  };
  /**
   * Required when the capability is BLOCKED: why the claim is still true of
   * the live product although part of the capability is gated.
   */
  readonly capabilityCaveat?: string;
  /** Internal note (not served): what the claim means, why it is shaped so. */
  readonly note?: string;
}

const ALL = "active" as const;

/** The canonical page paths a claim may cite. */
const P = {
  root: "",
  workers: "/for-workers",
  companies: "/for-companies",
  agencies: "/for-agencies",
  pricing: "/pricing",
} as const;

const k = (key: string, values?: FragmentSpec["values"]): FragmentSpec =>
  values ? { key, values } : { key };

const BILLING_CAVEAT =
  "MKT-7 is BLOCKED only on arming real recurring charging (two owner acts). The published plan table (PRICING_READINESS_STATE = owner_confirmed, figure from plans.price_eur_monthly) and the free-plan limit of one active position are enforced by the live entitlements regardless.";

export const PUBLIC_CLAIMS: readonly ClaimSpec[] = [
  // ── WORKER ────────────────────────────────────────────────────────────────
  {
    claimId: "worker.skills-discoverable",
    audience: "WORKER",
    capabilityId: "PER-2",
    status: "LIVE",
    structural: null,
    pages: [
      {
        path: P.workers,
        locales: ALL,
        fragments: [k("pages.workers.title"), k("pages.workers.titleAccent")],
      },
    ],
  },
  {
    claimId: "worker.profile-is-free",
    audience: "WORKER",
    capabilityId: "PER-1",
    status: "LIVE",
    structural: null,
    pages: [{ path: P.workers, locales: ALL, fragments: [k("pages.workers.cta")] }],
  },
  {
    claimId: "worker.matched-across-europe",
    audience: "WORKER",
    capabilityId: "DEM-5",
    status: "LIVE",
    structural: null,
    note: "The for-workers hero sentence: build one profile, set availability, real demand finds you across borders.",
    pages: [{ path: P.workers, locales: ALL, fragments: [k("pages.workers.subcopy")] }],
  },
  // ── EMPLOYER ──────────────────────────────────────────────────────────────
  {
    claimId: "employer.opportunity-flow",
    audience: "EMPLOYER",
    capabilityId: "DEM-1",
    status: "LIVE",
    structural: null,
    pages: [
      {
        path: P.companies,
        locales: ALL,
        fragments: [k("pages.companies.title"), k("pages.companies.titleAccent")],
      },
    ],
  },
  {
    claimId: "employer.post-need-by-project",
    audience: "EMPLOYER",
    capabilityId: "DEM-1",
    status: "LIVE",
    structural: null,
    pages: [
      {
        path: P.companies,
        locales: ALL,
        fragments: [
          k("pages.companies.benefits[0].title"),
          k("pages.companies.benefits[0].body"),
          k("pages.companies.subcopy"),
        ],
      },
    ],
  },
  {
    claimId: "employer.inquiry-cta",
    audience: "EMPLOYER",
    capabilityId: "DEM-7",
    status: "LIVE",
    structural: null,
    pages: [{ path: P.companies, locales: ALL, fragments: [k("pages.companies.cta")] }],
  },
  {
    claimId: "employer.skills-compared-with-records",
    audience: "EMPLOYER",
    capabilityId: "DEM-5",
    status: "LIVE",
    structural: null,
    note: "\"Evidence-based\" means exactly this: the requirement is compared with skill records. Copy may not exceed what step 2 currently says.",
    pages: [
      {
        path: P.companies,
        locales: ALL,
        fragments: [k("companies.demand.bullets[2]"), k("companies.journey.steps[1].desc")],
      },
    ],
  },
  {
    claimId: "employer.direct-contact",
    audience: "EMPLOYER",
    capabilityId: "COM-1",
    status: "LIVE",
    structural: null,
    pages: [
      { path: P.companies, locales: ALL, fragments: [k("companies.journey.steps[2].desc")] },
    ],
  },
  {
    claimId: "employer.work-journal-continues",
    audience: "EMPLOYER",
    capabilityId: "EVID-0",
    status: "LIVE",
    structural: null,
    note: "Evidenced on the WORKER page — the journal is the worker's record.",
    pages: [
      { path: P.workers, locales: ALL, fragments: [k("pages.workers.benefits[3].body")] },
    ],
  },
  {
    claimId: "employer.fit-per-need",
    audience: "EMPLOYER",
    capabilityId: "DEM-5",
    status: "LIVE",
    structural: null,
    pages: [{ path: P.companies, locales: ALL, fragments: [k("pages.companies.subcopy")] }],
  },
  {
    claimId: "employer.hire-on-records",
    audience: "EMPLOYER",
    capabilityId: "SKL-3",
    status: "LIVE",
    structural: null,
    pages: [
      { path: P.companies, locales: ALL, fragments: [k("companies.features.items[3].desc")] },
    ],
  },
  {
    claimId: "employer.on-site-records",
    audience: "EMPLOYER",
    capabilityId: "DEM-5",
    status: "LIVE",
    structural: null,
    pages: [{ path: P.companies, locales: ALL, fragments: [k("companies.faq.items[0].a")] }],
  },
  {
    claimId: "employer.inquiry-free",
    audience: "EMPLOYER",
    capabilityId: "DEM-7",
    status: "LIVE",
    structural: null,
    pages: [{ path: P.companies, locales: ALL, fragments: [k("companies.faq.items[1].a")] }],
  },
  {
    claimId: "employer.one-position-free",
    audience: "EMPLOYER",
    capabilityId: "MKT-7",
    capabilityCaveat: BILLING_CAVEAT,
    status: "LIVE",
    structural: null,
    pages: [{ path: P.pricing, locales: ALL, fragments: [k("pricing.faq[1].a")] }],
  },
  {
    claimId: "employer.organization-plan-99-per-month",
    audience: "EMPLOYER",
    capabilityId: "MKT-7",
    capabilityCaveat: BILLING_CAVEAT,
    status: "LIVE",
    structural: null,
    note:
      "English only, on purpose: the plan card's NAME is read from plans.name_en / name_lt (the i18n key is the fallback), so only `en` is known to render this key's text; non-lt locales show name_en. The price figure is plans.price_eur_monthly (99) formatted by pricing.pricePerMonth. A monthly subscription, VAT on top — never a one-time fee.",
    pages: [
      {
        path: P.pricing,
        locales: ["en"],
        fragments: [
          k("pricing.plans.business.name"),
          k("pricing.plans.business.tagline"),
          k("pricing.pricePerMonth", { price: 99 }),
          k("pricing.plans.business.features[0]"),
        ],
      },
    ],
  },
  {
    claimId: "employer.operator-checks-shortlist",
    audience: "EMPLOYER",
    capabilityId: "ORG-7",
    status: "LIVE",
    structural: null,
    note: "The HUMAN concierge service beside the automatic platform. Copy may say an operator checks the shortlist by hand; never that the platform searches on its own.",
    pages: [{ path: P.pricing, locales: ALL, fragments: [k("conciergeOffer.note")] }],
  },
  // ── PARTNER (agencies) ────────────────────────────────────────────────────
  {
    claimId: "partner.pool-in-motion",
    audience: "PARTNER",
    capabilityId: "ORG-6",
    status: "LIVE",
    structural: null,
    pages: [
      {
        path: P.agencies,
        locales: ALL,
        fragments: [k("pages.agencies.title"), k("pages.agencies.titleAccent")],
      },
    ],
  },
  {
    claimId: "partner.manage-post-broker",
    audience: "PARTNER",
    capabilityId: "ORG-8",
    status: "LIVE",
    structural: null,
    pages: [{ path: P.agencies, locales: ALL, fragments: [k("pages.agencies.subcopy")] }],
  },
  // ── PLATFORM ──────────────────────────────────────────────────────────────
  // The headline is claimed once PER LOCALE: "the site says this in German" is
  // a different fact from "the site says this in English".
  ...(["en", "de", "lt", "ru"] as const).map(
    (locale): ClaimSpec => ({
      claimId: `platform.headline.${locale}`,
      audience: "PLATFORM",
      capabilityId: null,
      status: "LIVE",
      structural: null,
      pages: [{ path: P.root, locales: [locale], fragments: [k("landing.hero.headline")] }],
    }),
  ),
  {
    claimId: "platform.locales-live",
    audience: "PLATFORM",
    capabilityId: "GOV-5",
    status: "LIVE",
    structural: { kind: "locale-roots", locales: activeLocales },
    pages: [],
  },
  // ── RETIRED — listed so a consumer stops citing them; never deleted ──────
  {
    claimId: "employer.organization-plan-price",
    audience: "EMPLOYER",
    capabilityId: "MKT-7",
    status: "RETIRED",
    structural: null,
    note: "Promised \"Up to 10 active positions\" and \"VAT applied by Stripe Tax\" — both no longer true. Superseded by employer.organization-plan-99-per-month.",
    pages: [],
  },
  {
    claimId: "employer.vat-via-stripe-tax",
    audience: "EMPLOYER",
    capabilityId: "MKT-7",
    status: "RETIRED",
    structural: null,
    note: "Stripe Tax is NOT configured and the owner refused Stripe Tax registration (2026-10-23).",
    pages: [],
  },
  {
    claimId: "platform.four-entry-paths",
    audience: "PLATFORM",
    capabilityId: null,
    status: "RETIRED",
    structural: null,
    note: "Descriptive, not page text; the landing was restructured.",
    pages: [],
  },
];

// ── resolution ──────────────────────────────────────────────────────────────

export type MessageTree = Readonly<Record<string, unknown>>;

/** `a.b[1].c` → ["a","b",1,"c"]. */
export function parseMessageKey(key: string): (string | number)[] {
  const out: (string | number)[] = [];
  for (const part of key.split(".")) {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part);
    if (!m) throw new Error(`public-claims: malformed message key "${key}"`);
    out.push(m[1]);
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]));
  }
  return out;
}

/** The raw message string at `key`, or `undefined` when absent / not a string. */
export function messageAt(messages: MessageTree, key: string): string | undefined {
  let cur: unknown = messages;
  for (const seg of parseMessageKey(key)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The visible text a key renders. Supports exactly what the claim keys use:
 * plain text, ICU `''` escapes and simple `{name}` arguments supplied by the
 * fragment. Anything else (plural/select, rich-text tags, quoted braces)
 * throws — the guard turns that into a CI failure instead of a wrong claim.
 */
export function renderFragment(messages: MessageTree, spec: FragmentSpec): string {
  const raw = messageAt(messages, spec.key);
  if (raw === undefined) throw new Error(`public-claims: message key "${spec.key}" is missing`);
  if (/'[{}#|]/.test(raw)) {
    throw new Error(`public-claims: "${spec.key}" uses ICU quoting the resolver does not support`);
  }
  if (/<\/?[a-zA-Z][^>]*>/.test(raw)) {
    throw new Error(`public-claims: "${spec.key}" uses rich-text tags the resolver does not support`);
  }
  const text = raw
    .replace(/\{\s*([A-Za-z_][\w]*)\s*\}/g, (whole, name: string) => {
      const v = spec.values?.[name];
      if (v === undefined) {
        throw new Error(`public-claims: "${spec.key}" needs a value for {${name}}`);
      }
      return String(v);
    })
    .replace(/''/g, "'");
  if (/[{}]/.test(text)) {
    throw new Error(`public-claims: "${spec.key}" uses ICU syntax the resolver does not support`);
  }
  const out = collapse(text);
  if (!out) throw new Error(`public-claims: message key "${spec.key}" is empty`);
  return out;
}

/** The locales a page spec expands to — `en` first, then the active order. */
export function pageLocales(page: ClaimPageSpec): ActiveLocale[] {
  const list: readonly ActiveLocale[] = page.locales === "active" ? activeLocales : page.locales;
  return [...list].sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : 0));
}

/** The locale-prefixed public path (`localePrefix: "always"`). */
export function localePath(locale: ActiveLocale, path: string): string {
  return `/${locale}${path}`;
}

// ── the served contract ─────────────────────────────────────────────────────

export interface PublicClaimPage {
  readonly locale: ActiveLocale;
  readonly path: string;
  readonly fragments: readonly string[];
}

export interface PublicClaim {
  readonly claimId: string;
  readonly audience: ClaimAudience;
  readonly capabilityId: string | null;
  readonly status: ClaimStatus;
  readonly pages: readonly PublicClaimPage[];
  readonly structural: ClaimSpec["structural"];
}

export interface PublicClaimsPayload {
  readonly schema: typeof PUBLIC_CLAIMS_SCHEMA;
  readonly builtAtIso: string;
  readonly claims: readonly PublicClaim[];
}

export type MessageLoader = (locale: ActiveLocale) => Promise<MessageTree>;

/**
 * Build the `lm-public-claims/v1` payload. RETIRED claims keep their row with
 * no pages; LIVE page claims are resolved from the catalogs the pages render.
 */
export async function buildPublicClaimsPayload(
  load: MessageLoader,
  now: Date = new Date(),
  claims: readonly ClaimSpec[] = PUBLIC_CLAIMS,
): Promise<PublicClaimsPayload> {
  const cache = new Map<ActiveLocale, Promise<MessageTree>>();
  const catalog = (locale: ActiveLocale) => {
    let p = cache.get(locale);
    if (!p) {
      p = load(locale);
      cache.set(locale, p);
    }
    return p;
  };

  const out: PublicClaim[] = [];
  for (const claim of claims) {
    const pages: PublicClaimPage[] = [];
    if (claim.status === "LIVE") {
      for (const page of claim.pages) {
        for (const locale of pageLocales(page)) {
          const messages = await catalog(locale);
          pages.push({
            locale,
            path: localePath(locale, page.path),
            fragments: page.fragments.map((f) => renderFragment(messages, f)),
          });
        }
      }
    }
    out.push({
      claimId: claim.claimId,
      audience: claim.audience,
      capabilityId: claim.capabilityId,
      status: claim.status,
      pages,
      structural: claim.status === "LIVE" ? claim.structural : null,
    });
  }
  return { schema: PUBLIC_CLAIMS_SCHEMA, builtAtIso: now.toISOString(), claims: out };
}
