import type { WorkerProfileStep } from "@/lib/conversation/worker-activity";

/**
 * Which profile ACTION genuinely fixes which checkpoint. PURE — shared by the
 * chat surface (follow-up chips under the profile summary) and the opening
 * brief (the server picks the one chip that closes the first reported gap).
 *
 * Deliberately PARTIAL. `about` and `skills` have no chip here — about text is
 * edited on the profile screen and skills are recognised from the CV or the
 * work journal — so when one of those is the first gap the caller simply
 * offers no recommendation. That is the honest outcome: a recommendation
 * exists only where a listed action really closes the gap the server reported.
 */
export const CHIP_FOR_STEP: Partial<Record<WorkerProfileStep, string>> = {
  languages: "f:worker.add-language",
  workHistory: "f:worker.add-work-history",
  availability: "f:worker.save-work-card",
};
