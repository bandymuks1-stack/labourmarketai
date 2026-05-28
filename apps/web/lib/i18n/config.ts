// Canonical locale set — BINDING per PLATFORM_DOCTRINE §2.4. Exactly 10:
// EN (source) + 9 launch markets. The 10 JSON files MUST exist in repo at
// all times (§2.4 file-presence requirement) and new i18n keys land in all
// 10 in the same PR. The set itself never shrinks.
//
// market → locale code: Lithuania=lt, Latvia=lv, Estonia=et, Netherlands=nl,
// Germany=de, Denmark=da, Norway=no, Sweden=sv, Poland=pl.
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
] as const;
export type Locale = (typeof locales)[number];

// ── ACTIVE LOCALES (owner P0 override 2026-05-28) ──────────────────────
// Owner-mandated subset: routing / build / static-params / UI selector
// only emit lt + en. The other 8 JSON files stay in the repo per §2.4
// (file-presence) but no /lv/... /et/... /nl/... etc. routes prerender,
// the URL ↔ locale resolver rejects non-active codes, and the language
// selector hides them. The doctrine §2.4 line "the locale set never
// shrinks" was overridden in this single P0 sprint to stop user-visible
// `MISSING_MESSAGE` errors leaking through non-Tier-1 locales. Promoting
// any other code back to active is a one-row add here (no schema, no
// migration), per §2.5.
export const activeLocales = ["lt", "en"] as const;
export type ActiveLocale = (typeof activeLocales)[number];

export const defaultLocale: ActiveLocale = "lt";

// Tier 1 = human-verified for M1 (EN source + LT). With the P0 active-
// locale subset in place tier1 == activeLocales today; the distinction is
// retained for future tier promotion (a Tier-2 locale would first move to
// activeLocales and then earn Tier-1 review).
export const tier1Locales = ["en", "lt"] as const;
