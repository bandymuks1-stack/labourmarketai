// Canonical locale set — BINDING per PLATFORM_DOCTRINE §2.4. Exactly 10:
// EN (source) + 9 launch markets. No PR may remove a locale; new i18n keys
// must land in all 10 files in the same PR (`[EN] …` placeholders are allowed
// for non-Tier-1 until human/community translation arrives).
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

export const defaultLocale: Locale = "lt";

// Tier 1 = human-verified for M1 (EN source + LT). The other 8 are Tier 2
// (baseline `[EN] …` placeholders today). Tier promotion is independent of the
// locale set — the set never shrinks (§2.4). UI flags non-Tier-1 as preview.
export const tier1Locales = ["en", "lt"] as const;
