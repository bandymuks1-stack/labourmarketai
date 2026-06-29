/**
 * Offer–Demand recognition layer (v1) — public surface.
 *
 * Pure, deterministic, no DB/IO. Normalizes the existing engines (structureNeed,
 * matchWorkerToNeed, readiness derivations) into one recognition vocabulary.
 * Persistence, message delivery and weekly-digest aggregation are owner-approval-
 * gated (see runtime/audits/offer-demand-operations-recognition-participation-v1.md).
 */
export * from "./types";
export { detectJobDemandFields, type JobDemandFieldScan } from "./missing-fields";
export { deriveJobDemandRiskFlags } from "./risk-flags";
export { recognizeJobDemand, type JobDemandInput } from "./recognize-job-demand";
export { explainTopMatches, type MatchCandidate } from "./match-explanation";
export {
  classifyParticipation,
  buildPrivateProgressMessage,
  type ParticipationInput,
} from "./participation";
export { buildWeeklyPublicDigest } from "./weekly-digest";
