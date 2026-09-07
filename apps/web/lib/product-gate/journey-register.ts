/**
 * PERMANENT JOURNEY CONTRACTS — the chains that must not break.
 *
 * Owner text, window 10 (2026-09-07), recorded in
 * `docs/PRODUCT_CONSTITUTION.md` §16.
 *
 * WHY THE EXISTING REACHABILITY GUARDS ARE NOT ENOUGH. This repository has 800+
 * guards, several of them named `*-reachability.test.ts`, and every one asserts
 * that a specific link a human once thought of still exists. On 2026-09-07 the
 * reconciliation found capabilities that were built, tested, merged and
 * unreachable — `work-verification-state.ts` with zero consumers, the employer
 * calendar that never calls `getPlanning()`, `/dashboard/learning` with no
 * inbound link, a complete service-offering loop nobody can open. Not one guard
 * failed, because a route rendering is not a journey working.
 *
 * So a journey is declared as an ORDERED CHAIN, and every link carries its own
 * honest state. A link may be `LIVE`, `BROKEN` or `NOT_BUILT` — and `BROKEN`
 * and `NOT_BUILT` must say why, in words, in the file. The guard
 * (`lib/guards/product-graph-journeys.test.ts`) enforces the direction that
 * matters: a link claiming to be LIVE whose capabilities are not live in the
 * register is a CI failure. Nobody can mark a chain green by hoping.
 *
 * Journey ids are PERMANENT. A journey is retired by recording a retirement,
 * never by deleting it — a deleted journey is a product that got smaller with
 * nobody noticing.
 *
 * Pure data. No IO.
 */

export type JourneyActor = "worker" | "company" | "agency" | "institution" | "any";

export type LinkState =
  /** Every capability behind this step is live and a human path reaches it. */
  | "LIVE"
  /** The pieces exist and the chain does not connect. Must say why. */
  | "BROKEN"
  /** Not built at any layer. Must say why it is still in the contract. */
  | "NOT_BUILT";

export interface JourneyStep {
  /** What actually happens, in the actor's language. */
  readonly step: string;
  /** Capability ids from `capability-register.ts` that carry this step. */
  readonly capabilities: readonly string[];
  readonly link: LinkState;
  /** Required for BROKEN and NOT_BUILT. The honest reason. */
  readonly because?: string;
  /** The strongest proof this specific step has actually reached. */
  readonly proof?: string;
}

export interface Journey {
  /** Permanent id. Never reused, never deleted. */
  readonly id: string;
  readonly actor: JourneyActor;
  readonly title: string;
  /** Why this chain matters to the product, not to the code. */
  readonly why: string;
  readonly steps: readonly JourneyStep[];
  readonly retired?: { readonly on: string; readonly why: string };
}

export const JOURNEY_REGISTER: readonly Journey[] = [
  {
    id: "J-WORKER-EVIDENCE",
    actor: "worker",
    title: "Real work → journal → evidence → verification → living profile → capability",
    why: "The chain that makes a person's history an asset instead of a claim. If it breaks, the product is a CV builder.",
    steps: [
      {
        step: "A person records what they actually did",
        capabilities: ["EVID-0"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — chat and journal transports reach one core",
      },
      {
        step: "The entry carries photos, tasks and hours",
        capabilities: ["EVID-4", "EVID-5"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — 8 photos live",
      },
      {
        step: "The entry knows whether anyone can verify it, and says so",
        capabilities: ["EVID-3"],
        link: "LIVE",
        because: undefined,
        proof: "TEST_PROVEN only — wired 2026-09-07, never walked by a human",
      },
      {
        step: "A manager receives and confirms it",
        capabilities: ["EVID-2"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — 13 confirmations in production, 3 of them self-confirmed",
      },
      {
        step: "Confirmation raises the evidence tier, and self-confirmation does not read as employer confirmation",
        capabilities: ["SKL-3"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN",
      },
      {
        step: "Recognised skills land on the living profile",
        capabilities: ["SKL-2", "PER-5"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — deterministic, no AI required",
      },
      {
        step: "Demonstrated capability is recognised against a formal requirement",
        capabilities: ["SKL-9"],
        link: "NOT_BUILT",
        because:
          "RPL / equivalence exists at no layer. It stays in the contract because 'five years of real work' currently reads as 'certificate missing', which is the wrong answer, not a missing feature.",
      },
    ],
  },
  {
    id: "J-COMPANY-EXECUTION",
    actor: "company",
    title: "People → project/site → assignment → capacity → need → supply → execution → report → verified history",
    why: "The chain that makes a company a living workforce actor instead of a profile with vacancies.",
    steps: [
      {
        step: "The company knows who it has",
        capabilities: ["ORG-3", "ORG-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — with four parallel roster truths as recorded debt",
      },
      {
        step: "It creates a project and a site",
        capabilities: ["WRK-1", "WRK-2"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — 9 projects, 1 work object",
      },
      {
        step: "It assigns people to the project",
        capabilities: ["WRK-5"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — assignment warns on overlap, never blocks (SEP-2)",
      },
      {
        step: "It assigns a whole team or brigade",
        capabilities: ["WRK-6"],
        link: "NOT_BUILT",
        because:
          "No team→project FK exists and zero team organizations exist. Brigade work is a first-class case in construction and agency supply; the step stays so the gap is a decision, not an oversight.",
      },
      {
        step: "It sees who is free and who is committed",
        capabilities: ["CAL-4", "CAL-3"],
        link: "BROKEN",
        because:
          "Capacity read one signal — approved absences, of which production has zero rows — and ignored the accepted bookings and active assignments that do exist. The three-state fix is written and sits in the open RED PR, unapplied.",
      },
      {
        step: "It records a need",
        capabilities: ["DEM-1"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — 20 real requests",
      },
      {
        step: "It discovers external supply for that need",
        capabilities: ["DEM-9", "DEM-5"],
        link: "BROKEN",
        because:
          "An employer cannot read declared agency capacity at all: `customer_requests_select` is own-row/admin/org-demand-access. The gated reader was proven in a production transaction under three real users and rolled back; its migration is unapplied.",
      },
      {
        step: "Work is executed and reported",
        capabilities: ["EVID-0", "EVID-5", "WRK-7"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN",
      },
      {
        step: "The report becomes verified history the company can rely on",
        capabilities: ["EVID-2", "EVID-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — and the subject's right of reply became readable on 2026-09-07; it had been write-only since the domain shipped (EVID-6)",
      },
    ],
  },
  {
    id: "J-AGENCY-SUPPLY",
    actor: "agency",
    title: "Declare workforce supply → discoverable to authorized demand → demand → match → assignment",
    why: "Organizational supply is not a job application. If this chain breaks, the product silently becomes demand-only and an agency's capacity reads as its need.",
    steps: [
      {
        step: "An agency declares available workforce as SUPPLY, not as a need",
        capabilities: ["DEM-2"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — kind `agency_offer`, shipped 2026-09-06 (#1587)",
      },
      {
        step: "Every surface reads that direction correctly",
        capabilities: ["DEM-2"],
        link: "BROKEN",
        because:
          "Every own-rows surface now classifies direction: the two boards (#1588/#1596), then the market map, the org demand rollup, the scouting list and the chat starter count (2026-09-07). What is left is not a surface at all — `list_open_demand_for_workers` does not return `kind`, so the worker board and the map's worker leg have nothing to classify. That half needs the owner-gated migration 20260906140000, and until it is applied this step is not honestly LIVE.",
      },
      {
        step: "An authorized employer can discover that supply",
        capabilities: ["DEM-9"],
        link: "BROKEN",
        because: "Same unapplied reader as J-COMPANY-EXECUTION. Today only the declaring agency can read its own declaration.",
      },
      {
        step: "Supply meets a real need",
        capabilities: ["DEM-5", "DEM-3"],
        link: "LIVE",
        proof: "PRODUCTION_DATA_PATH_PROVEN — 20 criteria, both directions",
      },
      {
        step: "A match becomes a booking and then an engagement",
        capabilities: ["CAL-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — booking → engagement → project assignment, 1 accepted booking",
      },
      {
        step: "A whole brigade is offered and matched as a unit",
        capabilities: ["DEM-6", "WRK-6"],
        link: "NOT_BUILT",
        because: "Team matching is admin-only and no team exists to match.",
      },
    ],
  },
  {
    id: "J-INSTITUTION-OUTCOME",
    actor: "institution",
    title: "Programme → cohort → person → practice/work → evidence → competency → qualification → employer demand → outcome",
    why: "A learner's practice must join the SAME living profile as their later employment. A separate student registry would be a second product.",
    steps: [
      {
        step: "An institution holds the training-provider capability",
        capabilities: ["EDU-1"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — the relationship is data, not an invitation type",
      },
      {
        step: "It creates a programme and a cohort",
        capabilities: ["EDU-2"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — 1 programme, 1 cohort",
      },
      {
        step: "Learners join the cohort",
        capabilities: ["EDU-2"],
        link: "BROKEN",
        because:
          "Production holds zero cohort members. Programme and cohort exist and no human has ever put a person into one — the vertical is architecture, and calling it release-ready would be false.",
      },
      {
        step: "A learner's practice is recorded as real work on their own profile",
        capabilities: ["PER-7", "EVID-0"],
        link: "BROKEN",
        because:
          "The RPC has accepted student/volunteer relationships since 2026-08-27 and the profile read filtered them out; the fix is in the open PR, not on main.",
      },
      {
        step: "Practice becomes evidence and then competency",
        capabilities: ["SKL-2", "SKL-5"],
        link: "LIVE",
        proof: "PRODUCTION_DATA_PATH_PROVEN — 8 transversal capabilities carry the non-trade vocabulary",
      },
      {
        step: "Competency becomes a qualification or a recognised equivalence",
        capabilities: ["SKL-9", "SKL-10"],
        link: "NOT_BUILT",
        because: "RPL is missing; the training register deliberately writes nothing into the skill ladder.",
      },
      {
        step: "The institution sees employer demand and reports outcomes",
        capabilities: ["EDU-3", "EDU-6"],
        link: "NOT_BUILT",
        because: "Outcomes have no writer a human can reach and there is no report or export at all.",
      },
    ],
  },
  {
    id: "J-IMPORT-HISTORY",
    actor: "any",
    title: "Source → parse → reconciliation → preview → commit → readback → provenance → reversal",
    why: "Historical work is the product's foundational data. An import that cannot be previewed, attributed or reversed is not an import — it is contamination.",
    steps: [
      {
        step: "A person imports their own CV, fact by fact",
        capabilities: ["PER-4"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — extraction proposes, the person confirms each fact",
      },
      {
        step: "An organization imports its own historical work records",
        capabilities: ["EVID-1"],
        link: "NOT_BUILT",
        because:
          "The engine, the schema, both transports and the commit gate are written and sit in the open RED PR. Nothing is on main and nothing is applied to production. It is owner decision 1 of window 10.",
      },
      {
        step: "An import can never write an attested or verified state",
        capabilities: ["SKL-3", "EVID-1"],
        link: "NOT_BUILT",
        because:
          "The CHECK constraint that makes this a schema guarantee rather than a code convention is in the unapplied migration.",
      },
      {
        step: "The subject sees what an organization recorded about them, and may refuse it",
        capabilities: ["EVID-1", "PER-12"],
        link: "NOT_BUILT",
        because: "Two-sided consent ships with the same unapplied migration.",
      },
    ],
  },
  {
    id: "J-TIME-FREEDOM",
    actor: "any",
    title: "Commitment → overlap detection → warning → alternatives → authorized decision → override → audit → actual result → learning",
    why: "The product models reality; it does not constrain human agency. A contractor with a full month may still take another project — the system's job is to inform, not to forbid.",
    steps: [
      {
        step: "A commitment is recorded",
        capabilities: ["WRK-5", "CAL-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN",
      },
      {
        step: "An overlapping commitment is DETECTED",
        capabilities: ["CAL-4", "WRK-5"],
        link: "LIVE",
        proof: "TEST_PROVEN — detection exists; see SEP-2 for the rule it must obey",
      },
      {
        step: "The actor is WARNED, not blocked",
        capabilities: ["WRK-5"],
        link: "LIVE",
        proof: "TEST_PROVEN — no overlap constraint exists anywhere, by decision",
      },
      {
        step: "Alternatives are shown",
        capabilities: ["CAL-4", "DEM-5"],
        link: "NOT_BUILT",
        because: "Detection reaches a warning and stops. Nothing proposes another sequencing, crew or date.",
      },
      {
        step: "The authorized actor decides, and an explicit override is recorded with a receipt",
        capabilities: ["CAL-7"],
        link: "NOT_BUILT",
        because:
          "There is no override object and no audit receipt for one. DETECT → WARN is the whole chain today; claiming DETECT → WARN → DECIDE → OVERRIDE → AUDIT would be false.",
      },
      {
        step: "The actual result is captured against the plan",
        capabilities: ["CAL-10"],
        link: "NOT_BUILT",
        because: "Nothing compares planned to actual, so nothing can learn a duration.",
      },
      {
        step: "Learned durations improve the next forecast — labelled as forecast",
        capabilities: ["CAL-10", "CAL-9"],
        link: "NOT_BUILT",
        because:
          "The learning loop needs the step above first. A forecast must never be stored where a fact is read (SEP-1).",
      },
    ],
  },
];

export function journeyById(id: string): Journey | undefined {
  return JOURNEY_REGISTER.find((j) => j.id === id);
}

/** Steps that are honestly not working — the product's real backlog. */
export function brokenLinks(): readonly { journey: string; step: JourneyStep }[] {
  return JOURNEY_REGISTER.flatMap((j) =>
    j.steps.filter((s) => s.link !== "LIVE").map((step) => ({ journey: j.id, step })),
  );
}
