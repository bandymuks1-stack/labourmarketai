/**
 * THE CANONICAL PRODUCT GRAPH — what LabourMarket.ai IS, as data.
 *
 * Owner text, window 10 (2026-09-07), recorded 1:1 in
 * `docs/PRODUCT_CONSTITUTION.md` §14.
 *
 * LabourMarket.ai is NOT a job board, a recruitment site, a staffing
 * marketplace, a CV builder, a Work Journal, a timesheet application, a
 * workforce planner, an evidence database, a qualification platform, a booking
 * calendar, or an AI chatbot. Each of those is ONE EDGE of the graph below.
 *
 * THE FAILURE THIS FILE PREVENTS. A task always works on one edge. The danger
 * is not that the task is small — it is that the task's edge quietly becomes
 * the definition of the whole product, and the other twenty-three nodes stop
 * being anybody's business. That is how a labour/work graph becomes a job
 * board without a single person deciding to make it one.
 *
 * So the nodes are enumerated, permanently, with the capabilities that realize
 * them. `lib/guards/product-graph-journeys.test.ts` asserts that no node loses
 * its last live capability without an explicit, dated `narrowedOn` record. A
 * PR that removes the last thing holding up a node has to say so, in the diff,
 * in words.
 *
 * Relationship to `world-elements.ts`: the twelve WORLD ELEMENTS are the
 * owner's UX/product decomposition (PRODUCT_VISION_LOCK_V1, the highest
 * product authority). The nodes here are the DOMAIN decomposition of the same
 * one product — each node names its world element, and the guard checks that
 * mapping is real. Two views, one product; not two products.
 *
 * Pure data. No IO.
 */

import type { CapabilityDomain } from "./capability-register";
import type { WorldElementId } from "./world-elements";

export type GraphNodeId =
  | "people"
  | "real_work"
  | "skills"
  | "experience"
  | "evidence"
  | "qualifications"
  | "organizations"
  | "companies"
  | "agencies"
  | "teams"
  | "projects"
  | "sites"
  | "tasks"
  | "services"
  | "availability"
  | "time"
  | "capacity"
  | "current_demand"
  | "future_demand"
  | "education"
  | "countries"
  | "mobility"
  | "market_signals"
  | "commercial_opportunities";

export interface GraphNode {
  readonly id: GraphNodeId;
  readonly name: string;
  /** What this node is in THIS product — including what it is not. */
  readonly definition: string;
  readonly worldElement: WorldElementId;
  readonly domains: readonly CapabilityDomain[];
  /** Capability ids that realize this node. At least one, always. */
  readonly capabilities: readonly string[];
  /**
   * Set ONLY when every capability realizing this node is MISSING. It is not a
   * failure to have one — the product legitimately does not do everything yet.
   * It is a failure to have one appear silently.
   */
  readonly unrealized?: {
    readonly since: string;
    readonly why: string;
  };
  /**
   * Set when the product DELIBERATELY stops covering a node. Requires a date
   * and an owner-attributable reason. Nothing else may empty a node.
   */
  readonly narrowedOn?: { readonly on: string; readonly by: string; readonly why: string };
}

export const PRODUCT_GRAPH: readonly GraphNode[] = [
  {
    id: "people",
    name: "PEOPLE",
    definition:
      "Autonomous actors. A person is never a fixed product role: employee, owner, student, brigade member, provider, client and job seeker are contexts a single human holds at once.",
    worldElement: "user_avatar",
    domains: ["person"],
    capabilities: ["PER-1", "PER-2", "PER-5", "PER-6", "PER-12", "PER-10", "PER-11"],
  },
  {
    id: "real_work",
    name: "REAL WORK",
    definition:
      "What somebody actually did. Historical and new work converge on one record — an imported timesheet and a journal entry written today are the same kind of fact.",
    worldElement: "work_journal",
    domains: ["evidence", "work_execution"],
    capabilities: ["EVID-0", "EVID-4", "EVID-5", "EVID-7", "PER-6", "PER-7", "EVID-1", "PER-4"],
  },
  {
    id: "skills",
    name: "SKILLS",
    definition:
      "Capability as a catalogue entry, recognised deterministically from real work — not typed into a form and not inferred by a model without confirmation.",
    worldElement: "skills",
    domains: ["skills"],
    capabilities: ["SKL-1", "SKL-2", "SKL-4", "SKL-5", "SKL-6"],
  },
  {
    id: "experience",
    name: "EXPERIENCE",
    definition:
      "The accumulated history of a person across organizations, with the other side's right of reply.",
    worldElement: "reputation",
    domains: ["evidence", "person"],
    capabilities: ["EVID-6", "EVID-7", "PER-6", "PER-7"],
  },
  {
    id: "evidence",
    name: "EVIDENCE",
    definition:
      "A claim with a provenance and a verification state. Evidence is never verification, and AI extraction is never fact.",
    worldElement: "work_journal",
    domains: ["evidence", "skills"],
    capabilities: ["EVID-2", "EVID-3", "SKL-3", "EVID-1"],
  },
  {
    id: "qualifications",
    name: "QUALIFICATIONS",
    definition:
      "Formal requirement, valid credential, recognised equivalence and demonstrated capability are FOUR different things that must never collapse into one another.",
    worldElement: "documents",
    domains: ["skills"],
    capabilities: ["SKL-7", "SKL-8", "SKL-9", "SKL-10", "PER-9", "PER-13"],
  },
  {
    id: "organizations",
    name: "ORGANIZATIONS",
    definition:
      "Actors with organization-specific capabilities. Capability is a role a body holds, not an industry label it is stamped with.",
    worldElement: "organizations",
    domains: ["organization"],
    capabilities: ["ORG-1", "ORG-2", "ORG-3", "ORG-4", "ORG-5"],
  },
  {
    id: "companies",
    name: "COMPANIES",
    definition:
      "A living workforce/project actor — people, teams, projects, sites, capacity and needs — never a profile page with vacancies attached.",
    worldElement: "organizations",
    domains: ["organization", "work_execution"],
    capabilities: ["ORG-6", "ORG-7", "ORG-9", "WRK-1"],
  },
  {
    id: "agencies",
    name: "AGENCIES",
    definition:
      "Suppliers of workforce capacity. An agency's offer is SUPPLY; reading it as demand is the market-direction defect class.",
    worldElement: "organizations",
    domains: ["organization", "demand_supply"],
    capabilities: ["ORG-8", "DEM-2", "DEM-9"],
  },
  {
    id: "teams",
    name: "TEAMS / BRIGADES",
    definition:
      "Groups of avatars working together, inside or across organizations, that can be matched and assigned as a unit. Today this node is THIN, not empty: teams are `organizations` rows with organization_type='team' and production holds zero of them, team→project assignment has no FK anywhere, and team matching is reachable only from an admin route. Brigade work is a first-class case in construction and agency supply, so the node stays.",
    worldElement: "teams",
    domains: ["organization", "work_execution", "demand_supply"],
    capabilities: ["WRK-6", "DEM-6"],
  },
  {
    id: "projects",
    name: "PROJECTS",
    definition: "Units of current and future work that people and teams are assigned to.",
    worldElement: "projects",
    domains: ["work_execution"],
    capabilities: ["WRK-1", "WRK-3", "WRK-5", "WRK-7", "WRK-9", "WRK-10"],
  },
  {
    id: "sites",
    name: "SITES / OBJECTS",
    definition:
      "Not an address — a construction site, factory, warehouse, office, training centre or event, with its own history.",
    worldElement: "objects",
    domains: ["work_execution", "marketplace"],
    capabilities: ["WRK-2", "MKT-3"],
  },
  {
    id: "tasks",
    name: "TASKS / WORK STAGES",
    definition: "The decomposition of a project into stages and the tasks inside them.",
    worldElement: "projects",
    domains: ["work_execution"],
    capabilities: ["WRK-3", "WRK-4", "WRK-8"],
  },
  {
    id: "services",
    name: "SERVICES",
    definition:
      "What an actor can be hired to DO, as distinct from a job it wants filled. A service offering is supply.",
    worldElement: "market_world_map",
    domains: ["marketplace"],
    capabilities: ["MKT-1", "MKT-2", "MKT-4", "MKT-5"],
  },
  {
    id: "availability",
    name: "AVAILABILITY",
    definition:
      "When an actor could work. A commitment reduces availability; it does not prohibit a decision.",
    worldElement: "user_avatar",
    domains: ["time_capacity"],
    capabilities: ["CAL-3", "CAL-5", "CAL-6", "PER-3"],
  },
  {
    id: "time",
    name: "TIME",
    definition:
      "The one axis every other node is projected onto — the calendar is a projection, not a store.",
    worldElement: "projects",
    domains: ["time_capacity"],
    capabilities: ["CAL-1", "CAL-2", "MKT-6", "CAL-8"],
  },
  {
    id: "capacity",
    name: "CAPACITY",
    definition:
      "How much work an actor could take on. Distinguish HARD CONSTRAINT, COMMITMENT, PLANNED, FORECAST, CONFLICT and OVERRIDE — a forecast is never a fact.",
    worldElement: "organizations",
    domains: ["time_capacity"],
    capabilities: ["CAL-4", "CAL-7", "CAL-9", "CAL-10"],
  },
  {
    id: "current_demand",
    name: "CURRENT DEMAND",
    definition:
      "A need that exists now: vacancy, temporary worker need, project requirement, urgent replacement, service request or subcontract.",
    worldElement: "market_world_map",
    domains: ["demand_supply"],
    capabilities: ["DEM-1", "DEM-3", "DEM-4", "DEM-5", "DEM-7"],
  },
  {
    id: "future_demand",
    name: "FUTURE DEMAND",
    definition:
      "What an organization will probably need, and the qualification gaps that will block it. Forecast, labelled as forecast.",
    worldElement: "market_world_map",
    domains: ["demand_supply", "time_capacity"],
    capabilities: ["DEM-8", "CAL-9", "CAL-10"],
    unrealized: {
      since: "2026-09-07",
      why: "Nothing in the product forecasts demand. GEO-4 observes today's market and is deliberately NOT counted here, because an observation is not a forecast (SEP-1) and counting it would make an empty node look half-alive.",
    },
  },
  {
    id: "education",
    name: "EDUCATION / TRAINING / RECOGNITION",
    definition:
      "Institution → programme → cohort → person → practice → evidence → competency → qualification → employer demand → outcome. The learner's evidence joins the SAME living profile as their later employment.",
    worldElement: "organizations",
    domains: ["education", "skills"],
    capabilities: ["EDU-1", "EDU-2", "EDU-3", "EDU-4", "EDU-5", "EDU-6", "SKL-10", "PER-8"],
  },
  {
    id: "countries",
    name: "COUNTRIES / JURISDICTIONS",
    definition:
      "A requirement is only true somewhere. Jurisdiction, effective date and source are part of the fact.",
    worldElement: "documents",
    domains: ["map_intelligence", "skills"],
    capabilities: ["SKL-8", "GEO-3"],
  },
  {
    id: "mobility",
    name: "MOBILITY",
    definition:
      "Whether a person may lawfully work somewhere, and what would make that possible.",
    worldElement: "documents",
    domains: ["map_intelligence"],
    capabilities: ["GEO-3", "GEO-2"],
  },
  {
    id: "market_signals",
    name: "MARKET SIGNALS",
    definition:
      "What the labour market is doing, as observations that can become an action — consumed from the vendor-neutral intelligence authority, never re-built here.",
    worldElement: "market_world_map",
    domains: ["map_intelligence"],
    capabilities: ["GEO-1", "GEO-4", "GEO-5"],
  },
  {
    id: "commercial_opportunities",
    name: "COMMERCIAL OPPORTUNITIES",
    definition:
      "Where spare capacity meets an unmet need — the commercial end of the flywheel, for the platform and for its actors.",
    worldElement: "market_world_map",
    domains: ["marketplace", "demand_supply"],
    capabilities: ["MKT-1", "MKT-7", "MKT-8", "DEM-9"],
  },
];

/**
 * THE FLYWHEEL — why the graph compounds. Ordered; every step names the nodes
 * it consumes, so a step whose nodes all went unrealized is visible.
 */
export const FLYWHEEL: readonly { readonly step: string; readonly nodes: readonly GraphNodeId[] }[] = [
  { step: "REAL HISTORICAL WORK + NEW REAL WORK", nodes: ["real_work", "people"] },
  { step: "VERIFIED EVIDENCE + PROJECT RESULTS", nodes: ["evidence", "projects"] },
  { step: "SUPPLY + DEMAND", nodes: ["availability", "current_demand", "services"] },
  { step: "BETTER LABOUR DATA → BETTER SKILL UNDERSTANDING", nodes: ["skills", "experience"] },
  { step: "BETTER MATCHING", nodes: ["current_demand", "capacity"] },
  { step: "BETTER PLANNING + WORKFORCE FORECASTS", nodes: ["time", "future_demand"] },
  { step: "BETTER TIME/CAPACITY/PRODUCTIVITY BENCHMARKS", nodes: ["capacity"] },
  { step: "BETTER COMMERCIAL INTELLIGENCE", nodes: ["market_signals", "commercial_opportunities"] },
  { step: "MORE USERS / ORGANIZATIONS → MORE REAL WORK DATA", nodes: ["organizations", "real_work"] },
];

/** THE VALUE CHAIN — the single pass a unit of work makes through the graph. */
export const VALUE_CHAIN: readonly { readonly step: string; readonly nodes: readonly GraphNodeId[] }[] = [
  { step: "REAL WORK", nodes: ["real_work"] },
  { step: "EVIDENCE", nodes: ["evidence"] },
  { step: "CAPABILITY", nodes: ["skills", "qualifications"] },
  { step: "CAPACITY", nodes: ["capacity", "availability"] },
  { step: "DEMAND", nodes: ["current_demand"] },
  { step: "MATCH", nodes: ["current_demand", "availability"] },
  { step: "EXECUTION", nodes: ["projects", "tasks", "sites"] },
  { step: "VERIFIED RESULT", nodes: ["evidence"] },
  { step: "LIVING HISTORY", nodes: ["experience"] },
  { step: "BETTER DECISION", nodes: ["market_signals", "future_demand"] },
];

/**
 * What LabourMarket.ai must never be reducible to. Each entry is a real
 * narrowing that a small, reasonable-looking change could cause.
 */
export const FORBIDDEN_REDUCTIONS: readonly { readonly to: string; readonly wouldRequire: string }[] = [
  { to: "a job board", wouldRequire: "treating CURRENT DEMAND as the only demand and vacancies as the only supply-meeting object" },
  { to: "a recruitment site", wouldRequire: "collapsing EVIDENCE and EXPERIENCE into a candidate record" },
  { to: "a staffing marketplace", wouldRequire: "reading an agency's declared capacity as its need (the market-direction defect)" },
  { to: "a CV builder", wouldRequire: "letting the person's own declaration be the only evidence tier" },
  { to: "a Work Journal", wouldRequire: "dropping SUPPLY, DEMAND and CAPACITY as first-class nodes" },
  { to: "a timesheet application", wouldRequire: "reducing REAL WORK to hours and losing skills, photos and verification state" },
  { to: "a workforce planner", wouldRequire: "turning COMMITMENT into PROHIBITION and forecasts into facts" },
  { to: "an evidence database", wouldRequire: "removing the paths from evidence to matching and planning" },
  { to: "a qualification platform", wouldRequire: "letting a formal requirement be the only route to deployability" },
  { to: "a booking calendar", wouldRequire: "making TIME a store instead of a projection" },
  { to: "an AI chatbot", wouldRequire: "treating the conversation as the product rather than one universal surface over the graph" },
];

export function graphNode(id: GraphNodeId): GraphNode | undefined {
  return PRODUCT_GRAPH.find((n) => n.id === id);
}
