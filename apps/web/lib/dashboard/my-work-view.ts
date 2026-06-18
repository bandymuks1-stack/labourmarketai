/**
 * My Work View cockpit v1 — pure block + next-action model.
 *
 * Turns the owner's REAL, RLS-scoped signals into the first authenticated
 * workspace: connected status blocks (profile, CV, skills, evidence,
 * availability, work journal, work needs, world map) + prioritized next actions.
 * Pure, deterministic, no DB. Real-data-driven or honest empty/concept — never
 * fake data, fake parsing, fake verification, or guaranteed matching.
 */

export type BlockTone = "active" | "supported" | "attention" | "concept";
export type BlockDataState = "real" | "empty" | "concept";

export type BlockKey =
  | "profile"
  | "cv"
  | "skills"
  | "evidence"
  | "availability"
  | "journal"
  | "workNeeds"
  | "worldMap";

export type CockpitHref =
  | "/dashboard/profile"
  | "/dashboard/journal"
  | "/dashboard/company"
  | "/dashboard/market-map";

export interface WorkViewBlock {
  readonly key: BlockKey;
  readonly tone: BlockTone;
  readonly dataState: BlockDataState;
  readonly metric: number | null;
  readonly stateKey: string;
  readonly ctaHref: CockpitHref;
}

export interface WorkViewAction {
  readonly key: string;
  readonly href: CockpitHref;
  /** v1 actions all link to live routes; the flag + reasonKey support an honest
   *  disabled state for future actions that genuinely cannot run yet. */
  readonly enabled: boolean;
  readonly reasonKey?: string;
}

export interface MyWorkViewInput {
  readonly hasProfile: boolean;
  readonly hasSummary: boolean;
  readonly hasWorker: boolean;
  readonly skillCount: number;
  readonly skillCounts: {
    readonly confirmed: number;
    readonly suggested: number;
    readonly selfDeclared: number;
  };
  readonly availabilityState: "available" | "busy" | "unavailable" | "unknown";
  readonly journalCount: number;
  readonly demandTotal: number;
  readonly worldRealZones: number;
  readonly worldTotalZones: number;
}

const PROFILE = "/dashboard/profile" as const;
const JOURNAL = "/dashboard/journal" as const;
const COMPANY = "/dashboard/company" as const;
const MARKET = "/dashboard/market-map" as const;

/** Build the 8 cockpit blocks from real signals (stable order, guard-pinned). */
export function buildWorkViewBlocks(i: MyWorkViewInput): WorkViewBlock[] {
  const profile: WorkViewBlock =
    i.hasProfile || i.hasWorker
      ? { key: "profile", tone: "active", dataState: "real", metric: null, stateKey: "started", ctaHref: PROFILE }
      : { key: "profile", tone: "attention", dataState: "empty", metric: null, stateKey: "missing", ctaHref: PROFILE };

  const cv: WorkViewBlock =
    i.hasSummary
      ? { key: "cv", tone: "supported", dataState: "real", metric: null, stateKey: "summaryAdded", ctaHref: PROFILE }
      : { key: "cv", tone: "attention", dataState: "empty", metric: null, stateKey: "import", ctaHref: PROFILE };

  const skills: WorkViewBlock =
    i.skillCount > 0
      ? { key: "skills", tone: "active", dataState: "real", metric: i.skillCount, stateKey: "added", ctaHref: PROFILE }
      : { key: "skills", tone: "attention", dataState: "empty", metric: null, stateKey: "none", ctaHref: PROFILE };

  let evidence: WorkViewBlock;
  if (i.skillCounts.confirmed > 0) {
    evidence = { key: "evidence", tone: "supported", dataState: "real", metric: i.skillCounts.confirmed, stateKey: "supported", ctaHref: JOURNAL };
  } else if (i.skillCounts.suggested > 0) {
    evidence = { key: "evidence", tone: "active", dataState: "real", metric: i.skillCounts.suggested, stateKey: "hasEvidence", ctaHref: JOURNAL };
  } else if (i.skillCount > 0) {
    evidence = { key: "evidence", tone: "attention", dataState: "real", metric: null, stateKey: "needsEvidence", ctaHref: JOURNAL };
  } else {
    evidence = { key: "evidence", tone: "concept", dataState: "empty", metric: null, stateKey: "noSkills", ctaHref: PROFILE };
  }

  let availability: WorkViewBlock;
  if (i.availabilityState === "available") {
    availability = { key: "availability", tone: "supported", dataState: "real", metric: null, stateKey: "available", ctaHref: PROFILE };
  } else if (i.availabilityState === "busy") {
    availability = { key: "availability", tone: "active", dataState: "real", metric: null, stateKey: "busy", ctaHref: PROFILE };
  } else if (i.availabilityState === "unavailable") {
    availability = { key: "availability", tone: "attention", dataState: "real", metric: null, stateKey: "unavailable", ctaHref: PROFILE };
  } else {
    availability = { key: "availability", tone: "attention", dataState: "empty", metric: null, stateKey: "none", ctaHref: PROFILE };
  }

  const journal: WorkViewBlock =
    i.journalCount > 0
      ? { key: "journal", tone: "active", dataState: "real", metric: i.journalCount, stateKey: "logged", ctaHref: JOURNAL }
      : { key: "journal", tone: "attention", dataState: "empty", metric: null, stateKey: "none", ctaHref: JOURNAL };

  const workNeeds: WorkViewBlock =
    i.demandTotal > 0
      ? { key: "workNeeds", tone: "active", dataState: "real", metric: i.demandTotal, stateKey: "drafts", ctaHref: COMPANY }
      : { key: "workNeeds", tone: "concept", dataState: "empty", metric: null, stateKey: "none", ctaHref: COMPANY };

  const worldMap: WorkViewBlock =
    i.worldRealZones > 0
      ? { key: "worldMap", tone: "active", dataState: "real", metric: i.worldRealZones, stateKey: "zones", ctaHref: MARKET }
      : { key: "worldMap", tone: "concept", dataState: "empty", metric: null, stateKey: "noSignals", ctaHref: MARKET };

  return [profile, cv, skills, evidence, availability, journal, workNeeds, worldMap];
}

/** Prioritized next actions (max 5). Every action links to a live route, so no
 *  CTA is dead; honest order surfaces the most useful missing step first. */
export function buildWorkViewActions(i: MyWorkViewInput): WorkViewAction[] {
  const out: WorkViewAction[] = [];
  if (!(i.hasProfile || i.hasWorker)) out.push({ key: "completeProfile", href: PROFILE, enabled: true });
  if (i.skillCount === 0) out.push({ key: "addSkills", href: PROFILE, enabled: true });
  if (!i.hasSummary) out.push({ key: "importCv", href: PROFILE, enabled: true });
  if (i.availabilityState === "unknown") out.push({ key: "setAvailability", href: PROFILE, enabled: true });
  if (i.journalCount === 0) out.push({ key: "logWork", href: JOURNAL, enabled: true });
  if (i.skillCount > 0 && i.skillCounts.confirmed === 0) out.push({ key: "strengthenEvidence", href: JOURNAL, enabled: true });
  // Keep up to 4 missing-step actions, then ALWAYS append the market map so the
  // panel never dead-ends — even a fully-completed profile keeps one live CTA.
  const top = out.slice(0, 4);
  top.push({ key: "openMarketMap", href: MARKET, enabled: true });
  return top;
}

export const WORK_VIEW_BLOCK_ORDER: BlockKey[] = [
  "profile",
  "cv",
  "skills",
  "evidence",
  "availability",
  "journal",
  "workNeeds",
  "worldMap",
];