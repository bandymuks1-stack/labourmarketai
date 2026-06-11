/**
 * Thermometer (S4) — the OWNER-LOCKED formula:
 *
 *   score = (position average in project + admin-entered market average) / 2
 *
 * Iron rule (doctrine §7): a score exists ONLY when BOTH components exist.
 * Anything missing → `insufficient_data` naming exactly WHICH component is
 * missing — never an invented number, never a silent zero. Pure +
 * deterministic so the guard can pin it with fixtures.
 *
 * Component semantics (Step-0 inventory, 2026-06-10):
 *  - positionAvgEur: average of the salary-expectation midpoints
 *    (workers.salary_min_eur / salary_max_eur, monthly EUR) of the workers
 *    ACTIVELY assigned to the same project — there is NO actual per-position
 *    pay ledger in the platform today, so the only real data is the
 *    worker-declared expectation range; the UI must label it as such.
 *  - marketAvgEur: admin-entered market average (market_rate_averages,
 *    monthly EUR, hand-sourced).
 */

export type ThermometerInput = {
  /** Average declared-salary midpoint of active workers in the project, EUR/month. */
  readonly positionAvgEur: number | null;
  /** Admin-entered market average for profession × country, EUR/month. */
  readonly marketAvgEur: number | null;
};

export type ThermometerResult =
  | { readonly kind: "score"; readonly scoreEur: number }
  | {
      readonly kind: "insufficient_data";
      readonly missing: "position" | "market" | "both";
    };

export function computeThermometer(input: ThermometerInput): ThermometerResult {
  const hasPosition =
    typeof input.positionAvgEur === "number" &&
    Number.isFinite(input.positionAvgEur) &&
    input.positionAvgEur > 0;
  const hasMarket =
    typeof input.marketAvgEur === "number" &&
    Number.isFinite(input.marketAvgEur) &&
    input.marketAvgEur > 0;

  if (!hasPosition && !hasMarket) {
    return { kind: "insufficient_data", missing: "both" };
  }
  if (!hasPosition) return { kind: "insufficient_data", missing: "position" };
  if (!hasMarket) return { kind: "insufficient_data", missing: "market" };

  return {
    kind: "score",
    scoreEur:
      Math.round(((input.positionAvgEur as number) + (input.marketAvgEur as number)) / 2),
  };
}

/** Midpoint of a worker-declared salary range; null when no usable data. */
export function salaryMidpoint(
  min: number | null | undefined,
  max: number | null | undefined,
): number | null {
  const lo = typeof min === "number" && Number.isFinite(min) && min > 0 ? min : null;
  const hi = typeof max === "number" && Number.isFinite(max) && max > 0 ? max : null;
  if (lo === null && hi === null) return null;
  if (lo === null) return hi;
  if (hi === null) return lo;
  return (lo + hi) / 2;
}

/** Average of midpoints; null when the list is empty (never a fake zero). */
export function averageMidpoint(
  midpoints: ReadonlyArray<number | null>,
): number | null {
  const real = midpoints.filter(
    (m): m is number => typeof m === "number" && Number.isFinite(m) && m > 0,
  );
  if (real.length === 0) return null;
  return real.reduce((a, b) => a + b, 0) / real.length;
}
