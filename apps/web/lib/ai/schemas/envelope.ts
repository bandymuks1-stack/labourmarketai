/**
 * AI suggestion ENVELOPE — the structural contract every internal agent output
 * must satisfy (Internal LLM Agents v1, PR3).
 *
 * Wraps an agent-specific `data` payload with the common safety fields the
 * doctrine requires: `suggestion: true` (never a fact of record), a coarse
 * `confidence` (low/medium/high — never a fabricated numeric score), explicit
 * `evidence_refs` (canonical-row references), `missing_information`,
 * `needs_human_review`, and `blocked_claims` (what the model tried to over-claim
 * and was stripped). Everything is `.strict()` so a model can never smuggle an
 * unknown record-like field (e.g. `verified`, `total`) past the schema.
 *
 * zod only. No SDK, no network. Pure validation.
 */
import { z } from "zod";

export const AI_CONFIDENCE = ["low", "medium", "high"] as const;
export type AiConfidence = (typeof AI_CONFIDENCE)[number];

/** A pointer to the canonical source a claim is grounded in. */
export const evidenceRefSchema = z
  .object({
    source: z.string().min(1).max(64),
    ref: z.string().min(1).max(200),
  })
  .strict();
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

const shortStrings = (max = 20) => z.array(z.string().min(1).max(2000)).max(max);

export interface EnvelopeOptions {
  /** When true, the output is invalid unless it cites ≥1 evidence ref
   *  (used by the Country Readiness agent — no unsourced country answers). */
  readonly requireEvidence?: boolean;
}

/**
 * Build a strict envelope schema for an agent. `agentKey` is pinned as a literal
 * so an output for the wrong agent is rejected. `data` is the agent-specific
 * (also strict) payload schema.
 */
export function aiEnvelopeSchema<TData extends z.ZodTypeAny>(
  agentKey: string,
  data: TData,
  opts: EnvelopeOptions = {},
) {
  const evidence = opts.requireEvidence
    ? z.array(evidenceRefSchema).min(1).max(50)
    : z.array(evidenceRefSchema).max(50);
  return z
    .object({
      suggestion: z.literal(true),
      agent: z.literal(agentKey),
      confidence: z.enum(AI_CONFIDENCE),
      evidence_refs: evidence,
      missing_information: shortStrings(),
      needs_human_review: z.boolean(),
      blocked_claims: shortStrings(),
      data,
    })
    .strict();
}

/** Record-like field names that may NEVER appear on an AI suggestion's data.
 *  Re-exported for guards to assert the per-agent data schemas reject them. */
export const FORBIDDEN_DATA_FIELDS = [
  "verified",
  "confirmed",
  "verification_status",
  "is_verified",
  "approved",
  "legal_guarantee",
  "guaranteed",
  "total",
  "price",
  "rate",
  "score",
  "match_score",
  "ovr",
] as const;
