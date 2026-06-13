/**
 * Labour-market EVIDENCE layer (Step 2 — hardened; localization fix).
 *
 * The typed, app-usable evidence behind the public "labour-market evidence"
 * module. Each item is a SOURCED statement about the EU labour market.
 *
 * LOCALIZATION (binding): user-facing prose (title, summary, figureDate, region,
 * unit, methodNote) lives in messages/{locale}/labour-market.json under the
 * `evidence.<id>.*` keys, so LT/RU/EN users only ever see their own language.
 * THIS module keeps only locale-neutral PROVENANCE: id, sourceId, sourceUrl,
 * claimType, value (numeric), lastChecked. The component renders localized text
 * by id; it never prints an English literal from here.
 *
 * HONESTY (doctrine §7): every item carries full provenance, the source URL is
 * the real authoritative page, and `value` (a number) always has a localized
 * `methodNote` (enforced by the i18n-content guard). `lastChecked` is the date
 * the claim was verified against the source.
 *
 * Guards:
 *   - lib/guards/labour-market-evidence-provenance.test.ts — data-level
 *     provenance (known source, https url, ISO lastChecked, unique ids).
 *   - lib/guards/labour-market-evidence-i18n.test.ts — every active locale has
 *     localized content for every id, a methodNote where a value exists, and no
 *     English leakage on LT/RU.
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

/** Locale-neutral provenance for one evidence item. All user-facing prose is in
 *  i18n under `evidence.<id>.*` — NEVER here. */
export interface EvidenceItem {
  readonly id: string;
  /** Source id — must exist in ./sources. */
  readonly sourceId: SourceId;
  /** Exact report / news page for THIS figure. Must be https. The REAL,
   *  authoritative source URL — never localized, never changed for display. */
  readonly sourceUrl: string;
  readonly claimType: ClaimType;
  /** Optional precise magnitude — kept locale-neutral (digits + ASCII). The
   *  unit + caveat live in the localized `evidence.<id>.unit` / `.methodNote`. */
  readonly value?: string;
  /** Date this item was verified against the source (ISO). */
  readonly lastChecked: string;
}

/** Date this evidence set was re-verified against the live sources. */
const VERIFIED = "2026-06-13";

/**
 * Public evidence set — re-verified against live official sources (2026-06-13).
 * Provenance only; prose is localized. Construction appears only as ONE example
 * among shortage sectors (see the localized `shortage-occupations` summary).
 */
export const LABOUR_MARKET_EVIDENCE: readonly EvidenceItem[] = [
  {
    id: "employment-participation",
    sourceId: "eurostat",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20250415-1",
    claimType: "statistic",
    value: "75.8",
    lastChecked: VERIFIED,
  },
  {
    id: "shortage-occupations",
    sourceId: "eures",
    sourceUrl:
      "https://www.ela.europa.eu/en/publications/labour-shortages-and-surpluses-europe-2024",
    claimType: "shortage_signal",
    lastChecked: VERIFIED,
  },
  {
    id: "skills-mismatch",
    sourceId: "ec",
    sourceUrl:
      "https://single-market-economy.ec.europa.eu/news/eurobarometer-smes-and-skill-shortages-2024-03-14_en",
    claimType: "skills_signal",
    value: "46",
    lastChecked: VERIFIED,
  },
  {
    id: "digital-skills-demand",
    sourceId: "cedefop",
    sourceUrl: "https://www.cedefop.europa.eu/en/publications/4218",
    claimType: "forecast",
    value: "55.6",
    lastChecked: VERIFIED,
  },
  {
    id: "demographic-pressure",
    sourceId: "eurostat",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251001-2",
    claimType: "forecast",
    value: "22 / 27",
    lastChecked: VERIFIED,
  },
  {
    id: "labour-mobility",
    sourceId: "ec",
    sourceUrl:
      "https://employment-social-affairs.ec.europa.eu/annual-report-intra-eu-labour-mobility-2024_en",
    claimType: "statistic",
    value: "1.83M",
    lastChecked: VERIFIED,
  },
];

/** Ids that publish a numeric `value` — the i18n guard requires a localized
 *  `methodNote` for each of these in every active locale. */
export const EVIDENCE_IDS_WITH_VALUE: readonly string[] =
  LABOUR_MARKET_EVIDENCE.filter((e) => e.value !== undefined).map((e) => e.id);

/** All evidence ids (order = display order). */
export const EVIDENCE_IDS: readonly string[] = LABOUR_MARKET_EVIDENCE.map(
  (e) => e.id,
);

/** Required locale-neutral provenance fields every item must carry. */
export const REQUIRED_EVIDENCE_FIELDS = [
  "id",
  "sourceId",
  "sourceUrl",
  "claimType",
  "lastChecked",
] as const;

/** Localized prose keys each item MUST have in every active locale's catalog. */
export const REQUIRED_EVIDENCE_I18N_FIELDS = [
  "title",
  "summary",
  "figureDate",
  "region",
] as const;

/** Pure data-level provenance validator (no i18n). Returns the list of
 *  problems; empty array means every item is fully provenanced. */
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
    if (typeof item.sourceUrl === "string" && !/^https:\/\//.test(item.sourceUrl)) {
      problems.push(`${where}: sourceUrl is not https`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.lastChecked)) {
      problems.push(`${where}: lastChecked is not an ISO date`);
    }
    // A value must stay locale-neutral (digits + ASCII punctuation only) so no
    // English prose hides inside it.
    if (item.value !== undefined && !/^[\d.,/\sMBKkm%+–-]+$/.test(item.value)) {
      problems.push(`${where}: value "${item.value}" is not locale-neutral`);
    }
    if (seen.has(item.id)) problems.push(`${where}: duplicate id`);
    seen.add(item.id);
  }
  return problems;
}
