/**
 * Attach readiness to a match result WITHOUT touching fit. The returned object
 * is the input plus one `readiness` property; every fit field (status, score
 * inputs, eligibility, reasons, gaps, ordering) is the same reference.
 */
import type { MatchResultV1 } from "@/lib/market/match-v1";
import type { ReadinessSummary } from "./readiness-model";

export function attachReadiness(match: MatchResultV1, readiness: ReadinessSummary): MatchResultV1 {
  return { ...match, readiness };
}
