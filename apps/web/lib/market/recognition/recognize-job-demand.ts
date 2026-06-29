/**
 * recognizeJobDemand (v1) — PURE composition. Turns a pasted/typed job demand
 * into a normalized RecognizedJobDemand by COMPOSING the existing engines:
 *   structureNeed (identity) + detectJobDemandFields (detail) + risk flags.
 * It persists nothing and contacts no one; the next action hands off to an
 * EXISTING real submission surface.
 */
import { structureNeed } from "@/lib/structuring/structure-need";
import { detectJobDemandFields } from "./missing-fields";
import { deriveJobDemandRiskFlags } from "./risk-flags";
import type {
  RecognizedJobDemand,
  NextAction,
  RecognitionConfidence,
} from "./types";

export interface JobDemandInput {
  readonly rawText?: string | null;
  readonly role?: string | null;
  readonly location?: string | null;
  readonly notes?: string | null;
}

/** Existing demand-intake surface (reuse — never a new write path). */
const DEMAND_INTAKE_HREF = "/dashboard";

export function recognizeJobDemand(input: JobDemandInput): RecognizedJobDemand {
  const structured = structureNeed({
    role: input.role,
    description: input.rawText,
    location: input.location,
    notes: input.notes,
  });

  const combined = [input.role, input.rawText, input.location, input.notes]
    .filter(Boolean)
    .join("\n");
  const scan = detectJobDemandFields(combined);
  const risks = deriveJobDemandRiskFlags(scan, structured);

  const confidence: RecognitionConfidence = structured.confidence;

  // Important missing fields decide the next action — never a dead end. When key
  // details are missing we point at completing them; otherwise at the existing
  // real submission surface.
  const importantMissing = scan.missing.filter((m) => m.severity === "important");
  const nextAction: NextAction =
    importantMissing.length > 0
      ? { code: "complete_missing_fields", href: DEMAND_INTAKE_HREF }
      : { code: "submit_demand", href: DEMAND_INTAKE_HREF };

  return {
    intent: "need_workers",
    structured,
    recognized: scan.recognized,
    missing: scan.missing,
    risks,
    confidence,
    nextAction,
  };
}
