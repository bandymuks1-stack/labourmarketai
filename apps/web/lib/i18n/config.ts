// Canonical locale set — BINDING per PLATFORM_DOCTRINE §2.4. Exactly 11:
// EN (source) + 9 launch markets + RU (worker language, DI-approved
// amendment 2026-06-12 — most workers on the first real sites operate in
// Russian; see doctrine §9 changelog). The 11 JSON files MUST exist in repo
// at all times (§2.4 file-presence requirement) and new i18n keys land in
// all 11 in the same PR. The set itself never shrinks.
//
// market → locale code: Lithuania=lt, Latvia=lv, Estonia=et, Netherlands=nl,
// Germany=de, Denmark=da, Norway=no, Sweden=sv, Poland=pl. RU is a worker
// language across markets, not a market of its own.
export const locales = [
  "en",
  "lt",
  "lv",
  "et",
  "nl",
  "de",
  "da",
  "no",
  "sv",
  "pl",
  "ru",
] as const;
export type Locale = (typeof locales)[number];

// ── ACTIVE LOCALES (owner P0 override 2026-05-28; RU added 2026-06-12) ──
// Owner-mandated subset: routing / build / static-params / UI selector
// only emit lt + en + ru. The other 8 JSON files stay in the repo per §2.4
// (file-presence) but no /lv/... /et/... /nl/... etc. routes prerender,
// the URL ↔ locale resolver rejects non-active codes, and the language
// selector hides them. The doctrine §2.4 line "the locale set never
// shrinks" was overridden in this single P0 sprint to stop user-visible
// `MISSING_MESSAGE` errors leaking through non-Tier-1 locales. Promoting
// any other code back to active is a one-row add here (no schema, no
// migration), per §2.5. RU is ACTIVE from day 1 (owner goal 2026-06-12:
// workers need it today) — its message files are FULL-parity with EN and
// guarded by lib/guards/i18n-active-locale-parity.test.ts.
export const activeLocales = ["lt", "en", "ru"] as const;
export type ActiveLocale = (typeof activeLocales)[number];

export const defaultLocale: ActiveLocale = "lt";

// Tier 1 = human-verified for M1 (EN source + LT). RU is active but stays
// Tier 2 (AI-seeded full translation pending human review per doctrine
// §7.4) — the language selector tags it as preview until DI promotes it.
export const tier1Locales = ["en", "lt"] as const;
