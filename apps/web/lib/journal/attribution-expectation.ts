/**
 * What kind of skill-time attribution the person's KIND OF WORK can honestly
 * support — the owner's matrix column `skillTimeAttribution`, read by the
 * analytics layer for the first time (issue #1689, 2026-09-12; the flag was
 * declared "an honesty flag that tells the analytics layer which attribution
 * the evidence CAN support" in `work-evidence-archetypes.ts` and read by
 * nothing).
 *
 * Why it matters to a worker: a cleaner's or a shop assistant's hours are
 * recorded per SHIFT as a rule, so the skills block shows them as
 * involvement — which, without this reading, looks like a failure to record
 * properly. A driver's work knows the duration of every leg, so involvement
 * there is a missed attribution the person can fix by giving the time next
 * to each activity. The reading names which of the two the person is in,
 * ONLY when the figures actually show the pattern; otherwise it says nothing.
 *
 * Pure. Reads the ONE composition (`composeJournal` over the ISCO groups of
 * the person's own occupation path) and the ONE model (`WorkIntelligence`).
 * Never a score, never a licence to invent hours; withheld from the
 * organization audience by the caller (a reading of the person's own work).
 */
import {
  archetypesForIsco,
  composeJournal,
  type SkillTimeAttribution,
  type TimeModel,
} from "@/lib/journal/work-evidence-archetypes";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";

export type AttributionExpectationReason =
  /** Shift-type work: per-skill hours are not expected; involvement is normal. */
  | "involvement_expected"
  /** Per-activity durations are the norm for this work, yet most hours here
   *  reached no single skill — the person can attribute them. */
  | "precise_possible";

export type AttributionExpectation = {
  readonly attribution: SkillTimeAttribution;
  readonly timeModel: TimeModel;
  /** The sentence to show, or null when the figures do not show the pattern. */
  readonly reason: AttributionExpectationReason | null;
  /** Hours no single skill claimed (shared + multi-activity + unattributed). */
  readonly unclaimedHours: number;
  readonly attributedHours: number;
};

/**
 * `null` when the person's occupation path resolves to no archetype (UNKNOWN,
 * never a default reading) or when nothing was recorded in the focus window.
 */
export function deriveAttributionExpectation(
  iscoGroups: readonly string[],
  wi: Pick<
    WorkIntelligence,
    "attributedHours" | "sharedHours" | "multiActivityHours" | "unattributedHours"
  >,
): AttributionExpectation | null {
  const archetypes = [...new Set(iscoGroups.flatMap((code) => archetypesForIsco(code)))];
  if (archetypes.length === 0) return null;
  const composition = composeJournal(archetypes);
  const unclaimedHours = wi.sharedHours + wi.multiActivityHours + wi.unattributedHours;
  const attributedHours = wi.attributedHours;
  if (unclaimedHours + attributedHours <= 0) return null;
  const mostlyUnclaimed = unclaimedHours > attributedHours;
  let reason: AttributionExpectationReason | null = null;
  if (mostlyUnclaimed && composition.skillTimeAttribution === "involvement") {
    reason = "involvement_expected";
  } else if (mostlyUnclaimed && composition.skillTimeAttribution === "precise") {
    reason = "precise_possible";
  }
  return {
    attribution: composition.skillTimeAttribution,
    timeModel: composition.timeModel,
    reason,
    unclaimedHours,
    attributedHours,
  };
}
