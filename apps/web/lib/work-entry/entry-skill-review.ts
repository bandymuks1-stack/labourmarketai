/**
 * Work Entry → Skill Review model v2 — cross-sector (whole labour market).
 *
 * Adapts the deterministic Universal Skill Recognition core into a REVIEW model
 * for the work-entry flow and makes the owner's required distinctions explicit:
 *
 *   - EXISTING profile skills  vs  NEW candidate skills (deduped: a skill the
 *     worker already declared is shown as evidenced-by-this-entry, never a
 *     duplicate "new" suggestion).
 *   - The ACTIVITIES performed in this entry (verbs/objects/source phrases,
 *     each tagged with its labour-market sector) — the "what I did today" view.
 *   - The date/time/duration/QUANTITY signals (durations + quantities).
 *   - The EVIDENCE SOURCE is always `work_journal` here (CV / profile / manager
 *     / client evidence comes through other paths).
 *   - The VERIFICATION STATE is always `unverified` — recognition never
 *     verifies a skill and never invents one (doctrine §7).
 *
 * Pure (no DB, no I/O, no AI). Accepting a NEW candidate (in the UI) creates a
 * SELF-DECLARED profile claim via the existing claims path; it never verifies.
 */
import {
  recognizeUniversal,
  EVIDENCE_SOURCE,
  type EvidenceSource,
  type RecognitionDomain,
  type RecognitionConfidence,
  type RecognizedDuration,
  type RecognizedQuantity,
} from "@/lib/structuring/universal-recognition";
import type { SectorKey } from "@/lib/structuring/sectors";
import { foldText } from "@/lib/structuring/normalize";

export type ReviewDecision = "pending" | "accepted" | "ignored";
export type VerificationState = "unverified";

/** A skill the worker has ALREADY declared on their profile (slug optional). */
export interface ExistingSkillRef {
  readonly slug?: string | null;
  readonly label: string;
}

export interface EntryReviewItem {
  /** Stable id for UI keys + decision tracking. */
  readonly id: string;
  readonly label: string;
  readonly canonicalSlug: string | null;
  readonly domain: RecognitionDomain;
  readonly sector: SectorKey;
  readonly confidence: RecognitionConfidence;
  readonly reason: string;
  readonly sourcePhrase: string;
  /** Never confirmed by recognition. */
  readonly status: "suggested";
  readonly confirmed: false;
  readonly evidenceSource: EvidenceSource;
  /** True when this maps to a skill already on the worker's profile. */
  readonly isExisting: boolean;
}

/** A work activity performed in this entry (the "what I did" view). */
export interface PerformedActivity {
  readonly phrase: string;
  readonly sector: SectorKey;
  readonly domain: RecognitionDomain;
}

export interface EntrySkillReview {
  /** All recognized skill items (existing + new), order-stable. */
  readonly items: EntryReviewItem[];
  /** Recognized skills the worker has ALREADY declared (evidence, not a dup). */
  readonly existingItems: EntryReviewItem[];
  /** Recognized skills NOT yet declared — new candidate/evidence signals. */
  readonly newItems: EntryReviewItem[];
  /** Activities performed in this entry, each tagged with its sector. */
  readonly activities: PerformedActivity[];
  readonly durations: RecognizedDuration[];
  readonly quantities: RecognizedQuantity[];
  readonly unmapped: { readonly phrase: string; readonly reason: string }[];
  readonly evidenceSource: EvidenceSource;
  readonly verificationState: VerificationState;
  readonly needsMoreDetail: boolean;
}

function existingMatcher(existing: readonly ExistingSkillRef[]) {
  const slugs = new Set(
    existing.map((e) => e.slug).filter((s): s is string => !!s),
  );
  const labels = new Set(existing.map((e) => foldText(e.label)).filter(Boolean));
  return (item: { canonicalSlug: string | null; label: string }): boolean => {
    if (item.canonicalSlug && slugs.has(item.canonicalSlug)) return true;
    return labels.has(foldText(item.label));
  };
}

/**
 * Build the review model for a work-entry text. Pass the worker's already-
 * declared skills so recognized ones are shown as EXISTING (evidence) rather
 * than duplicated as NEW candidates.
 */
export function buildEntrySkillReview(
  text: string,
  existingSkills: readonly ExistingSkillRef[] = [],
): EntrySkillReview {
  const r = recognizeUniversal(text);
  const isExistingSkill = existingMatcher(existingSkills);

  const items: EntryReviewItem[] = r.suggestions.map((s, i) => ({
    id: s.canonicalSlug ?? `${s.domain}:${s.label}:${i}`,
    label: s.label,
    canonicalSlug: s.canonicalSlug,
    domain: s.domain,
    sector: s.sector,
    confidence: s.confidence,
    reason: s.reason,
    sourcePhrase: s.sourcePhrase,
    status: "suggested",
    confirmed: false,
    evidenceSource: s.evidenceSource,
    isExisting: isExistingSkill({ canonicalSlug: s.canonicalSlug, label: s.label }),
  }));

  // Performed activities: each recognized skill's source phrase (sector-tagged),
  // deduped by phrase. The "what I actually did today" view.
  const activities: PerformedActivity[] = [];
  const seenPhrase = new Set<string>();
  for (const s of r.suggestions) {
    const key = foldText(s.sourcePhrase);
    if (key && !seenPhrase.has(key)) {
      seenPhrase.add(key);
      activities.push({ phrase: s.sourcePhrase, sector: s.sector, domain: s.domain });
    }
  }

  return {
    items,
    existingItems: items.filter((it) => it.isExisting),
    newItems: items.filter((it) => !it.isExisting),
    activities,
    durations: r.signals.durations,
    quantities: r.signals.quantities,
    unmapped: r.unmapped.map((u) => ({ phrase: u.phrase, reason: u.reason })),
    evidenceSource: EVIDENCE_SOURCE,
    verificationState: "unverified",
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