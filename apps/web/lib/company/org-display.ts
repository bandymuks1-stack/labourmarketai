/**
 * THE org display-name rule (W4 Slice 3).
 *
 * Six surfaces each hand-rolled `display_name → legal_name` — and one of
 * them (the agency invitation branch) skipped `display_name` outright, so
 * an agency could appear under its legal name on invitations while every
 * other surface showed its display name. One helper, one rule, no drift.
 *
 * Pure + null-safe: blank strings count as absent; null means "no stored
 * name" — callers render their own honest fallback (org type / relationship
 * label), NEVER an invented "Unknown company".
 */
/** Bound for organizations.description ("use server" files may export only
 *  async functions, so the constant lives here beside the org helpers). */
export const ORG_DESCRIPTION_MAX = 2000;

export function orgDisplayName(
  displayName: string | null | undefined,
  legalName: string | null | undefined,
): string | null {
  const display = displayName?.trim();
  if (display) return display;
  const legal = legalName?.trim();
  if (legal) return legal;
  return null;
}
