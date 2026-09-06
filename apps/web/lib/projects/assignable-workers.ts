/**
 * The assignable-worker population for the chat's assign-to-project step —
 * PURE composition, no I/O (window 6, D5 agency-chain walk, 2026-09-06).
 *
 * WHY THIS EXISTS. The RPC `assign_worker_to_project` accepts a person on
 * either of two grounds: the caller's ACTIVE roster (`caller_manages_worker`)
 * OR an ACTIVE accepted-booking engagement with the caller's company
 * (`caller_has_booking_engagement_for_project`, bridge v1). The projects PAGE
 * already offers both populations (roster optgroup + "Priimto pasiūlymo
 * kandidatai" optgroup). The CHAT offered the roster alone, so a client who
 * had accepted an agency's candidate could assign that person on the page but
 * not in the chat — two surfaces, two truths. The owner rule: chat and page
 * reach the same state through the same reads.
 *
 * This function joins the two EXISTING reads' outputs:
 *   - roster     ← lib/company/company-workers.ts  listActiveCompanyWorkers
 *   - engagement ← lib/projects/booking-engagement-workers.ts
 *                  listBookingEngagementWorkers (caller-bound RPC, no contact
 *                  fields)
 * and nothing else. Dedup key = worker PROFILE id (the id both reads return
 * and the id the RPC takes). A person on both lists appears ONCE, labelled as
 * roster — the roster is the stronger, longer-lived relationship and the
 * label the page would show for that person in its first group.
 *
 * No third population is invented here: an id that is in neither input can
 * never appear in the output (the guard proves it).
 */

export type AssignableWorkerSource = "roster" | "engagement";

export interface AssignableWorker {
  readonly profileId: string;
  readonly name: string;
  /** Where the RPC's authority for this person comes from — the chat labels
   *  engagement candidates honestly, the way the page's optgroup does. */
  readonly source: AssignableWorkerSource;
}

export interface RosterCandidate {
  readonly profileId: string;
  readonly name: string;
}

export interface EngagementCandidate {
  readonly workerProfileId: string;
  readonly name: string;
}

/** Bound on the composed list — the roster read is capped at 50 rows and the
 *  engagement RPC returns only the caller's own ACTIVE engagements; the cap
 *  keeps the chat population bounded even if both are full. */
export const ASSIGNABLE_WORKERS_LIMIT = 100;

/**
 * Roster first (in the order given), then engagement candidates not already
 * on the roster (in the order given). Empty / whitespace profile ids are
 * dropped: an id the RPC could never resolve is not a control to offer.
 */
export function composeAssignableWorkers(
  roster: readonly RosterCandidate[],
  engagement: readonly EngagementCandidate[],
): readonly AssignableWorker[] {
  const seen = new Set<string>();
  const out: AssignableWorker[] = [];

  for (const r of roster) {
    const id = r.profileId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ profileId: id, name: r.name, source: "roster" });
  }
  for (const e of engagement) {
    const id = e.workerProfileId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ profileId: id, name: e.name, source: "engagement" });
  }
  return out.slice(0, ASSIGNABLE_WORKERS_LIMIT);
}
