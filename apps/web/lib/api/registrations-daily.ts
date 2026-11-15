/**
 * REGISTRATIONS DAILY — the wire body of `GET /api/internal/registrations-daily/v1` (pure; no I/O).
 *
 * Owner decision 2026-11-14: measure NEW and ACTIVE separately for five platform groups — workers, employers,
 * agencies, students, education institutions. The database aggregate (`lm_registrations_daily_v1`, migration
 * 20261114120000) returns `{REAL, TEST, INTERNAL}` integers per group and metric; this module publishes REAL only and
 * applies the small-cell rule before anything leaves this product. Contract: docs/contracts/LM_REGISTRATIONS_DAILY_V1.md.
 *
 * Independent of the growth-daily export (PR #2886) but deliberately consistent with it: the same REAL population rule
 * (ops_product_metrics_v1), the same `{ count, suppressed }` cell and the same rule that 1 and 2 are never published.
 *
 * FAIL CLOSED. A malformed aggregate — a missing group, a missing metric, a count that is not a non-negative integer —
 * is null → 503. A missing count is an outage, never a zero. Only an explicit `null` from the aggregate, or an ACTIVE
 * metric for a day it cannot describe, is `unmeasured`.
 */

export const REGISTRATIONS_DAILY_DEFINITION_VERSION = "lm-registrations-daily/v1" as const;

/** No published number is below this, other than zero. */
export const MIN_CELL = 3;

export const REGISTRATION_GROUPS = ["workers", "employers", "agencies", "students", "education"] as const;
export const REGISTRATION_METRICS = ["new", "active7d", "active30d"] as const;

export type RegistrationGroup = (typeof REGISTRATION_GROUPS)[number];
export type RegistrationMetric = (typeof REGISTRATION_METRICS)[number];

export type RegistrationCell =
  | { readonly count: number; readonly suppressed: false }
  | { readonly count: null; readonly suppressed: true }
  | { readonly count: null; readonly suppressed: false; readonly unmeasured: true };

export type RegistrationGroupCells = Readonly<Record<RegistrationMetric, RegistrationCell>>;

export interface RegistrationsDailyBody {
  readonly definitionVersion: typeof REGISTRATIONS_DAILY_DEFINITION_VERSION;
  readonly day: string;
  readonly population: "REAL";
  readonly generatedAt: string;
  readonly groups: Readonly<Record<RegistrationGroup, RegistrationGroupCells>>;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * `?day=YYYY-MM-DD` (UTC). Required. A malformed or non-calendar date, or a day after today (UTC), is refused.
 * Today is allowed: its NEW counts are partial until the day ends (the consumer stores `generatedAt`).
 */
export function resolveRegistrationsDay(param: string | null, nowMs: number): { ok: true; day: string } | { ok: false } {
  if (param === null || !DAY_RE.test(param)) return { ok: false };
  const ms = Date.parse(`${param}T00:00:00Z`);
  if (!Number.isFinite(ms) || utcDay(ms) !== param) return { ok: false };
  if (param > utcDay(nowMs)) return { ok: false };
  return { ok: true, day: param };
}

/**
 * ACTIVE is measured from the latest sign-in (auth stores only the LATEST one) and recent production events, both as of
 * read time. A past day cannot be reconstructed from that, so ACTIVE is published only for today and yesterday (UTC).
 */
export function activeIsMeasurable(day: string, nowMs: number): boolean {
  return day >= utcDay(nowMs - DAY_MS);
}

/** Zero and anything at or above `MIN_CELL` are published; 1 and 2 are withheld. */
export function suppressCount(n: number): RegistrationCell {
  return n === 0 || n >= MIN_CELL ? { count: n, suppressed: false } : { count: null, suppressed: true };
}

export const UNMEASURED: RegistrationCell = Object.freeze({ count: null, suppressed: false, unmeasured: true });

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * One metric from the aggregate: `null` = unmeasured, `{REAL, TEST, INTERNAL}` = the REAL count (TEST and INTERNAL are
 * read only to prove the shape and are never published). Anything else is `undefined` → the whole body fails closed.
 */
function readMetric(raw: unknown): RegistrationCell | undefined {
  if (raw === null) return UNMEASURED;
  const split = asObject(raw);
  if (!split) return undefined;
  if (!isCount(split.REAL) || !isCount(split.TEST) || !isCount(split.INTERNAL)) return undefined;
  return suppressCount(split.REAL);
}

/** The body, or null (→ 503) when the aggregate is missing a group or metric or holds anything but counts. */
export function buildRegistrationsDaily(
  raw: unknown,
  day: string,
  nowMs: number,
): RegistrationsDailyBody | null {
  const groupsRaw = asObject(asObject(raw)?.groups);
  if (!groupsRaw) return null;
  const activeOk = activeIsMeasurable(day, nowMs);
  const groups = {} as Record<RegistrationGroup, RegistrationGroupCells>;
  for (const group of REGISTRATION_GROUPS) {
    const metricsRaw = asObject(groupsRaw[group]);
    if (!metricsRaw) return null;
    const cells = {} as Record<RegistrationMetric, RegistrationCell>;
    for (const metric of REGISTRATION_METRICS) {
      if (!(metric in metricsRaw)) return null;
      const cell = readMetric(metricsRaw[metric]);
      if (cell === undefined) return null;
      cells[metric] = metric !== "new" && !activeOk ? UNMEASURED : cell;
    }
    groups[group] = cells;
  }
  return {
    definitionVersion: REGISTRATIONS_DAILY_DEFINITION_VERSION,
    day,
    population: "REAL",
    generatedAt: new Date(nowMs).toISOString(),
    groups,
  };
}
