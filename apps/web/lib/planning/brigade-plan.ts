import "server-only";

import { checkWorkerReservation } from "@/lib/planning/worker-reservation";
import type { ReservationWindow } from "@/lib/workforce/commitment-reservation";
import {
  planBrigadeAssignment,
  type BrigadeAssignmentPlan,
  type BrigadeMemberInput,
  type MemberConsent,
} from "@/lib/workforce/brigade-assignment";

/**
 * Server composition for the brigade primitive (B1).
 *
 * The pure resolver in `brigade-assignment.ts` decides nothing about where
 * its inputs come from. This file is the one place that answers that, and it
 * answers it out of reads that ALREADY EXIST:
 *
 *   MEMBERS + CONSENT  the team read (`lib/company/team-brigades.ts`), where a
 *                      brigade is an `organizations` row with
 *                      `organization_type='team'` and membership is the
 *                      existing `engagement_contexts` employee relationship.
 *   TIME               `checkWorkerReservation` — the same CAL-7 composition a
 *                      single-worker assignment uses, once per member.
 *   AUTHORITY          not guessed here; see below.
 *
 * ── THE CONSENT MAPPING IS THE WHOLE POINT ─────────────────────────────────
 *
 * `MemberProvenance` already distinguishes three things and this maps them
 * one-to-one, without collapsing any pair:
 *
 *   'invited' → recorded      an accepted `join_team` invitation exists, and
 *                             the team module's own words are "the accept IS
 *                             the consent".
 *   'direct'  → not_recorded  a real member added before that ledger existed.
 *                             NOT consent, and not a failure either — which is
 *                             why it blocks a team act instead of passing.
 *   'unknown' → unknown       the invitations model is not applied, so
 *                             provenance CANNOT be known. Never read as
 *                             either consent or its absence.
 *
 * ── AUTHORITY IS THE DATABASE'S ANSWER, NOT THIS FILE'S ────────────────────
 *
 * This composition does not attempt to predict `caller_manages_worker`.
 * Members arrive as `authority: "unknown"` unless the caller supplies a
 * determination it actually made. That is deliberate: the write RPCs
 * re-check authority per (project, worker) inside their own definer bodies,
 * so the database is the authority and a guess here could only ever be a
 * second, weaker copy of it that drifts. An `unknown` authority keeps the
 * member out of the affirmative answer, which is the safe direction.
 *
 * ── WHAT THIS RETURNS IS A PLAN, NEVER A COMMITMENT ────────────────────────
 *
 * Nothing here writes. The plan is meant to drive N independent per-member
 * writes through existing authority, each reporting its own outcome. It is
 * not a transaction and must never be presented as one.
 */

/** The team read's provenance vocabulary, mapped without collapsing a pair. */
export function consentFromProvenance(
  provenance: "invited" | "direct" | "unknown",
): MemberConsent {
  if (provenance === "invited") return "recorded";
  if (provenance === "direct") return "not_recorded";
  return "unknown";
}

export interface BrigadePlanMember {
  /** `workers.id`. The team read is profile-keyed, so the caller resolves
   *  this through the roster it already holds; a member whose worker row the
   *  caller cannot resolve is passed with `workerId: null` and counted as
   *  unknown rather than dropped. */
  readonly workerId: string | null;
  readonly provenance: "invited" | "direct" | "unknown";
  /** Supply only a determination actually made; omit to mean "not asked". */
  readonly authority?: "permitted" | "refused";
}

export type BrigadePlanResult =
  | { readonly kind: "ok"; readonly plan: BrigadeAssignmentPlan }
  | { readonly kind: "no-members" };

/**
 * Build a real plan for a brigade over a proposed window.
 *
 * A member the caller could not resolve to a worker row is NOT silently
 * dropped — dropping them would shrink the brigade and let a partial answer
 * look complete. They are carried with an unknown time verdict so they show
 * up in `unknownWorkerIds` and keep `wholeBrigadeEligible` false.
 */
export async function buildBrigadePlan(input: {
  readonly brigadeId: string;
  readonly members: readonly BrigadePlanMember[];
  readonly window: ReservationWindow;
  readonly exclude?: readonly string[];
}): Promise<BrigadePlanResult> {
  if (input.members.length === 0) return { kind: "no-members" };

  const resolved: BrigadeMemberInput[] = await Promise.all(
    input.members.map(async (m, i): Promise<BrigadeMemberInput> => {
      const consent = consentFromProvenance(m.provenance);
      const authority = m.authority ?? "unknown";

      if (m.workerId === null) {
        // Unresolvable member: the one honest answer is unknown on every
        // dimension the caller could not establish.
        return {
          workerId: `unresolved:${input.brigadeId}:${i}`,
          authority: "unknown",
          consent,
          time: {
            state: "unknown",
            collisions: [],
            gaps: [{ reason: "source_unreadable", source: "project" }],
          },
        };
      }

      const time = await checkWorkerReservation({
        workerId: m.workerId,
        window: input.window,
        exclude: input.exclude,
      });
      return { workerId: m.workerId, authority, consent, time };
    }),
  );

  return {
    kind: "ok",
    plan: planBrigadeAssignment({ brigadeId: input.brigadeId, members: resolved }),
  };
}
