import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";
import type { ProjectActionResult } from "@/lib/projects/actions";

/**
 * A WHOLE TEAM ONTO A PROJECT — the pure half (WRK-6).
 *
 * A team is assigned person by person through the ONE existing write
 * (`assignWorkerToProjectAction` → `assign_worker_to_project`), so each member
 * is admitted or refused by the database's own gates. This file only turns each
 * member's existing answer into ONE explicit outcome. There is no team ↔
 * project record and no atomic "brigade commit": a partial result is a true
 * result and is shown as one.
 *
 * Outcomes, never merged:
 *   assigned          written; the person's dates are confirmed free
 *   calendar_unknown  written; the dates could NOT be confirmed free (not "free")
 *   calendar_conflict written; the person already holds time on those dates —
 *                     a warning, never an undo (SEP-2); alternatives come from
 *                     the existing conflict flow
 *   refused           the database refused this person for this project (42501)
 *   error             any other failure; nothing was written for this person
 */
export type TeamMemberOutcome =
  | "assigned"
  | "calendar_unknown"
  | "calendar_conflict"
  | "refused"
  | "error";

export interface TeamMemberResult {
  readonly profileId: string;
  readonly name: string;
  readonly outcome: TeamMemberOutcome;
  /** Present for calendar_conflict. */
  readonly reservation?: ReservationVerdict;
  /** Colleagues confirmed free on the same dates (existing conflict flow). */
  readonly alternatives?: readonly { profileId: string; name: string }[];
}

export function memberOutcomeOf(
  profileId: string,
  name: string,
  r: ProjectActionResult,
): TeamMemberResult {
  if (!r.ok) {
    return { profileId, name, outcome: r.code === "not_authorized" ? "refused" : "error" };
  }
  // A check that could not run is UNKNOWN, never clear.
  if (!r.reservation || r.reservation.state === "unknown") {
    return { profileId, name, outcome: "calendar_unknown" };
  }
  if (r.reservation.state === "collides") {
    return {
      profileId,
      name,
      outcome: "calendar_conflict",
      reservation: r.reservation,
      alternatives: r.alternatives ?? [],
    };
  }
  return { profileId, name, outcome: "assigned" };
}

export function summariseTeamAssignment(members: readonly TeamMemberResult[]): {
  readonly written: number;
  readonly refused: number;
  readonly failed: number;
  readonly conflicts: number;
  readonly unknown: number;
} {
  let written = 0;
  let refused = 0;
  let failed = 0;
  let conflicts = 0;
  let unknown = 0;
  for (const m of members) {
    if (m.outcome === "refused") refused += 1;
    else if (m.outcome === "error") failed += 1;
    else {
      written += 1;
      if (m.outcome === "calendar_conflict") conflicts += 1;
      if (m.outcome === "calendar_unknown") unknown += 1;
    }
  }
  return { written, refused, failed, conflicts, unknown };
}
