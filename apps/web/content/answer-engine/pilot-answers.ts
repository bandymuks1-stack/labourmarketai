/**
 * Answer Engine — localized answer content layer (versioned).
 *
 * The single place localized, human-reviewed answers live. A question becomes
 * publishable/indexable ONLY through a complete, HUMAN_APPROVED entry here (see
 * lib/answer-engine/publishing.ts). Kept as typed data OUTSIDE messages/*.json
 * (no i18n-debt / parity coupling), following the profession-problem-content
 * precedent.
 *
 * Wave 1 Publishing Engine ships this EMPTY — the engine renders an honest empty
 * hub, question routes 404, and the sitemap is empty. The pilot content PR fills
 * it with 5–10 low-risk questions across the 5 active locales.
 */
import type { LocalizedAnswer } from "@/lib/answer-engine/publishing";

export const PILOT_ANSWERS: readonly LocalizedAnswer[] = [];
