/** Fallback geometric avatar — uppercase initials, max 2 chars.
 *  Pure: no fetch, no random. Same input always yields same
 *  output. Used by <WorkerCard/> + future entity cards when an
 *  owner-consented photo is unavailable, so the product never
 *  synthesises a face.
 */
export function avatarMonogram(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

/**
 * Person-identity monogram — the SINGLE source of initials for the person
 * Player Card across every identity surface (Player Card header, map own-marker,
 * any compact person card). Like {@link avatarMonogram} (max 2 uppercase
 * initials, deterministic) but null-safe and using a neutral dot fallback
 * instead of "?", which would read as an error rather than a missing name. So
 * "Jonas Petraitis" → "JP" identically on the card and on the map, never a
 * single letter on one surface and two on another.
 */
export function personMonogram(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0) return "•";
  return avatarMonogram(trimmed);
}
