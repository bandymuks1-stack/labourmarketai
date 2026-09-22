/**
 * Result contract for the on-demand vacancy translation action.
 *
 * Lives beside the action rather than inside it because a `"use server"`
 * file may export ONLY async functions — a type export there compiles
 * locally and fails the CI webpack build.
 */

/** Why no rendering — never a technical enum on screen; the surface maps it. */
export type TranslateVacancyUnavailableReason =
  /** The owner has not set a translation quantity yet — nothing was spent,
   *  because there is nothing to spend from. Today's state for every plan. */
  | "not_configured"
  | "no_provider"
  | "refused"
  | "rate_limited";

export interface TranslateVacancyActionResultV1 {
  readonly kind:
    | "ready"
    | "not_needed"
    | "over_allowance"
    | "unavailable"
    | "signed_out"
    | "not_found";
  /** The rendering, when there is one. */
  readonly title?: string | null;
  readonly description?: string | null;
  readonly sourceLanguage?: string | null;
  readonly targetLocale?: string;
  readonly provider?: string | null;
  readonly reason?: TranslateVacancyUnavailableReason;
  /** What the person has left, when it is known. */
  readonly remaining?: number | null;
  readonly limit?: number | null;
  /** False while payments are off: counted honestly, not enforced. */
  readonly enforced?: boolean;
}
