/**
 * Public Intake Owner Queue v1 — shared status values.
 *
 * The closed operator status set, split out with NO `server-only` guard so it
 * can be imported by BOTH the server data layer (company-need-intakes.ts) and
 * the client status control (company-need-intake-status.tsx) without pulling
 * server-only code into the client bundle.
 */
export const COMPANY_NEED_INTAKE_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "rejected",
  // Canonical-journey P3: the intake was claimed by the company itself
  // (email-verified account) and continued as a real draft demand — the
  // public intake is no longer a dead end. Set ONLY by the claim bridge
  // (lib/company/claim-public-intake.ts), shown read-only in the queue.
  "converted",
] as const;

export type CompanyNeedIntakeStatus =
  (typeof COMPANY_NEED_INTAKE_STATUSES)[number];

/** The statuses an OPERATOR may set by hand in the queue. `converted` is
 *  excluded — it is written only by the company's own claim action, so the
 *  operator can never claim a conversion that did not happen. */
export const COMPANY_NEED_INTAKE_OPERATOR_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "rejected",
] as const;

export type CompanyNeedIntakeOperatorStatus =
  (typeof COMPANY_NEED_INTAKE_OPERATOR_STATUSES)[number];

/**
 * UNHANDLED-REQUEST CONTROL (owner P0 2026-11-13). PURE.
 *
 * A request is UNHANDLED while its status is `new`: nobody has marked a next
 * step. The administrator sees how many there are, how long the oldest has
 * waited, and which have waited longer than the internal threshold.
 *
 * The threshold is an INTERNAL control for the operator, configurable without a
 * code change (`LM_INTAKE_OVERDUE_HOURS`). It is not a promise to the sender:
 * no page and no e-mail tells a person when they will be answered.
 */
export const DEFAULT_INTAKE_OVERDUE_HOURS = 24;

export function intakeOverdueHours(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = (env.LM_INTAKE_OVERDUE_HOURS ?? "").trim();
  if (!/^\d{1,4}$/.test(raw)) return DEFAULT_INTAKE_OVERDUE_HOURS;
  const n = Number(raw);
  return n >= 1 && n <= 720 ? n : DEFAULT_INTAKE_OVERDUE_HOURS;
}

/** Whole hours a row has waited; null when its time cannot be read (never 0). */
export function intakeWaitingHours(createdAt: string, nowMs: number): number | null {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 3_600_000));
}

export function isIntakeOverdue(
  row: { readonly status: string; readonly createdAt: string },
  nowMs: number,
  overdueHours: number,
): boolean {
  if (row.status !== "new") return false;
  const waited = intakeWaitingHours(row.createdAt, nowMs);
  return waited !== null && waited >= overdueHours;
}

export interface UnhandledIntakeSummary {
  readonly count: number;
  readonly overdueCount: number;
  /** Hours the oldest unhandled row has waited; null when there is none. */
  readonly oldestWaitingHours: number | null;
}

export function unhandledIntakeSummary(
  rows: readonly { readonly status: string; readonly createdAt: string }[],
  nowMs: number,
  overdueHours: number,
): UnhandledIntakeSummary {
  const unhandled = rows.filter((r) => r.status === "new");
  const waits = unhandled
    .map((r) => intakeWaitingHours(r.createdAt, nowMs))
    .filter((h): h is number => h !== null);
  return {
    count: unhandled.length,
    overdueCount: unhandled.filter((r) => isIntakeOverdue(r, nowMs, overdueHours)).length,
    oldestWaitingHours: waits.length ? Math.max(...waits) : null,
  };
}

/**
 * Queue order: unhandled first and OLDEST first (the one that has waited longest
 * is the next to answer), then the handled ones, most recent first.
 */
export function compareIntakesForQueue(
  a: { readonly status: CompanyNeedIntakeStatus; readonly createdAt: string },
  b: { readonly status: CompanyNeedIntakeStatus; readonly createdAt: string },
): number {
  const order: Record<CompanyNeedIntakeStatus, number> = {
    new: 0,
    contacted: 1,
    qualified: 2,
    converted: 3,
    rejected: 4,
  };
  const so = order[a.status] - order[b.status];
  if (so !== 0) return so;
  return a.status === "new"
    ? a.createdAt.localeCompare(b.createdAt)
    : b.createdAt.localeCompare(a.createdAt);
}
