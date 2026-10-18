import {
  matchWorkerToNeed,
  type MatchNeed,
  type MatchResultV1,
  type MatchSubject,
} from "@/lib/market/match-v1";

/**
 * A HISTORICAL PERSON IN THE ORGANIZATION'S OWN MATCHING (decision 0020, owner
 * 2026-10-07, B). Pure.
 *
 * A roster person with no account is not a worker row and is never in the
 * supply pool other employers search. The faithful, minimal behaviour is
 * ORGANIZATION-INTERNAL: the organization that supplied the history matches
 * its own roster people against its own needs, using the skills its history
 * names - labelled ORGANIZATION_REPORTED and nothing stronger.
 *
 * The subject carries NO declared skills (there is no account to declare
 * them), only `historySignals`. `matchWorkerToNeed` then counts a required
 * skill the history names as held-by-history (its own evidence class), never
 * as self-declared, journal-supported or confirmed, and never lifts
 * `evidenceConfidence` above "unverified". With no signals at all the person
 * is `insufficient_data` - unknown, not a weak fit.
 *
 * This produces a verdict for the organization's own view only. It carries no
 * record, no excerpt and no name: only the match result the shared matcher
 * returns. It is NOT a disclosure to any other organization.
 */
export interface RosterPersonSignal {
  readonly slug: string;
  readonly records: number;
}

export function rosterPersonSubject(
  signals: readonly RosterPersonSignal[] | null | undefined,
): MatchSubject {
  return {
    skills: [],
    historySignals:
      signals && signals.length > 0
        ? signals.map((s) => ({ uri: s.slug, records: s.records }))
        : undefined,
  };
}

export function matchRosterPersonToNeed(
  need: MatchNeed,
  signals: readonly RosterPersonSignal[] | null | undefined,
): MatchResultV1 {
  return matchWorkerToNeed(need, rosterPersonSubject(signals));
}
