/**
 * CONVERSATION STARTERS — signal-derived suggestions, never a role menu.
 *
 * Owner Master Execution Contract 2026-09-04 §5–§6 (ARCHITECTURE §5.5):
 *
 *   "Contextual suggestion chips may exist. But they are suggestions. NOT a
 *    product boundary. NOT a fixed role menu. NOT a replacement for
 *    natural-language understanding. Generate a SMALL useful set from signals
 *    such as: current context · unfinished actions · attention-required state
 *    · recent use · frequently used actions · user pins · current project ·
 *    real demand · relevant next action. Do NOT show the same three role
 *    buttons forever."
 *
 * The named production drift: the real recruiter's workspace ("Labour market
 * ai Sp. z o.o", a staffing agency that ALSO holds eight demands, a roster and
 * projects) opened with exactly three agency chips — invite client · client
 * needs · proposal status — as if being an agency erased everything else the
 * company does. ACTIVE CONTEXT answers "on whose behalf am I acting?"; it
 * never locks the product to one role.
 *
 * This module is PURE. It takes the facts the server already read (which
 * capabilities the organization holds, what exists in its world today) and
 * returns at most three chips, each the NEXT REAL STEP of a capability track
 * the workspace genuinely holds — round-robin across tracks, so a company
 * with several capabilities sees a MIX, never one role's menu.
 *
 * Every chip id is an EXISTING chat action (`handleChip` in
 * `conversation-chat.tsx`) — the row suggests, the router still understands
 * every sentence regardless of which chips are shown.
 *
 * What is deliberately NOT here (recorded, not forgotten): user pins ("My
 * Space") and frequency-of-use — there is no pin persistence yet and funnel
 * events are write-only for the user (§C/§D of the contract are follow-up
 * infrastructure; this resolver has the extension point: add a track).
 */

import type { ChatLabels } from "@/components/app/conversation/chat/conversation-chat";

/** Owner ruling 2026-07-29 §D: the greeting offers 1–3 meaningful starts. */
export const STARTER_CAP = 3;

/** A chip whose label is resolved on the client from the ONE chat label bag —
 *  the id is the existing `handleChip` vocabulary, never a new entry point. */
export interface StarterChipSpec {
  readonly id: string;
  readonly labelKey: keyof ChatLabels;
}

/** Unknown = the read degraded. It contributes NOTHING — never a fabricated
 *  count, and never a chip that pretends to know the state. */
export type Fact = number | null;

export interface CompanyStarterFacts {
  /** `customer_requests` in an open lifecycle status for the organization. */
  readonly openDemands: Fact;
  /** `projects` the caller manages. */
  readonly projects: Fact;
  /** ACTIVE `company_workers` links (the roster). */
  readonly roster: Fact;
  /** Agency bridge — only read when the company is a staffing agency. */
  readonly clientConnectionsActive: Fact;
  readonly clientConnectionsPending: Fact;
  readonly sharedRequests: Fact;
  readonly proposals: Fact;
  /** Education — only read when the organization holds `training_provider`. */
  readonly learnersActive: Fact;
  readonly programmes: Fact;
}

export interface StarterSignals {
  readonly identity: "person" | "company";
  /** Capabilities the ACTIVE organization holds (`organization_roles`, legacy
   *  column fallback) — MANY, never one (ARCHITECTURE I-2). */
  readonly capabilities: readonly string[];
  /** `companies.company_type === 'staffing_agency'` — the industry axis the
   *  agency bridge RPCs check in SQL. Distinct from the capability axis. */
  readonly staffingAgency: boolean;
  /** The education-first reading the M10 slice already makes. */
  readonly educationFirst: boolean;
  readonly facts: CompanyStarterFacts;
  /** Person side: an ACTIVE learner link exists. */
  readonly learnerLinked: boolean;
}

export const UNKNOWN_FACTS: CompanyStarterFacts = Object.freeze({
  openDemands: null,
  projects: null,
  roster: null,
  clientConnectionsActive: null,
  clientConnectionsPending: null,
  sharedRequests: null,
  proposals: null,
  learnersActive: null,
  programmes: null,
});

/** Capability tracks a company workspace may hold. The order inside a track is
 *  "the next real step first"; the resolver takes ONE per track per round. */
export type CapabilityTrack = "employer" | "agency" | "education" | "operations";

const CHIP = {
  needWorkers: { id: "f:company.create-demand", labelKey: "chipNeedWorkers" },
  candidates: { id: "candidates", labelKey: "chipCandidates" },
  projects: { id: "projects", labelKey: "chipProjects" },
  engagements: { id: "engagements", labelKey: "chipEngagements" },
  inviteClient: { id: "f:agency.invite-client", labelKey: "chipInviteClient" },
  inviteCandidate: { id: "f:company.invite-worker", labelKey: "chipInviteCandidate" },
  clientDemand: { id: "agency:demand", labelKey: "chipClientDemand" },
  proposalStatus: { id: "agency:progress", labelKey: "chipProposalStatus" },
  inviteLearner: { id: "link:/dashboard/network?relationship=student", labelKey: "chipInviteStudent" },
  programmes: { id: "link:/dashboard/company#institution-programs-title", labelKey: "chipProgrammes" },
  eduCapabilities: { id: "link:/dashboard/company", labelKey: "chipEduCapabilities" },
  logWork: { id: "logwork", labelKey: "chipLogWork" },
  cv: { id: "cv", labelKey: "chipCv" },
  jobs: { id: "jobs", labelKey: "chipJobs" },
  learningCompass: { id: "link:/dashboard/profile#learning-compass", labelKey: "chipLearningCompass" },
} as const satisfies Record<string, StarterChipSpec>;

/** The worker default — unchanged since the §D ruling; a linked learner's
 *  first suggestion is their compass (the same person, one more context). */
export function personStarters(signals: Pick<StarterSignals, "learnerLinked">): StarterChipSpec[] {
  return signals.learnerLinked
    ? [CHIP.learningCompass, CHIP.jobs, CHIP.logWork]
    : [CHIP.logWork, CHIP.cv, CHIP.jobs];
}

/**
 * Which tracks this company workspace holds, primary first.
 *
 * - `employer` is held by EVERY company: describing a need and seeing
 *   candidates is the canonical company action (`company.create-demand`,
 *   company role), whatever else the company is. Being an agency or a school
 *   does not erase it (contract §5).
 * - `agency` requires the staffing-agency company type — the bridge RPCs
 *   refuse everyone else in SQL, and a chip that is then refused is a dead
 *   control.
 * - `education` requires the `training_provider` capability.
 * - `operations` (projects, people) is held by every company.
 *
 * The primary track decides the FIRST chip: an agency's first suggestion is
 * its client chain; an education-first institution's is its learners; a plain
 * employer's is its need. After that, round-robin.
 */
export function companyTracks(
  signals: Pick<StarterSignals, "capabilities" | "staffingAgency" | "educationFirst">,
): CapabilityTrack[] {
  const hasEducation = signals.capabilities.includes("training_provider");
  const primary: CapabilityTrack = signals.staffingAgency
    ? "agency"
    : signals.educationFirst && hasEducation
      ? "education"
      : "employer";
  const all: CapabilityTrack[] = ["employer", "operations"];
  if (signals.staffingAgency) all.push("agency");
  if (hasEducation) all.push("education");
  return [primary, ...all.filter((t) => t !== primary)];
}

/** The next real steps of one track, best first. A `null` fact never invents
 *  a step: the track then offers its capability's plain entry. */
function trackSteps(track: CapabilityTrack, f: CompanyStarterFacts): StarterChipSpec[] {
  switch (track) {
    case "employer":
      // No open need → describe one. Needs exist → the people who answered.
      return f.openDemands === 0
        ? [CHIP.needWorkers, CHIP.candidates]
        : f.openDemands === null
          ? [CHIP.needWorkers, CHIP.candidates]
          : [CHIP.candidates, CHIP.needWorkers];
    case "agency": {
      const active = f.clientConnectionsActive ?? 0;
      const pending = f.clientConnectionsPending ?? 0;
      if (f.clientConnectionsActive === null || (active === 0 && pending === 0)) {
        return [CHIP.inviteClient, CHIP.clientDemand];
      }
      if ((f.sharedRequests ?? 0) > 0 && (f.proposals ?? 0) === 0) {
        // A client shared a need and nobody was proposed yet — the one
        // unfinished step in the chain.
        return [CHIP.clientDemand, CHIP.proposalStatus];
      }
      if ((f.proposals ?? 0) > 0) return [CHIP.proposalStatus, CHIP.clientDemand];
      return [CHIP.clientDemand, CHIP.inviteClient];
    }
    case "education":
      if (f.learnersActive === 0) return [CHIP.inviteLearner, CHIP.programmes];
      if (f.programmes === 0) return [CHIP.programmes, CHIP.inviteLearner];
      return [CHIP.programmes, CHIP.inviteLearner];
    case "operations":
      // People before projects for an agency with an empty pool (the pool IS
      // its operation); otherwise the running work.
      if (f.roster === 0) return [CHIP.inviteCandidate, CHIP.projects];
      if ((f.projects ?? 0) > 0) return [CHIP.projects, CHIP.engagements];
      return [CHIP.projects, CHIP.inviteCandidate];
  }
}

/**
 * At most `STARTER_CAP` chips: one per held track per round, primary track
 * first, de-duplicated by id. A company holding one track gets that track's
 * steps; a company holding three gets one step of each — the MIX is the fix.
 */
export function companyStarters(signals: StarterSignals): StarterChipSpec[] {
  const tracks = companyTracks(signals);
  const queues = tracks.map((t) => [...trackSteps(t, signals.facts)]);
  const out: StarterChipSpec[] = [];
  const seen = new Set<string>();
  let progressed = true;
  while (out.length < STARTER_CAP && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (out.length >= STARTER_CAP) break;
      let next = queue.shift();
      while (next && seen.has(next.id)) next = queue.shift();
      if (!next) continue;
      seen.add(next.id);
      out.push(next);
      progressed = true;
    }
  }
  return out;
}

export function deriveStarters(signals: StarterSignals): StarterChipSpec[] {
  const chips = signals.identity === "company" ? companyStarters(signals) : personStarters(signals);
  return chips.slice(0, STARTER_CAP);
}

/**
 * The not-understood answer describes the capabilities of the world the
 * person stands in — composed from the tracks the workspace holds, so an
 * agency that is also an employer hears BOTH, never one role's sentence.
 * Returns phrase keys under `conversation.chat`; the server joins the
 * localized phrases into `fallbackComposed`.
 */
export type CapabilityPhraseKey =
  | "capPhraseNeedWorkers"
  | "capPhraseCandidates"
  | "capPhraseProjects"
  | "capPhraseClients"
  | "capPhraseLearners";

export function capabilityPhraseKeys(
  signals: Pick<StarterSignals, "identity" | "capabilities" | "staffingAgency" | "educationFirst">,
): CapabilityPhraseKey[] {
  if (signals.identity !== "company") return [];
  const keys: CapabilityPhraseKey[] = [];
  for (const track of companyTracks(signals)) {
    switch (track) {
      case "employer":
        keys.push("capPhraseNeedWorkers", "capPhraseCandidates");
        break;
      case "agency":
        keys.push("capPhraseClients");
        break;
      case "education":
        keys.push("capPhraseLearners");
        break;
      case "operations":
        keys.push("capPhraseProjects");
        break;
    }
  }
  return keys;
}
