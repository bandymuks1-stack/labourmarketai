/**
 * Override receipt - the PURE half (no IO, no server-only), shared by the
 * server action and the guard test.
 *
 * A manager who keeps an assignment knowing the person is already committed
 * leaves an immutable receipt (commitment_override_receipts, written only by
 * record_commitment_override_v1). What the receipt may contain is decided
 * here AND re-enforced by the database writer (field whitelist):
 *
 *   - kind: project | booking | trip | absence | plan
 *   - overlapStart / overlapEnd (the shared days)
 *   - sourceId (a row id) for every kind EXCEPT absence
 *
 * An absence is stored as kind + dates and nothing else - no id, no label, no
 * category, no reason. No title, destination or client name is stored for any
 * kind. The reason is a CLOSED code; there is no free text anywhere.
 */

import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

export const OVERRIDE_REASON_CODES = [
  "agreed_with_worker",
  "agreed_with_client",
  "partial_overlap",
  "urgent_need",
  "other",
] as const;
export type OverrideReasonCode = (typeof OVERRIDE_REASON_CODES)[number];

export function parseOverrideReasonCode(v: unknown): OverrideReasonCode | null {
  return typeof v === "string" && (OVERRIDE_REASON_CODES as readonly string[]).includes(v)
    ? (v as OverrideReasonCode)
    : null;
}

export type ReceiptCollision =
  | { kind: "absence"; overlapStart: string; overlapEnd: string }
  | {
      kind: "project" | "booking" | "trip" | "plan";
      sourceId: string;
      overlapStart: string;
      overlapEnd: string;
    };

/** The collisions the manager was shown, reduced to what a receipt may hold. */
export function toReceiptCollisions(verdict: ReservationVerdict): ReceiptCollision[] {
  const out: ReceiptCollision[] = [];
  for (const c of verdict.collisions) {
    const kind = c.source as string;
    if (kind === "absence") {
      out.push({ kind: "absence", overlapStart: c.overlapStart, overlapEnd: c.overlapEnd });
    } else if (kind === "project" || kind === "booking" || kind === "trip" || kind === "plan") {
      out.push({
        kind,
        sourceId: c.sourceId,
        overlapStart: c.overlapStart,
        overlapEnd: c.overlapEnd,
      });
    }
  }
  return out.slice(0, 20);
}
