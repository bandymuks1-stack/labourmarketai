/**
 * Vision publication flag.
 *
 * Controls whether the public `/[locale]/vision` page is treated as
 * publicly published or as an internal / owner-preview surface.
 *
 * - **`false` (current)** — the page route stays reachable by direct URL
 *   (so the owner can run the production smoke checklist against it),
 *   but search-engine indexing is blocked (`robots: noindex,nofollow`),
 *   the public site nav drops the "Vizija / Vision" link, and the page
 *   itself renders an "internal preview — share only with owner
 *   approval" banner.
 * - **`true`** — the page becomes a normal marketing surface: index
 *   allowed, nav link visible, no preview banner.
 *
 * To flip, the owner opens a fresh PR off main, changes `VISION_PUBLIC`
 * to `true`, validates, and merges. The flip is intentionally a
 * one-line change so the review surface stays small.
 *
 * **Do not flip this flag in the same PR that ships a feature** — the
 * flip is its own owner-authored decision, paired with a smoke pass.
 */

// Widened to `boolean` (not the literal `false`) so the future flip to
// `true` is a one-line edit that doesn't ripple as a type error into
// any consumer. The flip itself is the only code change.
export const VISION_PUBLIC: boolean = false;

export type VisionPublicationState = "public" | "internal_preview";

export function getVisionPublicationState(): VisionPublicationState {
  return VISION_PUBLIC ? "public" : "internal_preview";
}

export function isVisionPublic(): boolean {
  return VISION_PUBLIC;
}
