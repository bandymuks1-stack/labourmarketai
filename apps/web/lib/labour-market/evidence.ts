/**
 * Labour-market EVIDENCE layer (Step 1 — Whole Labour Market public reset).
 *
 * The typed, app-usable evidence behind the public "labour-market evidence"
 * module. Each item is a SOURCED statement about the EU labour market that
 * grounds the product's framing (skills visibility, shortages, future skills,
 * demographics, mismatch, mobility) — never a platform metric, never invented.
 *
 * HONESTY (binding, doctrine §7):
 *   - Every item carries full provenance: source, figure/publication date,
 *     region, last-checked date, claim type.
 *   - Items are written as QUALITATIVE sourced statements (durable, true of the
 *     cited source's reporting) rather than precise contested numbers we cannot
 *     verify live. Where an approximate magnitude is given, `value`/`unit` are
 *     set and `methodNote` flags it.
 *   - `lastChecked` is the date this layer was COMPILED from the cited source's
 *     published reporting. It is NOT a live fetch. Re-verify against `sourceUrl`
 *     before any external/marketing use (see EVIDENCE_DISCLAIMER).
 *
 * Adding an item is a one-row change here; the provenance guard
 * (lib/guards/labour-market-evidence-provenance.test.ts) fails the build if any
 * required field is missing or the source id is unknown.
 *
 * Pure data + types. No IO.
 */
import { type SourceId, isKnownSource } from "./sources";

export type ClaimType =
  | "statistic"
  | "trend"
  | "forecast"
  | "shortage_signal"
  | "skills_signal";

export interface EvidenceItem {
  readonly id: string;
  /** Short headline of the sourced claim. */
  readonly title: string;
  /** One- to two-sentence sourced statement. */
  readonly summary: string;
  /** Geography the claim covers (e.g. "EU", "EU / EEA"). */
  readonly region: string;
  /** Sector the claim is about, or all sectors. */
  readonly sector: string | "all_sectors";
  /** Source id — must exist in ./sources. */
  readonly sourceId: SourceId;
  /** Reference period / publication the claim describes (e.g. "2024 annual"). */
  readonly figureDate: string;
  /** Date this item was compiled/checked against the source (ISO). */
  readonly lastChecked: string;
  readonly claimType: ClaimType;
  /** Optional approximate magnitude (with `unit`). Flagged in `methodNote`. */
  readonly value?: string;
  readonly unit?: string;
  /** Honesty note about precision / derivation. */
  readonly methodNote?: string;
}

/** Compilation date for this evidence set (NOT a live fetch — see disclaimer). */
const COMPILED = "2026-06-13";

/**
 * Public evidence set. Qualitative, sourced, EU-focused (matches the product's
 * Baltic & Northern Europe + EU framing). Construction appears only as ONE
 * example among shortage sectors — never the whole story.
 */
export const LABOUR_MARKET_EVIDENCE: readonly EvidenceItem[] = [
  {
    id: "employment-participation",
    title: "Employment is at a record high — and so is competition for skills",
    summary:
      "Eurostat's Labour Force Survey reports the EU employment rate for people aged 20–64 at a record level of roughly three-quarters of the working-age population. A tight labour market makes visible, evidenced skills more valuable, not less.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "eurostat",
    figureDate: "2024 annual",
    lastChecked: COMPILED,
    claimType: "statistic",
    value: "~75",
    unit: "% (age 20–64)",
    methodNote:
      "Approximate magnitude from Eurostat LFS headline reporting; re-verify the exact latest figure at the source before external use.",
  },
  {
    id: "shortage-occupations",
    title: "Shortages span the whole labour market",
    summary:
      "The EURES labour shortages & surpluses report consistently identifies widespread shortages across health and care, ICT, engineering, construction, hospitality, and transport/driving — evidence that the gap is economy-wide, not one sector.",
    region: "EU / EEA",
    sector: "all_sectors",
    sourceId: "eures",
    figureDate: "2023–2024 report cycle",
    lastChecked: COMPILED,
    claimType: "shortage_signal",
    methodNote:
      "Qualitative summary of recurring shortage occupations in the EURES report; see source for the current occupation list per country.",
  },
  {
    id: "future-skills",
    title: "The skills employers need are shifting",
    summary:
      "Cedefop's Skills Forecast and Skills-OVATE point to rising demand for digital and higher-level skills across occupations, with the skills profile of many jobs changing faster than a static CV can show.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "cedefop",
    figureDate: "Skills Forecast (latest cycle)",
    lastChecked: COMPILED,
    claimType: "forecast",
    methodNote:
      "Qualitative synthesis of Cedefop forecast themes; figures vary by occupation and country at the source.",
  },
  {
    id: "demographic-pressure",
    title: "A shrinking working-age population",
    summary:
      "Eurostat demographic data shows the EU's working-age population declining and the old-age dependency ratio rising — structural pressure that makes retaining, re-skilling, and matching workers to need increasingly important.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "eurostat",
    figureDate: "2024 demographic statistics",
    lastChecked: COMPILED,
    claimType: "trend",
    methodNote:
      "Directional demographic trend reported by Eurostat; exact ratios available at the source.",
  },
  {
    id: "skills-mismatch",
    title: "Many vacancies are hard to fill",
    summary:
      "Eurofound and Cedefop document persistent skills mismatch and hard-to-fill vacancies, with a significant share of employers reporting difficulty finding workers with the right skills — a matching problem, not only a supply problem.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "eurofound",
    figureDate: "Eurofound labour-market change (recent reporting)",
    lastChecked: COMPILED,
    claimType: "skills_signal",
    methodNote:
      "Qualitative summary; specific mismatch indicators are published at the source.",
  },
  {
    id: "labour-mobility",
    title: "Cross-border mobility helps balance shortages",
    summary:
      "EURES / European Labour Authority reporting shows intra-EU labour mobility and cross-border work remain important for matching workers to shortage regions — relevant for a Baltic & Northern European market where people work across borders.",
    region: "EU / EEA",
    sector: "all_sectors",
    sourceId: "eures",
    figureDate: "EURES mobility reporting (recent)",
    lastChecked: COMPILED,
    claimType: "trend",
    methodNote:
      "Qualitative summary of EURES mobility themes; country-level flows available at the source.",
  },
];

/** Shown in the UI so the provenance is honest about freshness + precision. */
export const EVIDENCE_DISCLAIMER =
  "Each claim links to an official public source with its figure date and region. Figures are compiled from published reporting, not a live data feed — verify against the linked source before relying on them.";

/** Required provenance fields every public evidence item must carry. */
export const REQUIRED_EVIDENCE_FIELDS = [
  "id",
  "title",
  "summary",
  "region",
  "sector",
  "sourceId",
  "figureDate",
  "lastChecked",
  "claimType",
] as const;

/** Pure validator (also used by the provenance guard test). Returns the list of
 *  problems; empty array means every item is fully sourced. */
export function findEvidenceProvenanceProblems(
  items: readonly EvidenceItem[] = LABOUR_MARKET_EVIDENCE,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const where = item.id || "(missing id)";
    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      const v = (item as unknown as Record<string, unknown>)[field];
      if (typeof v !== "string" || v.trim().length === 0) {
        problems.push(`${where}: missing/empty "${field}"`);
      }
    }
    if (!isKnownSource(item.sourceId)) {
      problems.push(`${where}: unknown sourceId "${item.sourceId}"`);
    }
    if (item.value !== undefined && !item.methodNote) {
      problems.push(`${where}: numeric value without a methodNote`);
    }
    if (seen.has(item.id)) problems.push(`${where}: duplicate id`);
    seen.add(item.id);
  }
  return problems;
}
