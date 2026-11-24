/**
 * Central catalogue of suggestion statuses the product is allowed to show.
 *
 * Today only `detected`, `confirmed_by_user`, `discarded_by_user`,
 * `needs_more_detail` and `needs_external_confirmation` have UI. The
 * `externally_confirmed` row exists as a documented future state — but it
 * is `availability: "preparing"` here, and UI surfaces must NOT render it
 * for arbitrary records (PLATFORM_DOCTRINE §7 — no fake verification).
 *
 * UI surfaces (suggestion card, applied trail) read from this file so the
 * honest wording stays consistent and any future status addition is a
 * one-line change.
 */

export type Availability = "active" | "preparing" | "hidden";

export type SuggestionStatusId =
  | "detected"
  | "confirmed_by_user"
  | "discarded_by_user"
  | "needs_more_detail"
  | "needs_external_confirmation"
  | "externally_confirmed";

export type SuggestionStatusRow = {
  id: SuggestionStatusId;
  /** i18n key for the label (look under `suggestionStatuses.*`). */
  labelKey: string;
  /** Whether this status can appear next to a user-controlled
   *  user-confirmed fact today. `externally_confirmed` flips to `active`
   *  only once a manager / client / external reviewer signs off, which
   *  ships with the PR #18 audit / RLS / RPC machinery. */
  availability: Availability;
};

export const SUGGESTION_STATUSES: readonly SuggestionStatusRow[] = [
  {
    id: "detected",
    labelKey: "suggestionStatuses.detected",
    availability: "active",
  },
  {
    id: "confirmed_by_user",
    labelKey: "suggestionStatuses.confirmed_by_user",
    availability: "active",
  },
  {
    id: "discarded_by_user",
    labelKey: "suggestionStatuses.discarded_by_user",
    availability: "active",
  },
  {
    id: "needs_more_detail",
    labelKey: "suggestionStatuses.needs_more_detail",
    availability: "active",
  },
  {
    id: "needs_external_confirmation",
    labelKey: "suggestionStatuses.needs_external_confirmation",
    availability: "active",
  },
  {
    id: "externally_confirmed",
    labelKey: "suggestionStatuses.externally_confirmed",
    // Preparing: real external confirmation flow ships with PR #18 review
    // (issue #32). UI MUST NOT render this status today. The guard test
    // enforces it.
    availability: "preparing",
  },
] as const;

export const SUGGESTION_STATUS_BY_ID: Record<
  SuggestionStatusId,
  SuggestionStatusRow
> = Object.fromEntries(SUGGESTION_STATUSES.map((s) => [s.id, s])) as Record<
  SuggestionStatusId,
  SuggestionStatusRow
>;

/** Statuses safe to render in user-facing UI today. */
export const ACTIVE_SUGGESTION_STATUS_IDS: readonly SuggestionStatusId[] =
  SUGGESTION_STATUSES.filter((s) => s.availability === "active").map(
    (s) => s.id,
  );
