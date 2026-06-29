/**
 * Job-demand risk flags (v1) — PURE. Derives honest "this could go wrong" flags
 * from MISSING critical fields + the structured confidence. A risk flag is never
 * an accusation; it tells the user what to clarify before the post is match-ready.
 */
import type { NeedStructureSuggestion } from "@/lib/structuring/structure-need";
import type { RiskFlag, JobDemandFieldKey } from "./types";
import type { JobDemandFieldScan } from "./missing-fields";

const isMissing = (scan: JobDemandFieldScan, key: JobDemandFieldKey): boolean =>
  scan.missing.some((m) => m.key === key);
const isRecognized = (scan: JobDemandFieldScan, key: JobDemandFieldKey): boolean =>
  scan.recognized.some((r) => r.key === key);

export function deriveJobDemandRiskFlags(
  scan: JobDemandFieldScan,
  structured: NeedStructureSuggestion,
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (isMissing(scan, "salary") || isMissing(scan, "grossNet"))
    flags.push({ code: "pay_unclear" });

  if (isMissing(scan, "weeklyHours") && isMissing(scan, "overtime"))
    flags.push({ code: "hours_overtime_unclear" });

  if (isMissing(scan, "legalEmployer")) flags.push({ code: "legal_employer_unclear" });

  if (isMissing(scan, "language")) flags.push({ code: "language_requirement_unclear" });

  if (isMissing(scan, "requiredDocuments")) flags.push({ code: "documents_unclear" });

  // Accommodation terms: only a risk when housing is actually in play (the
  // structured suggestion says it is provided, or the post names a type) but the
  // deduction terms are not stated — the classic "free housing?" ambiguity.
  const housingInPlay =
    isRecognized(scan, "accommodationType") ||
    (structured.accommodation != null &&
      structured.accommodation !== "not_provided");
  if (housingInPlay && isMissing(scan, "accommodationDeductions"))
    flags.push({ code: "accommodation_terms_unclear" });

  if (structured.confidence === "low" || structured.needsReview)
    flags.push({ code: "low_recognition_confidence" });

  return flags;
}
