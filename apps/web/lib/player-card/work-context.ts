import type { WorkerPlayerCard } from "@/lib/player-card/player-card";

/**
 * LIVE WORK GRAPH — LEVEL 2: the authenticated professional's own context
 * (premium completion mission §11, continuation brief §12).
 *
 *   WORKING NOW → RECORDS → MANAGER'S RECORD → HISTORY → SKILLS → NEXT
 *
 * NO DUPLICATED TRUTH. Every node is a pure projection of the ONE
 * `WorkerPlayerCard` the profile, journal and conversation already read — the
 * same counts, the same unavailable markers. This module computes no new fact,
 * reads nothing, and invents no node: a node whose source cannot be read is
 * `unknown`, one whose source is empty is `absent`, one with data is `done`.
 *
 * UNKNOWN ≠ ZERO (SEP-7): an unreadable work history is `unknown`, never "no
 * history"; a skill count whose read failed is `unknown`, never "0 skills".
 *
 * Each node opens the REAL surface that owns its facts.
 */

export const WORK_CONTEXT_KEYS = ["current", "records", "manager", "history", "skills", "next"] as const;
export type WorkContextKey = (typeof WORK_CONTEXT_KEYS)[number];
export type WorkContextStatus = "done" | "absent" | "unknown";

export interface WorkContextNode {
  readonly key: WorkContextKey;
  readonly status: WorkContextStatus;
  /** The number the node states (null when it states names or nothing). */
  readonly count: number | null;
  /** Organization names, for `current`. */
  readonly names: readonly string[];
  /** The real route that owns this fact. */
  readonly href: string;
}

export function buildWorkContext(card: WorkerPlayerCard): readonly WorkContextNode[] {
  const unreadable = (d: WorkerPlayerCard["unavailable"][number]) => card.unavailable.includes(d);

  const currentNames = [
    ...new Set(
      card.workHistory
        .filter((h) => h.current)
        .map((h) => (h.organizationName ?? "").trim())
        .filter((n) => n.length > 0),
    ),
  ];
  const current: WorkContextNode = {
    key: "current",
    status: unreadable("workHistory") ? "unknown" : currentNames.length > 0 ? "done" : "absent",
    count: null,
    names: currentNames,
    href: "/dashboard/planning?view=week",
  };

  const records: WorkContextNode = {
    key: "records",
    status: card.evidenceEntries > 0 ? "done" : "absent",
    count: card.evidenceEntries,
    names: [],
    href: "/dashboard/journal#journal-entries",
  };

  const manager: WorkContextNode = {
    key: "manager",
    status: card.managerConfirmations > 0 ? "done" : "absent",
    count: card.managerConfirmations,
    names: [],
    href: "/dashboard/journal#journal-entries",
  };

  const history: WorkContextNode = {
    key: "history",
    status: unreadable("workHistory") ? "unknown" : card.workHistory.length > 0 ? "done" : "absent",
    count: unreadable("workHistory") ? null : card.workHistory.length,
    names: [],
    href: "/cv#cv-work-history",
  };

  // Skills the person's OWN records stand behind (journal-supported). A failed
  // read of the declared skills makes the whole node unknown, not zero.
  const skillsUnknown = unreadable("skillsDeclared") || unreadable("verifiedSkills");
  const skills: WorkContextNode = {
    key: "skills",
    status: skillsUnknown ? "unknown" : card.journalSupportedSkills + card.verifiedSkills.length > 0 ? "done" : "absent",
    count: skillsUnknown ? null : card.journalSupportedSkills + card.verifiedSkills.length,
    names: [],
    href: "/dashboard/profile#capabilities",
  };

  const next: WorkContextNode = {
    key: "next",
    status: "done", // the door always exists; it states no fact about the person
    count: null,
    names: [],
    href: "/dashboard/opportunities",
  };

  return [current, records, manager, history, skills, next];
}
