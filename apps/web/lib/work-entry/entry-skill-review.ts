/**
 * Work Entry → Skill Review model v1 (PR #478).
 *
 * Adapts the deterministic Universal Skill Recognition core (#477) into a
 * REVIEW model for the work-entry flow: candidate skill suggestions the user
 * can accept or ignore, plus detected durations/quantities and unmapped phrases.
 *
 * Pure (no DB, no I/O, no AI). Every item stays "suggested" / not confirmed —
 * accepting one (in the UI) creates a SELF-DECLARED profile claim via the
 * existing claims path; it never verifies a skill and never invents one.
 */
import {
  recognizeUniversal,
  type RecognitionDomain,
  type RecognitionConfidence,
  type RecognizedDuration,
  type RecognizedQuantity,
} from "@/lib/structuring/universal-recognition";

export type ReviewDecision = "pending" | "accepted" | "ignored";

export interface EntryReviewItem {
  /** Stable id for UI keys + decision tracking. */
  readonly id: string;
  readonly label: string;
  readonly canonicalSlug: string | null;
  readonly domain: RecognitionDomain;
  readonly confidence: RecognitionConfidence;
  readonly reason: string;
  readonly sourcePhrase: string;
  /** Never confirmed by recognition. */
  readonly status: "suggested";
  readonly confirmed: false;
}

export interface EntrySkillReview {
  readonly items: EntryReviewItem[];
  readonly durations: RecognizedDuration[];
  readonly quantities: RecognizedQuantity[];
  readonly unmapped: { readonly phrase: string; readonly reason: string }[];
  readonly needsMoreDetail: boolean;
}

/** Build the review model for a work-entry text. */
export function buildEntrySkillReview(text: string): EntrySkillReview {
  const r = recognizeUniversal(text);
  const items: EntryReviewItem[] = r.suggestions.map((s, i) => ({
    id: s.canonicalSlug ?? `${s.domain}:${s.label}:${i}`,
    label: s.label,
    canonicalSlug: s.canonicalSlug,
    domain: s.domain,
    confidence: s.confidence,
    reason: s.reason,
    sourcePhrase: s.sourcePhrase,
    status: "suggested",
    confirmed: false,
  }));
  return {
    items,
    durations: r.signals.durations,
    quantities: r.signals.quantities,
    unmapped: r.unmapped.map((u) => ({ phrase: u.phrase, reason: u.reason })),
    needsMoreDetail: r.needsMoreDetail,
  };
}

/** Pure helper: the labels the user accepted (for the self-declared claim save). */
export function acceptedLabels(
  items: readonly EntryReviewItem[],
  decisions: Readonly<Record<string, ReviewDecision>>,
): string[] {
  return items.filter((it) => decisions[it.id] === "accepted").map((it) => it.label);
}