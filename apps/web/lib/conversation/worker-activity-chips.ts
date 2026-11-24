import type { ReadinessPillarKey } from "@/lib/player-card/readiness";

/**
 * Which profile ACTION genuinely closes which readiness pillar. PURE — shared
 * by the chat surface (follow-up chips under the profile summary) and the
 * opening brief (the server picks the one chip that closes the first reported
 * gap).
 *
 * Keyed by the Player Card's readiness pillars (W5: ONE completeness source —
 * the chat reports the same pillars the card renders, so a recommendation
 * must close a PILLAR, not a step from a parallel model).
 *
 * Deliberately PARTIAL. `profession`, `skills`, `journal` and `evidence` have
 * no chip here — the profession is set on the profile screen, skills are
 * recognised from the CV or the work journal, and journal evidence grows by
 * logging real work (the opening brief already surfaces "log today's work"
 * from the planning read when that is the actual gap) — so when one of those
 * is the first gap the caller simply offers no recommendation. That is the
 * honest outcome: a recommendation exists only where a listed action really
 * closes the gap the server reported.
 */
export const CHIP_FOR_STEP: Partial<Record<ReadinessPillarKey, string>> = {
  availability: "f:worker.save-work-card",
  workCard: "f:worker.save-work-card",
};
