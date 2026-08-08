/**
 * THE ONE class string for a text field on an authentication surface.
 *
 * WHY IT EXISTS. The identical string was copy-pasted into four forms — login,
 * signup, forgot-password and reset-password — each declaring its own local
 * `inputCls`. Every copy used `py-2.5`, which renders 42px: two pixels under
 * the product's own 44px touch floor, on the FIRST screen a new user ever
 * touches and the one they return to when something has gone wrong. Measured on
 * production at 320px and 412px, 2026-08-08.
 *
 * Four copies also meant a fix could land in one form and silently miss the
 * other three, which is exactly the shape of the drift this repo keeps finding.
 * There is one string now, and a guard asserts no auth form re-declares its own.
 *
 * `min-h-[2.75rem]` is the same 44px token used by the calendar toolbar, the
 * account menu and the feedback trigger — this adds no new convention. The
 * padding is unchanged, so the visual design is untouched: the minimum only
 * takes effect where the box was already too short.
 */
export const AUTH_INPUT_CLASS =
  "w-full min-h-[2.75rem] rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";
