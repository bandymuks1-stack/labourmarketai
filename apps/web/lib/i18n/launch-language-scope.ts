import { activeLocales, locales, tier1Locales } from "./config";

/**
 * LAUNCH LANGUAGE SCOPE — the single honest declaration of what each
 * language tier actually gets (PR14, doctrine §2.4 incl. the 2026-07-04
 * amendment). Guarded by lib/guards/localization-launch-scope.test.ts,
 * which cross-checks every claim here against routing, the message files
 * on disk, the locale switcher and the offline recognition registry —
 * so this file cannot drift into a false language claim.
 *
 * The three tiers, from narrowest to widest:
 *
 * 1. UI ACTIVE (lt / en / ru) — routed, prerendered, selectable in the
 *    locale switcher, full message parity enforced (i18n-lt-en-parity).
 *    EN + LT are human-verified Tier 1; RU is active but preview-tagged
 *    until DI promotes it (doctrine §7.4).
 *
 * 2. UI CATALOG (the 11 §2.4 locales) — message files exist in the repo
 *    and never shrink, but the 8 non-active ones are "[EN] "-prefixed
 *    shells (i18n-debt ratchet), are NOT routed and NOT selectable.
 *    Promoting one to active is a one-row change in config.ts plus real
 *    translation of the critical flows.
 *
 * 3. TAXONOMY + RECOGNITION (12 = the 11 + FI) — skill/profession/journal
 *    display names (messages/<loc>/*.json) and offline text recognition
 *    (base lexicon + language packs). FI is DELIBERATELY in this tier
 *    ONLY: a Finnish worker's text is recognised and taxonomy names exist,
 *    but there is NO Finnish UI and the product must never claim one.
 *    Promoting FI to a UI locale is an OWNER decision that requires a
 *    full messages/fi.json catalog, routing, and parity guards.
 */

export const UI_ACTIVE_LOCALES = activeLocales;
export const UI_TIER1_LOCALES = tier1Locales;
export const UI_CATALOG_LOCALES = locales;

/** Taxonomy/recognition-only languages — never routed, never selectable. */
export const NON_UI_TAXONOMY_LOCALES = ["fi"] as const;

/** All 12 languages with taxonomy names + offline recognition coverage. */
export const TAXONOMY_LOCALES = [
  ...locales,
  ...NON_UI_TAXONOMY_LOCALES,
] as const;

export type TaxonomyLocale = (typeof TAXONOMY_LOCALES)[number];

/** The six per-locale taxonomy name files every taxonomy locale must ship. */
export const TAXONOMY_NAME_FILES = [
  "journal.json",
  "labour-market.json",
  "productivity-units.json",
  "professions.json",
  "relationship-types.json",
  "skill-names.json",
] as const;
