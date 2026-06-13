/**
 * Labour-market EVIDENCE layer (Step 2 — evidence hardening).
 *
 * The typed, app-usable evidence behind the public "labour-market evidence"
 * module. Each item is a SOURCED statement about the EU labour market that
 * grounds the product's framing (skills visibility, shortages, mismatch,
 * demographics, changing skills, mobility) — never a platform metric, never
 * invented.
 *
 * HARDENING (Step 2): every item was re-verified against its live public source
 * on `lastChecked`. Figures, `figureDate`, `region` and `methodNote` were
 * tightened to the latest published numbers. Where a precise number exists it is
 * now stated (with the exact report + date in `methodNote`); where only a
 * qualitative statement is safe, it stays qualitative.
 *
 * HONESTY (binding, doctrine §7):
 *   - Every item carries full provenance: source, specific source URL, figure /
 *     publication date, region, last-checked date, claim type.
 *   - `value` (a number) is only set when transcribed from the cited report, and
 *     always carries a `methodNote` naming the report + reference period.
 *   - `lastChecked` is the date the claim was verified against the source.
 *
 * Adding/editing an item is a one-row change here; the provenance guard
 * (lib/guards/labour-market-evidence-provenance.test.ts) fails the build if any
 * required field is missing, the source id is unknown, a number lacks a
 * methodNote, or a sourceUrl is not https.
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
  /** Exact report / news page for THIS figure (overrides the source landing
   *  URL). Must be https. */
  readonly sourceUrl: string;
  /** Reference period / publication the claim describes (e.g. "2024 annual"). */
  readonly figureDate: string;
  /** Date this item was verified against the source (ISO). */
  readonly lastChecked: string;
  readonly claimType: ClaimType;
  /** Optional precise magnitude (with `unit`). Requires a `methodNote`. */
  readonly value?: string;
  readonly unit?: string;
  /** Honesty note: which report, reference period, and any precision caveat. */
  readonly methodNote?: string;
}

/** Date this evidence set was re-verified against the live sources. */
const VERIFIED = "2026-06-13";

/**
 * Public evidence set — re-verified against live official sources (Step 2).
 * EU-focused (matches the product's Baltic & Northern Europe + EU framing).
 * Construction appears only as ONE example among shortage sectors.
 */
export const LABOUR_MARKET_EVIDENCE: readonly EvidenceItem[] = [
  {
    id: "employment-participation",
    title: "Employment is at a record high — competition for skills is tight",
    summary:
      "Eurostat reports the EU employment rate for people aged 20–64 reached 75.8% in 2024 — the highest since the series began in 2009 (and rising above 76% in 2025). A tight market makes visible, evidenced skills more valuable, not less.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "eurostat",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20250415-1",
    figureDate: "2024 annual",
    lastChecked: VERIFIED,
    claimType: "statistic",
    value: "75.8",
    unit: "% employed (age 20–64), 2024",
    methodNote:
      "Eurostat Labour Force Survey, EU employment rate age 20–64, 2024 annual (published Apr 2025); highest since the 2009 series start. 2025 figure has since risen above 76%.",
  },
  {
    id: "shortage-occupations",
    title: "Shortages span the whole labour market",
    summary:
      "The EURES / European Labour Authority report on labour shortages & surpluses lists long-standing shortages in healthcare, construction and hospitality, plus highly-skilled gaps in engineering and IT, and — in the 2024 edition — transport and storage (drivers, mobile-plant operators). The gap is economy-wide, not one sector.",
    region: "EU / EEA + Norway, Iceland, Switzerland",
    sector: "all_sectors",
    sourceId: "eures",
    sourceUrl:
      "https://www.ela.europa.eu/en/publications/labour-shortages-and-surpluses-europe-2024",
    figureDate: "2024 report (published Jun 2025)",
    lastChecked: VERIFIED,
    claimType: "shortage_signal",
    methodNote:
      "EURES Report on labour shortages and surpluses 2024; shortage occupations are listed per country at the source.",
  },
  {
    id: "skills-mismatch",
    title: "Almost half of employers can't find the right skills",
    summary:
      "A European Commission Eurobarometer survey found 46% of EU SMEs found it difficult or very difficult to find staff with the right skills over the past two years — rising to about 70% among SMEs that actually hired. It is a matching problem, not only a supply problem.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "ec",
    sourceUrl:
      "https://single-market-economy.ec.europa.eu/news/eurobarometer-smes-and-skill-shortages-2024-03-14_en",
    figureDate: "2024 Eurobarometer (SME skills)",
    lastChecked: VERIFIED,
    claimType: "skills_signal",
    value: "46",
    unit: "% of SMEs (≈70% of those hiring)",
    methodNote:
      "European Commission Eurobarometer on SMEs and skill shortages, 2024: 46% of SMEs found it (very) difficult to find rightly-skilled staff in the prior 24 months; ~70% among SMEs that hired.",
  },
  {
    id: "digital-skills-demand",
    title: "The skills jobs need are shifting to digital",
    summary:
      "Cedefop's analysis points to nearly 9 in 10 jobs requiring digital skills, while only about 55.6% of EU adults have at least basic digital skills. The skills profile of many jobs is changing faster than a static CV can show.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "cedefop",
    sourceUrl: "https://www.cedefop.europa.eu/en/publications/4218",
    figureDate: "Cedefop Skills Forecast / digital-skills analysis (2024)",
    lastChecked: VERIFIED,
    claimType: "forecast",
    value: "55.6",
    unit: "% of EU adults with basic digital skills",
    methodNote:
      "Cedefop, 'Digital skills ambitions in action' / Skills Forecast (2024): ~9/10 jobs will require digital skills; ~55.6% of EU adults have at least basic digital skills (Eurostat DESI input).",
  },
  {
    id: "demographic-pressure",
    title: "The working-age population is shrinking",
    summary:
      "Eurostat population projections show 22 of the 27 EU countries are expected to see their working-age (20–64) population decline by 2050, with the old-age dependency ratio rising substantially. Retaining, re-skilling and matching workers to need becomes structurally more important.",
    region: "EU",
    sector: "all_sectors",
    sourceId: "eurostat",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251001-2",
    figureDate: "Eurostat population projections (2024 base)",
    lastChecked: VERIFIED,
    claimType: "forecast",
    value: "22 of 27",
    unit: "EU countries: working-age decline by 2050",
    methodNote:
      "Eurostat population projections / 'Old-age dependency growing across EU regions' (Oct 2025): 22 of 27 EU countries projected to see working-age (20–64) population decline by 2050; old-age dependency ratio projected to rise toward 2100.",
  },
  {
    id: "labour-mobility",
    title: "Cross-border mobility helps balance shortages",
    summary:
      "The European Commission's Annual Report on Intra-EU Labour Mobility shows about 10.1 million EU citizens of working age work in another member state and roughly 1.83 million are cross-border workers — and movers' employment rate (78%) exceeds nationals' (76%). Relevant for a Baltic & Northern European market where people work across borders.",
    region: "EU / EEA",
    sector: "all_sectors",
    sourceId: "ec",
    sourceUrl:
      "https://employment-social-affairs.ec.europa.eu/annual-report-intra-eu-labour-mobility-2024_en",
    figureDate: "2024 edition (published Feb 2025)",
    lastChecked: VERIFIED,
    claimType: "statistic",
    value: "1.83M",
    unit: "cross-border workers (10.1M work abroad)",
    methodNote:
      "EC Annual Report on Intra-EU Labour Mobility 2024 (data 2022–2023): ~10.1M working-age EU citizens work abroad; ~1.83M cross-border workers; movers' employment rate 78% vs 76% for nationals.",
  },
];

/** Shown in the UI so the provenance is honest about freshness + precision. */
export const EVIDENCE_DISCLAIMER =
  "Each claim links to its official public source with the figure date and region. Figures are transcribed from published reports (last verified on the date shown on each card), not a live data feed — always verify against the linked source for the authoritative, latest number.";

/** Required provenance fields every public evidence item must carry. */
export const REQUIRED_EVIDENCE_FIELDS = [
  "id",
  "title",
  "summary",
  "region",
  "sector",
  "sourceId",
  "sourceUrl",
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
    if (typeof item.sourceUrl === "string" && !/^https:\/\//.test(item.sourceUrl)) {
      problems.push(`${where}: sourceUrl is not https`);
    }
    if (item.value !== undefined && !item.methodNote) {
      problems.push(`${where}: numeric value without a methodNote`);
    }
    // A date-stamped ISO lastChecked keeps "verified on" honest.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.lastChecked)) {
      problems.push(`${where}: lastChecked is not an ISO date`);
    }
    if (seen.has(item.id)) problems.push(`${where}: duplicate id`);
    seen.add(item.id);
  }
  return problems;
}
