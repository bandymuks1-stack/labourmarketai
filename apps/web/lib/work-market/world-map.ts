/**
 * Labour Market World Map v1 — pure zone model.
 *
 * Turns the owner's REAL, RLS-scoped signals into a stylized atlas of product
 * zones. Pure, deterministic, no DB, no coordinates, no external references.
 * Every zone is real-data-driven OR an honest empty/concept state — never fake
 * workers, companies, demand, scores, percentages, or verification.
 */

/** Signal roles (DESIGN.md colours): active=cyan, primary=blue (work need),
 *  supported=emerald (confirmed/stronger), attention=amber (needs action),
 *  concept=neutral (not enough data yet). "blocker" (red) is reserved for a real
 *  blocker only and is not emitted by v1 zone logic. */
export type ZoneStatus = "active" | "primary" | "supported" | "attention" | "concept";

export type ZoneDataState = "real" | "empty" | "concept";

export type ZoneKey =
  | "profileHub"
  | "skillsEvidence"
  | "availability"
  | "workNeeds"
  | "teams"
  | "company"
  | "marketPulse"
  | "trust";

export interface WorldMapInput {
  readonly hasWorker: boolean;
  readonly hasProfileSignal: boolean;
  readonly skillCounts: {
    readonly confirmed: number;
    readonly suggested: number;
    readonly selfDeclared: number;
  };
  readonly availabilityState: "available" | "busy" | "unavailable" | "unknown";
  readonly preferredCount: number;
  readonly demandTotal: number;
  readonly hasCompanySignal: boolean;
  readonly hasProjectSignal: boolean;
  readonly signalCount: number;
}

export interface WorldMapZone {
  readonly key: ZoneKey;
  readonly status: ZoneStatus;
  readonly dataState: ZoneDataState;
  /** A real count to show, or null for no number (never a fabricated metric). */
  readonly metric: number | null;
  /** i18n suffix under worldMap.zone.<key>.state.<stateKey>. */
  readonly stateKey: string;
  /** An existing route the zone action links to, or null. */
  readonly ctaHref: "/dashboard/profile" | "/dashboard/company" | null;
}

const PROFILE = "/dashboard/profile" as const;
const COMPANY = "/dashboard/company" as const;

/** Build the 8 atlas zones from real owner signals. Order is stable (guard-pinned). */
export function buildWorldMapZones(i: WorldMapInput): WorldMapZone[] {
  const skillTotal =
    i.skillCounts.confirmed + i.skillCounts.suggested + i.skillCounts.selfDeclared;

  // 1. Profile Hub
  const profileHub: WorldMapZone =
    i.hasWorker || i.hasProfileSignal
      ? { key: "profileHub", status: "active", dataState: "real", metric: null, stateKey: "started", ctaHref: PROFILE }
      : { key: "profileHub", status: "attention", dataState: "empty", metric: null, stateKey: "none", ctaHref: PROFILE };

  // 2. Skills & Evidence
  let skillsEvidence: WorldMapZone;
  if (!i.hasWorker || skillTotal === 0) {
    skillsEvidence = { key: "skillsEvidence", status: "attention", dataState: "empty", metric: null, stateKey: "none", ctaHref: PROFILE };
  } else if (i.skillCounts.confirmed > 0) {
    skillsEvidence = { key: "skillsEvidence", status: "supported", dataState: "real", metric: i.skillCounts.confirmed, stateKey: "confirmed", ctaHref: PROFILE };
  } else if (i.skillCounts.suggested > 0) {
    skillsEvidence = { key: "skillsEvidence", status: "active", dataState: "real", metric: i.skillCounts.suggested, stateKey: "suggested", ctaHref: PROFILE };
  } else {
    skillsEvidence = { key: "skillsEvidence", status: "active", dataState: "real", metric: i.skillCounts.selfDeclared, stateKey: "selfDeclared", ctaHref: PROFILE };
  }

  // 3. Availability
  let availability: WorldMapZone;
  if (!i.hasWorker || i.availabilityState === "unknown") {
    availability = { key: "availability", status: "attention", dataState: "empty", metric: null, stateKey: "none", ctaHref: PROFILE };
  } else if (i.availabilityState === "available") {
    availability = { key: "availability", status: "supported", dataState: "real", metric: i.preferredCount || null, stateKey: "available", ctaHref: PROFILE };
  } else if (i.availabilityState === "busy") {
    availability = { key: "availability", status: "active", dataState: "real", metric: i.preferredCount || null, stateKey: "busy", ctaHref: PROFILE };
  } else {
    availability = { key: "availability", status: "attention", dataState: "real", metric: null, stateKey: "unavailable", ctaHref: PROFILE };
  }

  // 4. Work Needs — draft/review signals only, never fabricated demand
  const workNeeds: WorldMapZone =
    i.demandTotal > 0
      ? { key: "workNeeds", status: "primary", dataState: "real", metric: i.demandTotal, stateKey: "drafts", ctaHref: COMPANY }
      : { key: "workNeeds", status: "attention", dataState: "empty", metric: null, stateKey: "none", ctaHref: COMPANY };

  // 5. Teams / Brigades — concept zone (no team data surfaced to the frontend yet)
  const teams: WorldMapZone = { key: "teams", status: "concept", dataState: "concept", metric: null, stateKey: "concept", ctaHref: null };

  // 6. Company / Organisation
  const company: WorldMapZone =
    i.hasCompanySignal
      ? { key: "company", status: "active", dataState: "real", metric: null, stateKey: "linked", ctaHref: COMPANY }
      : { key: "company", status: "concept", dataState: "empty", metric: null, stateKey: "none", ctaHref: COMPANY };

  // 7. Market Pulse / Opportunity Routes — possible-fit signals, NEVER a percentage
  const hasAnySignal = i.signalCount > 0 || i.demandTotal > 0;
  const marketPulse: WorldMapZone =
    hasAnySignal && i.hasWorker
      ? { key: "marketPulse", status: "active", dataState: "real", metric: i.signalCount || null, stateKey: "possibleFit", ctaHref: null }
      : { key: "marketPulse", status: "concept", dataState: "empty", metric: null, stateKey: "needsData", ctaHref: PROFILE };

  // 8. Trust / Confirmation — real verification only, never a fake verified badge
  const trust: WorldMapZone =
    i.skillCounts.confirmed > 0
      ? { key: "trust", status: "supported", dataState: "real", metric: i.skillCounts.confirmed, stateKey: "confirmedExists", ctaHref: PROFILE }
      : { key: "trust", status: "concept", dataState: "empty", metric: null, stateKey: "selfDeclaredOnly", ctaHref: PROFILE };

  return [profileHub, skillsEvidence, availability, workNeeds, teams, company, marketPulse, trust];
}

/** Legend roles shown under the atlas (dot colour key). */
export const WORLD_MAP_LEGEND = [
  "active",
  "primary",
  "supported",
  "attention",
  "concept",
  "blocker",
] as const;