import type { ReservationGap, ReservationVerdict } from "@/lib/workforce/commitment-reservation";

/**
 * The `unknown` reservation verdict in words.
 *
 * "We could not confirm these dates are free" next to "Assigned" read as a
 * failure of the assignment (local UX review 2026-10-24, row 3.6). The
 * verdict already names WHY it is incomplete (`gaps`); this picks the one
 * sentence that explains it — the undated project first, because with no
 * window nothing could be compared at all — and falls back to the generic
 * line when the caller has no reasons. Pure.
 */
export type ReservationUnknownLabels = {
  readonly reservationUnknown: string;
  readonly reservationUnknownWhy?: Partial<Record<ReservationGap["reason"], string>>;
};

const ORDER: readonly ReservationGap["reason"][] = [
  "undated_window",
  "source_unreadable",
  "undated_commitment",
];

export function unknownReason(
  verdict: Pick<ReservationVerdict, "gaps">,
  labels: ReservationUnknownLabels,
): string {
  const why = labels.reservationUnknownWhy;
  if (why) {
    const reasons = new Set(verdict.gaps.map((g) => g.reason));
    for (const r of ORDER) {
      const line = why[r];
      if (reasons.has(r) && line) return line;
    }
  }
  return labels.reservationUnknown;
}
