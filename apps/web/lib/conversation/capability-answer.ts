/**
 * "KĄ GALIU PADARYTI ŠIOJE PASKYROJE?" — ANSWERED FROM THE WORLD THE PERSON
 * IS ACTUALLY STANDING IN. Pure: no server-only import, no IO, no env.
 *
 * ── The defect this replaces ──────────────────────────────────────────────
 * The owner asked a signed-in agency workspace what it could do and was told,
 * in effect, "Įmonės erdvė". Three things caused that, and all three are
 * addressed here:
 *
 *  1. The sentence scored 0 in the deterministic router, so it fell to the
 *     generic not-understood fallback.
 *  2. That fallback DOES compose a capability sentence — `capabilityPhraseKeys`
 *     in `./starters.ts` — but its first line is
 *     `if (signals.identity !== "company") return []`. A PERSON is answered
 *     with nothing at all.
 *  3. It is composed once at PAGE LOAD and ignores `facts` entirely, so it
 *     cannot say what is worth doing NOW, and it goes stale the moment the
 *     person switches context mid-conversation.
 *
 * ── What this module is ───────────────────────────────────────────────────
 * A resolver from SIGNALS the product already reads to a SHORT, ORDERED list
 * of OUTCOMES a human would recognise. It is deliberately NOT:
 *   · a list of capability ids, routes, tables, roles or permissions — none
 *     of those words may reach a person;
 *   · every capability the workspace holds — the cap is `OUTCOME_CAP`;
 *   · a fixed menu per role — the order is decided by CURRENT STATE, and a
 *     workspace holding several tracks hears a MIX of them (the named
 *     production drift: an agency that is also an employer and runs projects
 *     was offered only three agency chips, as if being an agency erased
 *     everything else it does).
 *
 * ── The honesty rule ──────────────────────────────────────────────────────
 * UNKNOWN != EMPTY != FAILED (SEP-7).
 *   · a fact of `null` is a read that DEGRADED. It never becomes a zero, and
 *     it never suppresses the outcome it belongs to — the outcome is still
 *     offered, just without a count it cannot stand behind;
 *   · a whole-context read failure is `unreadable`, and the caller says so.
 *     "You have nothing available" is a claim about the person's account and
 *     may never be produced by our own failure.
 *
 * Reuses `companyTracks` from `./starters.ts` — the same track resolution the
 * suggestion chips already use, so the chips and this answer can never
 * describe two different workspaces.
 */
import {
  companyTracks,
  type CapabilityTrack,
  type Fact,
  type StarterSignals,
} from "@/lib/conversation/starters";

/** At most this many outcomes. "Do not dump every capability." */
export const OUTCOME_CAP = 4;

/**
 * The world the person is standing in — what the ANSWER is framed as.
 * `agency` and `education` are their own frames precisely so an agency never
 * collapses into a generic company answer.
 */
export type CapabilityContext = "person" | "employer" | "agency" | "education";

/**
 * An outcome a human would recognise, named as something they can ACHIEVE.
 * These are not capability ids and never reach the person as ids — the chat
 * resolves each to one localized sentence.
 */
export type CapabilityOutcomeKey =
  // person
  | "personCv"
  | "personFindWork"
  | "personLogWork"
  | "personProfile"
  | "personLearning"
  // employer
  | "employerNeed"
  | "employerCandidates"
  // agency
  | "agencyClients"
  | "agencyProposals"
  | "agencyRoster"
  // education
  | "eduLearners"
  | "eduProgrammes"
  // operations (shared by every organization)
  | "opsProjects"
  | "opsTeam";

export interface CapabilityOutcome {
  readonly key: CapabilityOutcomeKey;
  /**
   * A count worth saying out loud, or `null` when we do not know it. `null`
   * NEVER renders as "0" — the sentence simply drops the number.
   */
  readonly count: number | null;
}

export type CapabilityAnswer =
  | {
      readonly kind: "outcomes";
      readonly context: CapabilityContext;
      /** Present only for an organization workspace. */
      readonly organizationName: string | null;
      readonly outcomes: readonly CapabilityOutcome[];
      /** At least one contributing read degraded — say so, do not hide it. */
      readonly degraded: boolean;
    }
  | { readonly kind: "unreadable" };

export const CAPABILITY_ANSWER_UNREADABLE: CapabilityAnswer = Object.freeze({
  kind: "unreadable",
});

/** A count we can stand behind, or `null`. */
const known = (f: Fact): number | null => (typeof f === "number" ? f : null);

/**
 * The person's own outcomes, ordered by what their CURRENT state makes most
 * useful.
 *
 * The CV comes first once the product actually holds something about them —
 * seeing what an employer would see is the useful act. While nothing real is
 * known yet, BUILDING the record comes first, because showing an empty CV is
 * not an outcome. This mirrors `personStarters`' own known-state-first rule
 * rather than inventing a second opinion about the same person.
 */
function personOutcomes(signals: StarterSignals): CapabilityOutcome[] {
  const f = signals.personFacts;
  const skills = known(f?.skills ?? null);
  const history = known(f?.workHistory ?? null);
  const journal = known(f?.journalEntries ?? null);
  // ONE real signal is enough — the same generous reading
  // `personHasUsableProfile` makes. All-unknown is NOT "nothing": it keeps
  // the known-state ordering rather than pushing profile-building at someone
  // who may already have a full history we simply could not read.
  const holdsSomething = (skills ?? 0) > 0 || (history ?? 0) > 0 || (journal ?? 0) > 0;
  const allUnknown = skills === null && history === null && journal === null;

  const out: CapabilityOutcome[] = [];
  if (signals.learnerLinked) {
    // The same person, one more context — never a replacement for the rest.
    out.push({ key: "personLearning", count: null });
  }
  if (holdsSomething || allUnknown) {
    out.push({ key: "personCv", count: null });
    out.push({ key: "personFindWork", count: null });
    out.push({ key: "personLogWork", count: journal });
    out.push({ key: "personProfile", count: null });
  } else {
    out.push({ key: "personProfile", count: null });
    out.push({ key: "personCv", count: null });
    out.push({ key: "personFindWork", count: null });
    out.push({ key: "personLogWork", count: journal });
  }
  return out;
}

/**
 * The next real outcomes of ONE organization track, best first — the same
 * shape `trackSteps` uses for chips, expressed as outcomes rather than
 * buttons. A `null` fact never removes an outcome; it only removes its count.
 */
function trackOutcomes(track: CapabilityTrack, signals: StarterSignals): CapabilityOutcome[] {
  const f = signals.facts;
  switch (track) {
    case "employer": {
      const open = known(f.openDemands);
      // Needs exist → the people who answered them is the live thing.
      // None yet (or unknown) → stating a need is the first real step.
      return open !== null && open > 0
        ? [
            { key: "employerCandidates", count: open },
            { key: "employerNeed", count: null },
          ]
        : [
            { key: "employerNeed", count: null },
            { key: "employerCandidates", count: null },
          ];
    }
    case "agency": {
      const active = known(f.clientConnectionsActive);
      const shared = known(f.sharedRequests);
      const proposals = known(f.proposals);
      const roster = known(f.roster);
      if (active !== null && active === 0) {
        // No client yet — connecting one is the step that unlocks the rest.
        return [
          { key: "agencyClients", count: null },
          { key: "agencyRoster", count: roster },
        ];
      }
      if ((shared ?? 0) > 0 && (proposals ?? 0) === 0) {
        // A client shared a need and nobody has been proposed — the one
        // unfinished link in the chain.
        return [
          { key: "agencyProposals", count: shared },
          { key: "agencyClients", count: active },
          { key: "agencyRoster", count: roster },
        ];
      }
      return [
        { key: "agencyClients", count: active },
        { key: "agencyRoster", count: roster },
        { key: "agencyProposals", count: proposals },
      ];
    }
    case "education": {
      const learners = known(f.learnersActive);
      const programmes = known(f.programmes);
      if (programmes !== null && programmes === 0) {
        return [
          { key: "eduProgrammes", count: null },
          { key: "eduLearners", count: learners },
        ];
      }
      return [
        { key: "eduLearners", count: learners },
        { key: "eduProgrammes", count: programmes },
      ];
    }
    case "operations": {
      const projects = known(f.projects);
      const roster = known(f.roster);
      return projects !== null && projects > 0
        ? [
            { key: "opsProjects", count: projects },
            { key: "opsTeam", count: roster },
          ]
        : [
            { key: "opsTeam", count: roster },
            { key: "opsProjects", count: null },
          ];
    }
  }
}

/**
 * ONE outcome per held track per round, primary track first, de-duplicated.
 * A workspace holding three tracks therefore hears one of each before it
 * hears a second of any — that MIX is what stops an agency answer from
 * erasing the employer and project work the same company does.
 */
function organizationOutcomes(signals: StarterSignals): CapabilityOutcome[] {
  const queues = companyTracks(signals).map((t) => [...trackOutcomes(t, signals)]);
  const out: CapabilityOutcome[] = [];
  const seen = new Set<CapabilityOutcomeKey>();
  let progressed = true;
  while (out.length < OUTCOME_CAP && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (out.length >= OUTCOME_CAP) break;
      let next = queue.shift();
      while (next && seen.has(next.key)) next = queue.shift();
      if (!next) continue;
      seen.add(next.key);
      out.push(next);
      progressed = true;
    }
  }
  return out;
}

/** The frame the answer is spoken in. Agency and education keep their own. */
export function capabilityContextOf(signals: StarterSignals): CapabilityContext {
  if (signals.identity !== "company") return "person";
  const primary = companyTracks(signals)[0];
  return primary === "agency" ? "agency" : primary === "education" ? "education" : "employer";
}

/** True when a fact that COULD have contributed a count was unreadable. */
function isDegraded(signals: StarterSignals): boolean {
  if (signals.identity === "person") {
    const f = signals.personFacts;
    return !f || [f.skills, f.workHistory, f.journalEntries].some((x) => x === null);
  }
  // Only the tracks this workspace actually holds may make it "degraded" — an
  // employer is not missing information because an agency read it never
  // needed came back null.
  const tracks = new Set(companyTracks(signals));
  const relevant: Fact[] = [signals.facts.projects, signals.facts.roster];
  if (tracks.has("employer")) relevant.push(signals.facts.openDemands);
  if (tracks.has("agency")) {
    relevant.push(
      signals.facts.clientConnectionsActive,
      signals.facts.sharedRequests,
      signals.facts.proposals,
    );
  }
  if (tracks.has("education")) {
    relevant.push(signals.facts.learnersActive, signals.facts.programmes);
  }
  return relevant.some((x) => x === null);
}

/**
 * THE RESOLVER. Signals in, a short ordered answer out.
 *
 * It never returns an empty outcome list: every actor has SOMETHING they can
 * do, and "nothing is available" is not a truthful answer to a question about
 * a working account. A caller that cannot read the signals at all must send
 * `CAPABILITY_ANSWER_UNREADABLE` instead of empty signals.
 */
export function resolveCapabilityAnswer(
  signals: StarterSignals,
  organizationName: string | null = null,
): CapabilityAnswer {
  const context = capabilityContextOf(signals);
  const outcomes = (
    signals.identity === "company" ? organizationOutcomes(signals) : personOutcomes(signals)
  ).slice(0, OUTCOME_CAP);
  return {
    kind: "outcomes",
    context,
    organizationName: signals.identity === "company" ? organizationName : null,
    outcomes,
    degraded: isDegraded(signals),
  };
}

// ── Message-key selection ───────────────────────────────────────────────────
// Kept PURE and here, next to the resolver, so the choice between a counted
// and an uncounted phrase is unit-testable and the chat component stays a
// thin renderer that only calls `t()`.

/** The plain phrase for every outcome — the one used when no count applies. */
const OUTCOME_KEY: Record<CapabilityOutcomeKey, string> = {
  personCv: "capOutPersonCv",
  personFindWork: "capOutPersonFindWork",
  personLogWork: "capOutPersonLogWork",
  personProfile: "capOutPersonProfile",
  personLearning: "capOutPersonLearning",
  employerNeed: "capOutEmployerNeed",
  employerCandidates: "capOutEmployerCandidates",
  agencyClients: "capOutAgencyClients",
  agencyProposals: "capOutAgencyProposals",
  agencyRoster: "capOutAgencyRoster",
  eduLearners: "capOutEduLearners",
  eduProgrammes: "capOutEduProgrammes",
  opsProjects: "capOutOpsProjects",
  opsTeam: "capOutOpsTeam",
};

/**
 * The four outcomes where a real number genuinely helps the person decide.
 * Everything else reads better without one, and adding a number nobody needs
 * is how an answer starts sounding like a database report.
 */
const OUTCOME_KEY_COUNTED: Partial<Record<CapabilityOutcomeKey, string>> = {
  employerCandidates: "capOutEmployerCandidatesN",
  agencyProposals: "capOutAgencyProposalsN",
  eduLearners: "capOutEduLearnersN",
  opsProjects: "capOutOpsProjectsN",
};

/**
 * The phrase key for one outcome.
 *
 * A count is spoken ONLY when it is a real number greater than zero:
 *   · `null` is UNKNOWN — the read degraded, so the sentence drops the
 *     number rather than inventing a zero (SEP-7);
 *   · `0` is known-but-empty — "your 0 open needs" is not language, and the
 *     uncounted phrase already reads correctly for an empty workspace.
 */
export function outcomeMessageKey(outcome: CapabilityOutcome): string {
  const counted = OUTCOME_KEY_COUNTED[outcome.key];
  return counted && typeof outcome.count === "number" && outcome.count > 0
    ? counted
    : OUTCOME_KEY[outcome.key];
}

/** The frame sentence for the world the person is standing in. */
export function introMessageKey(context: CapabilityContext): string {
  switch (context) {
    case "person":
      return "capIntroPerson";
    case "agency":
      return "capIntroAgency";
    case "education":
      return "capIntroEducation";
    case "employer":
      return "capIntroEmployer";
  }
}
