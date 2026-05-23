/**
 * Single source of truth for which product features are usable today. UI
 * gates (chips, CTAs, nav items) read from this file so honest "preparing"
 * states do not drift between surfaces.
 *
 * Not a feature-flag system — it is a *declared* availability map. Flag
 * toggles (e.g. `visibility.public_proof`) live in the database (see
 * PR #18 / issue #32) and are layered ON TOP of these defaults.
 */

export type Availability = "active" | "preparing" | "hidden";

export type FeatureId =
  | "worker.profile.text_first"
  | "worker.profile.manual_picker"
  | "worker.journal.text_first"
  | "worker.journal.manual_form"
  | "worker.suggestions.user_confirm"
  | "worker.suggestions.external_confirm"
  | "company.pilot_request"
  | "company.role_management"
  | "agency.pool"
  | "customer.bookings"
  | "matching.engine"
  | "score.universal"
  | "ai.extraction"
  | "ai.verification";

export type FeatureRow = {
  id: FeatureId;
  availability: Availability;
  /** Short reason if not active — surfaces "Ruošiama" / "Preview" tags can
   *  show this verbatim or as a tooltip. */
  preparingReasonKey?: string;
};

export const FEATURES: readonly FeatureRow[] = [
  // What works today.
  { id: "worker.profile.text_first", availability: "active" },
  { id: "worker.profile.manual_picker", availability: "active" },
  { id: "worker.journal.text_first", availability: "active" },
  { id: "worker.journal.manual_form", availability: "active" },
  { id: "worker.suggestions.user_confirm", availability: "active" },
  { id: "company.pilot_request", availability: "active" },

  // Honestly preparing.
  {
    id: "worker.suggestions.external_confirm",
    availability: "preparing",
    preparingReasonKey: "auth.dashboard.account.preview_workspace",
  },
  {
    id: "company.role_management",
    availability: "preparing",
    preparingReasonKey: "auth.dashboard.account.preview_workspace",
  },
  {
    id: "agency.pool",
    availability: "preparing",
    preparingReasonKey: "auth.dashboard.account.preview_workspace",
  },
  {
    id: "customer.bookings",
    availability: "preparing",
    preparingReasonKey: "auth.dashboard.account.preview_workspace",
  },

  // Explicitly out of scope. These rows exist so the honesty guards have a
  // canonical place to enforce "we don't ship matching / scoring / AI".
  { id: "matching.engine", availability: "hidden" },
  { id: "score.universal", availability: "hidden" },
  { id: "ai.extraction", availability: "hidden" },
  { id: "ai.verification", availability: "hidden" },
] as const;

export const FEATURE_BY_ID: Record<FeatureId, FeatureRow> = Object.fromEntries(
  FEATURES.map((f) => [f.id, f]),
) as Record<FeatureId, FeatureRow>;

export function isFeatureActive(id: FeatureId): boolean {
  return FEATURE_BY_ID[id]?.availability === "active";
}
