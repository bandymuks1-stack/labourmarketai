/**
 * Labour-market statistics — typed SOURCE registry (Step 2 — evidence hardening).
 *
 * App-usable companion to docs/audits/labour-market-statistics/SOURCE_REGISTRY.md.
 * Every public labour-market evidence item (see ./evidence.ts) must reference a
 * source defined HERE by id, so a public number can never be shown without a
 * named, linkable source. No invented sources — only recognised official
 * statistics / EU institutional bodies.
 *
 * Pure data + types. No IO. Safe in client + server bundles.
 */

export type SourceId =
  | "eurostat"
  | "eures"
  | "cedefop"
  | "eurofound"
  | "oecd"
  | "ilo"
  | "ec";

export interface LabourMarketSource {
  readonly id: SourceId;
  /** Display name shown next to a figure. */
  readonly name: string;
  /** The organisation that publishes the figure. */
  readonly publisher: string;
  /** Canonical landing URL for the dataset / report family. A specific evidence
   *  item may override this with its own `sourceUrl` (the exact report page). */
  readonly url: string;
}

/** The allowed-source allowlist (mirrors the markdown registry). */
export const LABOUR_MARKET_SOURCES: Readonly<Record<SourceId, LabourMarketSource>> = {
  eurostat: {
    id: "eurostat",
    name: "Eurostat",
    publisher: "European Commission — Eurostat",
    url: "https://ec.europa.eu/eurostat/web/lfs",
  },
  eures: {
    id: "eures",
    name: "EURES / European Labour Authority",
    publisher: "European Labour Authority (EURES)",
    url: "https://www.ela.europa.eu/en/eures",
  },
  cedefop: {
    id: "cedefop",
    name: "Cedefop",
    publisher: "Cedefop (European Centre for the Development of Vocational Training)",
    url: "https://www.cedefop.europa.eu/en/tools/skills-forecast",
  },
  eurofound: {
    id: "eurofound",
    name: "Eurofound",
    publisher: "Eurofound (European Foundation for the Improvement of Living and Working Conditions)",
    url: "https://www.eurofound.europa.eu/en/topic/labour-market-change",
  },
  oecd: {
    id: "oecd",
    name: "OECD — Employment & Skills Outlook",
    publisher: "Organisation for Economic Co-operation and Development",
    url: "https://www.oecd.org/employment/",
  },
  ilo: {
    id: "ilo",
    name: "ILO — World Employment and Social Outlook",
    publisher: "International Labour Organization",
    url: "https://www.ilo.org/global/research/global-reports/weso/lang--en/index.htm",
  },
  ec: {
    id: "ec",
    name: "European Commission",
    publisher: "European Commission (Eurobarometer · DG Employment)",
    url: "https://employment-social-affairs.ec.europa.eu/",
  },
};

export function getSource(id: SourceId): LabourMarketSource {
  return LABOUR_MARKET_SOURCES[id];
}

export function isKnownSource(id: string): id is SourceId {
  return Object.prototype.hasOwnProperty.call(LABOUR_MARKET_SOURCES, id);
}
