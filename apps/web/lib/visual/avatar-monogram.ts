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
