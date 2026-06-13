/**
 * Country labour-market evidence (Step 5/6 — MVP).
 *
 * Per-country, SOURCE-BACKED signals for the priority markets. Locale-neutral
 * provenance lives here (sourceId + exact sourceUrl + figureDate + lastChecked +
 * claimType); the localized title/summary live in i18n under
 * `countryEvidence.<COUNTRY>.<id>.{title,summary}` so LT/RU users only ever see
 * their own language.
 *
 * HONESTY: these are QUALITATIVE sourced statements (true of the cited source's
 * reporting), not precise per-country numbers we cannot verify live — exactly
 * the pattern the EU evidence layer uses. No invented figures, no fake charts.
 * `lastChecked` is the compilation date; the UI links each source so the reader
 * can confirm the current detail. Adding a country/signal is a one-row change
 * here; the provenance guard fails the build if any field is missing.
 *
 * Pure data + types. No IO.
 */
import { type SourceId, isKnownSource } from "./sources";
import type { ClaimType } from "./evidence";

/** Countries with a live evidence page today (MVP — the home Baltic market). */
export type CountryCode = "LT" | "LV" | "EE";

export const SUPPORTED_COUNTRIES: readonly CountryCode[] = ["LT", "LV", "EE"];

/** The full priority-market list shown on the index (others are "coming"). */
export const PRIORITY_MARKETS: readonly string[] = [
  "LT",
  "LV",
  "EE",
  "PL",
  "DE",
  "NL",
  "DK",
  "NO",
  "SE",
  "FI",
];

export interface CountrySignal {
  readonly country: CountryCode;
  /** Stable id (also the i18n key under countryEvidence.<COUNTRY>.<id>). */
  readonly id: string;
  readonly sourceId: SourceId;
  /** Exact source page for this signal (https). */
  readonly sourceUrl: string;
  readonly figureDate: string;
  readonly lastChecked: string;
  readonly claimType: ClaimType;
}

/** Date this country set was compiled/verified against the cited sources. */
const VERIFIED = "2026-06-13";

const EURES_REPORT_2024 =
  "https://www.ela.europa.eu/en/publications/labour-shortages-and-surpluses-europe-2024";
const EURES_LMI_LT =
  "https://eures.europa.eu/living-and-working/labour-market-information/labour-market-information-lithuania_en";
const CEDEFOP_SKILLS =
  "https://www.cedefop.europa.eu/en/tools/skills-forecast";

/**
 * Per-country signals. Each `id` maps to localized title/summary in i18n.
 * Construction appears only as one example among sectors — never the frame.
 */
export const COUNTRY_SIGNALS: Record<CountryCode, readonly CountrySignal[]> = {
  LT: [
    {
      country: "LT",
      id: "shortages",
      sourceId: "eures",
      sourceUrl: EURES_LMI_LT,
      figureDate: "EURES 2024 report",
      lastChecked: VERIFIED,
      claimType: "shortage_signal",
    },
    {
      country: "LT",
      id: "digital-skills",
      sourceId: "cedefop",
      sourceUrl: CEDEFOP_SKILLS,
      figureDate: "Cedefop Skills Forecast (latest)",
      lastChecked: VERIFIED,
      claimType: "skills_signal",
    },
  ],
  LV: [
    {
      country: "LV",
      id: "surplus",
      sourceId: "eures",
      sourceUrl: EURES_REPORT_2024,
      figureDate: "EURES 2024 report",
      lastChecked: VERIFIED,
      claimType: "trend",
    },
    {
      country: "LV",
      id: "digital-skills",
      sourceId: "cedefop",
      sourceUrl: CEDEFOP_SKILLS,
      figureDate: "Cedefop Skills Forecast (latest)",
      lastChecked: VERIFIED,
      claimType: "skills_signal",
    },
  ],
  EE: [
    {
      country: "EE",
      id: "balanced",
      sourceId: "eures",
      sourceUrl: EURES_REPORT_2024,
      figureDate: "EURES 2024 report",
      lastChecked: VERIFIED,
      claimType: "trend",
    },
    {
      country: "EE",
      id: "digital-skills",
      sourceId: "cedefop",
      sourceUrl: CEDEFOP_SKILLS,
      figureDate: "Cedefop Skills Forecast (latest)",
      lastChecked: VERIFIED,
      claimType: "skills_signal",
    },
  ],
};

export function isSupportedCountry(code: string): code is CountryCode {
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(code);
}

export function countrySignals(country: CountryCode): readonly CountrySignal[] {
  return COUNTRY_SIGNALS[country] ?? [];
}

/** Pure provenance validator (used by the guard). Empty array = all sourced. */
export function findCountryProvenanceProblems(): string[] {
  const problems: string[] = [];
  for (const country of SUPPORTED_COUNTRIES) {
    const signals = COUNTRY_SIGNALS[country];
    if (!signals || signals.length === 0) {
      problems.push(`${country}: no signals`);
      continue;
    }
    const seen = new Set<string>();
    for (const s of signals) {
      const where = `${country}/${s.id || "(no id)"}`;
      if (!s.id) problems.push(`${where}: missing id`);
      if (!isKnownSource(s.sourceId)) problems.push(`${where}: unknown source ${s.sourceId}`);
      if (!/^https:\/\//.test(s.sourceUrl)) problems.push(`${where}: sourceUrl not https`);
      if (!s.figureDate) problems.push(`${where}: missing figureDate`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.lastChecked)) problems.push(`${where}: lastChecked not ISO`);
      if (seen.has(s.id)) problems.push(`${where}: duplicate id`);
      seen.add(s.id);
    }
  }
  return problems;
}
