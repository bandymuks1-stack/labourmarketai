/**
 * THE "DESCRIBE A NEED" DOOR — one address, one event, one label (activation
 * audit 2026-10-26 §2, fixes #2 and #3).
 *
 * A company states a need in ONE place: the canonical demand intake on the
 * Needs door (`#demand-intake`). Before this module the product reached it
 * through four untracked links with seven different labels, while the only
 * tracked click pointed at an anchor the page it sat on did not have — so
 * `company_demand_action_clicked` read zero and said nothing.
 *
 * Every door into the intake now reports which door it was (`surface`), so
 * "how many companies opened the intake, and from where" is a query over
 * `pilot_events`, not a guess. The intake itself reports that it rendered
 * (`demand_form_viewed`), and the save stays server-side (`demand_saved`):
 *
 *   company_demand_action_clicked{surface} → demand_form_viewed → demand_saved
 *
 * PURE constants and one pure predicate (no React, no telemetry pipe, no
 * reads): safe to import from the client door, the chat and the guards alike. Bounded values — a surface is
 * a door name, never an id or free text.
 */

/** The ONE address of the canonical company demand intake. */
export const NEED_DOOR_HREF = "/dashboard/company/needs#demand-intake" as const;

/**
 * The doors into the intake. One value per door, so a funnel can be read per
 * door. Adding a door means adding its name here (the guard
 * `lib/guards/company-need-door.test.ts` pins that every listed door emits).
 */
export const NEED_DOOR_SURFACES = [
  /** The chat: the starter chip, the after-form follow-up, the employer bridge. */
  "chat",
  /** The company home's first-need card, shown while the company has no need. */
  "company_home_first",
  /** The home field's "missing within four weeks" box. */
  "company_home_field",
  /** The company home's row of primary actions. */
  "company_home_actions",
  /** The company context centre on the chat home (`CompanyModelScreen`). */
  "company_model",
  /** "Repeat this need" on the Needs door's own readback. */
  "company_needs_repeat",
  /** The status card on the organization's Settings door. */
  "company_settings",
  /** The success state of the company setup form. */
  "company_setup",
] as const;

export type NeedDoorSurface = (typeof NEED_DOOR_SURFACES)[number];

/**
 * FIRST, A NEED (audit fix #3): does this company meet the need door first?
 *
 * Only on a SUCCESSFUL read that holds no demand row of any status — a draft
 * or a closed need means the company has already been here; a failed read is
 * unknown, and unknown is not zero (SEP-7), so the ordinary screen stays. An
 * organization whose Needs door opens on its agency OFFER (the same audience
 * rule that page uses, `resolveNeedsAudience`) is never told to describe a
 * need. Pure: the caller passes the reads it already made.
 */
export function isFirstNeed(input: {
  readonly hasCompany: boolean;
  /** `resolveNeedsAudience(...).audience` for this organization. */
  readonly audience: "need" | "offer";
  readonly readback:
    | { readonly kind: "ok"; readonly rows: readonly { readonly direction: string }[] }
    | { readonly kind: string };
}): boolean {
  const { readback } = input;
  return (
    input.hasCompany &&
    input.audience === "need" &&
    readback.kind === "ok" &&
    "rows" in readback &&
    readback.rows.every((r) => r.direction !== "demand")
  );
}
