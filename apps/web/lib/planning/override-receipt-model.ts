import { RESERVATION_SOURCES } from "@/lib/workforce/commitment-reservation";

/**
 * The CLOSED collision shape `record_commitment_override_v1` accepts: an
 * array of 1..20 entries, each a known reservation source, a row id and the
 * shared days. Checked here before the request leaves the process, and
 * checked again by the RPC — the database is the authority, this is the
 * courtesy. Pure; shared by the action and its tests.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface CollisionInput {
  readonly source: string;
  readonly sourceId: string;
  readonly overlapStart: string;
  readonly overlapEnd: string;
}

export function parseCollisions(raw: string): CollisionInput[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) return null;
  const out: CollisionInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    if (!(RESERVATION_SOURCES as readonly string[]).includes(String(c.source))) return null;
    if (typeof c.sourceId !== "string" || c.sourceId.length === 0 || c.sourceId.length > 80) return null;
    if (typeof c.overlapStart !== "string" || !ISO_DAY.test(c.overlapStart)) return null;
    if (typeof c.overlapEnd !== "string" || !ISO_DAY.test(c.overlapEnd)) return null;
    out.push({
      source: String(c.source),
      sourceId: c.sourceId,
      overlapStart: c.overlapStart,
      overlapEnd: c.overlapEnd,
    });
  }
  return out;
}

