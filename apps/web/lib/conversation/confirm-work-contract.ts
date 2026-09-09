/** How many entries awaiting confirmation the answer names. */
export const CONFIRM_CHAT_ENTRY_LIMIT = 8;
/** How many "enable review" chips the answer offers when nothing is reviewable. */
export const CONFIRM_CHAT_ENABLE_LIMIT = 4;
/** How many declared-unverified skills one confirmation may verify at once. */
export const CONFIRM_CHAT_SKILL_LIMIT = 8;

/** One journal entry awaiting the manager's confirmation — the SAME row the
 *  inbox's one-tap queue shows (`fetchQuickReviewQueue`), bounded. */
export interface ConfirmChatEntry {
  readonly entryId: string;
  readonly workerName: string;
  readonly createdAt: string;
  /** The person's own words, truncated for the line. */
  readonly excerpt: string;
  /** Deterministically recognized work slugs — display only. */
  readonly recognizedSlugs: readonly string[];
  /** The declared, NOT-yet-verified skills a confirmation would verify. */
  readonly skillsToConfirm: readonly { readonly id: string; readonly slug: string }[];
}

/** A person on the organization whose journal review is not enabled yet —
 *  their entries cannot be confirmed until a manager switches it on. */
export interface ConfirmChatNotEnabled {
  readonly engagementId: string;
  readonly name: string;
}

export type ConfirmWorkChatResult =
  | {
      readonly kind: "ok";
      readonly entries: readonly ConfirmChatEntry[];
      readonly entryTotal: number;
      readonly notEnabled: readonly ConfirmChatNotEnabled[];
      readonly enabledCount: number;
    }
  | { readonly kind: "no-company" }
  | { readonly kind: "error" };
