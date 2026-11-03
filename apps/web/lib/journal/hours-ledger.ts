/**
 * ONE HOURS LEDGER — the deterministic, versioned reading of a person's
 * accumulated work hours (owner integrated-architecture order 2026-10-24,
 * Stage 3). Pure: no IO, no clock, no i18n. It extends decision 0025 — the
 * one professional history (`professional-experience.ts`) — and never stores
 * anything: every figure here is recomputed from the canonical rows on read
 * (decision 0024, derived readings).
 *
 * What it adds to the one history, each rule pinned by hours-ledger.test.ts:
 *
 *  1. STATES. Every counted hour has a BASIS (actual · reported · estimated)
 *     and a CONFIRMATION (unconfirmed · self-attested · confirmed), kept as
 *     two facts. The single displayed STATE is `confirmed` only when somebody
 *     other than the person confirmed it; a self-attestation records the
 *     statement and never upgrades the state. `reported` is an organization's
 *     figure over a span whose method the source did not state — claimed
 *     neither actual nor estimated (UNKNOWN is never dressed up).
 *  2. CONFIDENCE. A BAND per line (high · medium · low) with the facts it
 *     rests on — never a score of the person. The weights behind the band
 *     are NOT public material (AGENTS.md "outcomes, not mechanisms"): they
 *     are injected (`ConfidenceWeights`) by the server-side caller from
 *     private configuration kept outside this repository; without them the
 *     band is null (unrated), never a guess.
 *  3. OVERLAP CAPACITY. Overlapping counted lines may not add up to more
 *     hours than the calendar holds (`MAX_HOURS_PER_CALENDAR_DAY`). Where
 *     they would, the excess is taken from ESTIMATED / REPORTED lines only —
 *     actual records beat estimates and are never reduced; actual records
 *     that alone exceed the calendar are flagged as implausible, unchanged.
 *     Lines made of dated days (journal, organization day records) are
 *     checked on their ACTUAL days; only a genuine period figure (no days)
 *     is treated, for this check alone, as evenly spread over its span —
 *     never shown, and no day is ever invented from it.
 *  4. ESTIMATION. For a period without timesheets: H = D × h × K − A, where D
 *     is the working days of the span by the calendar minus the known
 *     non-working days, h the standard daily hours, K the workload
 *     coefficient and A the ACTUAL hours already recorded in that span for
 *     the same work (actual beats estimate). Date precision (day / month /
 *     year) turns the point into a low–high range. h and K are INPUTS — a
 *     missing one yields `insufficient`, never a default: hours are never
 *     invented to fill a history.
 *  5. SKILL SPLIT. H_skill = Σ H_i × P_ij over counted lines, per evidence
 *     state (recorded · declared · potential · confirmed · certified, decision
 *     0023). One hour may support several skills, so skill hours are
 *     SUPPORTING hours and never added to the total; a (line, skill) pair is
 *     counted once (the largest stated share).
 *  6. WHO THE HOURS BELONG TO. Only the person's own lines enter the total.
 *     An AI agent's autonomous work is project history, never a person's
 *     hours (`actor: "ai_agent"` lines are routed to `projectHistoryOnly`).
 *     A role (owner, manager) carries no hours; the hours of the people a
 *     manager leads are theirs, never the manager's.
 */

export const HOURS_LEDGER_VERSION = "hours-ledger/2026-10-24.v1";

/** The physical ceiling of the overlap check: no person works more than
 *  this many hours in one calendar day, across every organization. */
export const MAX_HOURS_PER_CALENDAR_DAY = 16;

/** Workload coefficient bounds (K): 0 = no work, 1 = the standard day, up to
 *  1.5 = sustained overtime. Outside the bounds the input is refused. */
export const WORKLOAD_MIN = 0;
export const WORKLOAD_MAX = 1.5;

export type HoursBasis = "actual" | "reported" | "estimated";
export type HoursConfirmation = "unconfirmed" | "self_attested" | "confirmed";
export type HoursState = "actual" | "reported" | "estimated" | "confirmed";
export type DatePrecision = "day" | "month" | "year";
export type SkillEvidenceState = "recorded" | "declared" | "potential" | "confirmed" | "certified";

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 1e-9;

// ── calendar (UTC, ISO days) ────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDay(s: string | null | undefined): s is string {
  if (!s || !ISO_DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

function isoOf(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar days in [from, to], inclusive. 0 when the span is inverted. */
export function calendarDays(from: string, to: string): number {
  return Math.max(0, dayNumber(to) - dayNumber(from) + 1);
}

/** Monday–Friday days in [from, to], inclusive, minus the known non-working
 *  days that fall on a weekday inside the span (public holidays, recorded
 *  absences, leave). Each non-working day counts once. */
export function workingDays(from: string, to: string, nonWorkingDays: readonly string[] = []): number {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (b < a) return 0;
  // Full weeks first, then the remainder — O(1) in the span length.
  const total = b - a + 1;
  const fullWeeks = Math.floor(total / 7);
  let count = fullWeeks * 5;
  for (let n = a + fullWeeks * 7; n <= b; n += 1) {
    const wd = new Date(n * DAY_MS).getUTCDay();
    if (wd !== 0 && wd !== 6) count += 1;
  }
  const off = new Set<number>();
  for (const d of nonWorkingDays) {
    if (!isIsoDay(d)) continue;
    const n = dayNumber(d);
    if (n < a || n > b) continue;
    const wd = new Date(n * DAY_MS).getUTCDay();
    if (wd !== 0 && wd !== 6) off.add(n);
  }
  return count - off.size;
}

/** The plausible bounds of a stated day of the given precision. */
function boundsOf(iso: string, precision: DatePrecision): { earliest: string; latest: string } {
  if (precision === "day") return { earliest: iso, latest: iso };
  const y = Number(iso.slice(0, 4));
  if (precision === "year") return { earliest: `${y}-01-01`, latest: `${y}-12-31` };
  const m = Number(iso.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { earliest: `${y}-${mm}-01`, latest: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Calendar months touched by [from, to], inclusive (2024-08-01..2025-11-30 = 16). */
export function monthsInclusive(from: string, to: string): number {
  const a = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const b = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return Math.max(0, b - a + 1);
}

// ── estimation ──────────────────────────────────────────────────────────

export type PeriodEstimateInput = {
  /** The span as stated (ISO days). */
  readonly from: string | null;
  readonly to: string | null;
  /** How precisely each bound is known. Default `day`. */
  readonly precision?: { readonly from?: DatePrecision; readonly to?: DatePrecision };
  /** h — standard daily hours (contract, country norm, owner statement). */
  readonly dailyHours: number | null;
  /** K — workload coefficient (share of the standard day). */
  readonly workload: number | null;
  /** Known non-working days: public holidays, recorded absences, leave. */
  readonly nonWorkingDays?: readonly string[];
  /** A — actual hours already recorded for the same work inside the span. */
  readonly actualHoursInSpan?: number;
};

export type PeriodEstimate =
  | {
      readonly kind: "insufficient";
      readonly version: string;
      /** What must be stated before any figure exists. */
      readonly missing: readonly ("dates" | "dailyHours" | "workload")[];
      readonly problems: readonly string[];
    }
  | {
      readonly kind: "estimate";
      readonly version: string;
      readonly method: "working_days_x_daily_hours_x_workload";
      /** Point estimate over the span as stated, after A. */
      readonly hours: number;
      /** Range from the bounds' precision (inner span … outer span), after A. */
      readonly low: number;
      readonly high: number;
      readonly workingDays: number;
      readonly workingDaysLow: number;
      readonly workingDaysHigh: number;
      /** D × h × K before the actual hours are deducted. */
      readonly gross: number;
      readonly actualDeducted: number;
      readonly explanation: readonly string[];
    };

/**
 * H = D × h × K − A, with a range from the precision of the bounds.
 * Deterministic; refuses (never defaults) a missing or out-of-bounds input.
 */
export function estimatePeriodHours(input: PeriodEstimateInput): PeriodEstimate {
  const missing: ("dates" | "dailyHours" | "workload")[] = [];
  const problems: string[] = [];
  if (!isIsoDay(input.from) || !isIsoDay(input.to)) missing.push("dates");
  if (input.dailyHours === null || !Number.isFinite(input.dailyHours)) missing.push("dailyHours");
  else if (input.dailyHours <= 0 || input.dailyHours > 24) problems.push("dailyHours must be in (0, 24]");
  if (input.workload === null || !Number.isFinite(input.workload)) missing.push("workload");
  else if (input.workload < WORKLOAD_MIN || input.workload > WORKLOAD_MAX) {
    problems.push(`workload must be in [${WORKLOAD_MIN}, ${WORKLOAD_MAX}]`);
  }
  if (missing.length === 0 && dayNumber(input.to!) < dayNumber(input.from!)) problems.push("span is inverted");
  if (missing.length > 0 || problems.length > 0) {
    return { kind: "insufficient", version: HOURS_LEDGER_VERSION, missing, problems };
  }
  const from = input.from!;
  const to = input.to!;
  const h = input.dailyHours!;
  const k = input.workload!;
  const off = input.nonWorkingDays ?? [];
  const pf = input.precision?.from ?? "day";
  const pt = input.precision?.to ?? "day";
  const fb = boundsOf(from, pf);
  const tb = boundsOf(to, pt);
  const d = workingDays(from, to, off);
  // Inner span: the latest plausible start to the earliest plausible end.
  const dLow = dayNumber(tb.earliest) >= dayNumber(fb.latest) ? workingDays(fb.latest, tb.earliest, off) : 0;
  const dHigh = workingDays(fb.earliest, tb.latest, off);
  const a = Math.max(0, input.actualHoursInSpan ?? 0);
  const net = (days: number) => round2(Math.max(0, days * h * k - a));
  const gross = round2(d * h * k);
  const explanation = [
    `D = ${d} working days (Mon–Fri ${from}..${to}, minus ${off.length} known non-working day(s) listed)`,
    `h = ${h} h per working day`,
    `K = ${k}`,
    `D × h × K = ${gross} h`,
    ...(a > 0 ? [`A = ${round2(a)} h actual already recorded in the span is deducted (actual beats estimate)`] : []),
    ...(pf !== "day" || pt !== "day"
      ? [`bounds known to ${pf} / ${pt} precision: range ${dLow}..${dHigh} working days`]
      : []),
  ];
  return {
    kind: "estimate",
    version: HOURS_LEDGER_VERSION,
    method: "working_days_x_daily_hours_x_workload",
    hours: net(d),
    low: net(dLow),
    high: net(dHigh),
    workingDays: d,
    workingDaysLow: dLow,
    workingDaysHigh: dHigh,
    gross,
    actualDeducted: round2(Math.min(a, d * h * k)),
    explanation,
  };
}

/** A source that states its own estimate as a monthly rate ("at least 16
 *  months × 50 h"): H = months × rate. The months are the source's; the
 *  span they cover is stated separately and only at month precision. */
export function estimateFromMonthlyRate(input: {
  readonly months: number | null;
  readonly hoursPerMonth: number | null;
}):
  | { readonly kind: "insufficient"; readonly missing: readonly ("months" | "hoursPerMonth")[] }
  | { readonly kind: "estimate"; readonly version: string; readonly method: "months_x_monthly_rate"; readonly hours: number; readonly explanation: readonly string[] } {
  const missing: ("months" | "hoursPerMonth")[] = [];
  if (input.months === null || !Number.isFinite(input.months) || input.months <= 0) missing.push("months");
  if (input.hoursPerMonth === null || !Number.isFinite(input.hoursPerMonth) || input.hoursPerMonth <= 0) missing.push("hoursPerMonth");
  if (missing.length > 0) return { kind: "insufficient", missing };
  const hours = round2(input.months! * input.hoursPerMonth!);
  return {
    kind: "estimate",
    version: HOURS_LEDGER_VERSION,
    method: "months_x_monthly_rate",
    hours,
    explanation: [`${input.months} month(s) × ${input.hoursPerMonth} h per month = ${hours} h`],
  };
}

// ── states and confidence ───────────────────────────────────────────────

/** The minimal shape of a counted line the ledger reads (a superset is the
 *  `ExperienceHourLine` of professional-experience.ts). */
export type LedgerLine = {
  readonly key: string;
  readonly source: "journal" | "organization_day" | "organization_period";
  readonly hours: number;
  readonly counted: boolean;
  readonly from: string | null;
  readonly to: string | null;
  /** Journal: of `hours`, confirmed by a manager. */
  readonly confirmedHours: number;
  /** Organization lines: of `hours`, attested by someone other than the
   *  person (employer, client, verifier). */
  readonly attestedHours?: number;
  /** Organization lines: of `hours`, attested by the person themselves. */
  readonly selfAttestedHours?: number;
  /** Organization period lines: the stated basis of the figure
   *  (`derived.hoursBasis`, written by a correction). Absent = not stated. */
  readonly hoursBasis?: { readonly value: string; readonly method: string | null; readonly note: string | null } | null;
  readonly spanProvenance?: "source" | "human_choice" | "derived" | null;
  readonly contested?: boolean;
  /** Who did the work: the person (default) or an AI agent acting
   *  autonomously — the latter is project history only. */
  readonly actor?: "person" | "ai_agent";
  /** The line's ACTUAL hours per work day, when the line is made of dated
   *  days (journal entries, organization day records). The capacity check
   *  reads these exact days; only a genuine period figure (no days) is
   *  treated as spread over its span. */
  readonly days?: readonly { readonly day: string; readonly hours: number }[];
};

export function basisOf(line: LedgerLine): HoursBasis {
  if (line.source !== "organization_period") return "actual";
  const v = line.hoursBasis?.value;
  if (v === "actual" || v === "estimated") return v;
  return "reported";
}

/** The private weights behind the confidence band. Never committed: the
 *  server-side caller injects them from private configuration kept outside
 *  this repository; tests inject their own. */
export type ConfidenceWeights = {
  readonly base: {
    readonly journalActual: number;
    readonly organizationActual: number;
    readonly reported: number;
    readonly estimated: number;
  };
  readonly independentConfirmation: number;
  readonly spanChosenByPerson: number;
  readonly spanDerived: number;
  readonly contestedFactor: number;
  readonly ceiling: number;
  /** Lower edges of the bands: value >= high → high, >= medium → medium. */
  readonly bands: { readonly high: number; readonly medium: number };
};

export type ConfidenceBand = "high" | "medium" | "low";

/** The facts a line's confidence rests on — stated, never weighted here. */
export type ConfidenceFact =
  | "own_record"
  | "organization_record"
  | "basis_reported"
  | "basis_estimated"
  | "independently_confirmed"
  | "self_attested"
  | "span_chosen_by_person"
  | "span_derived"
  | "contested";

export type LineStateSplit = {
  readonly key: string;
  readonly basis: HoursBasis;
  readonly confirmation: HoursConfirmation;
  /** Hours by displayed state; sums to the line's counted hours. */
  readonly byState: Readonly<Record<HoursState, number>>;
  /** null = no weights configured (unrated) — never a default band. */
  readonly confidenceBand: ConfidenceBand | null;
  readonly facts: readonly ConfidenceFact[];
};

export function lineState(line: LedgerLine, weights?: ConfidenceWeights | null): LineStateSplit {
  const basis = basisOf(line);
  const hours = Math.max(0, line.hours);
  const confirmed =
    line.source === "journal"
      ? Math.min(hours, Math.max(0, line.confirmedHours))
      : Math.min(hours, Math.max(0, line.attestedHours ?? 0));
  const selfAttested = line.source === "journal" ? 0 : Math.min(hours - confirmed, Math.max(0, line.selfAttestedHours ?? 0));
  const confirmation: HoursConfirmation =
    confirmed > EPS ? "confirmed" : selfAttested > EPS ? "self_attested" : "unconfirmed";
  const byState: Record<HoursState, number> = { actual: 0, reported: 0, estimated: 0, confirmed: round2(confirmed) };
  byState[basis] = round2(hours - confirmed);

  const facts: ConfidenceFact[] = [line.source === "journal" ? "own_record" : "organization_record"];
  if (basis === "reported") facts.push("basis_reported");
  if (basis === "estimated") facts.push("basis_estimated");
  const mostlyConfirmed = hours > 0 && confirmed / hours > 0.5;
  if (mostlyConfirmed) facts.push("independently_confirmed");
  else if (selfAttested > EPS) facts.push("self_attested");
  if (line.spanProvenance === "human_choice") facts.push("span_chosen_by_person");
  else if (line.spanProvenance === "derived") facts.push("span_derived");
  if (line.contested) facts.push("contested");

  let confidenceBand: ConfidenceBand | null = null;
  if (weights) {
    const w = weights;
    let c =
      basis === "estimated"
        ? w.base.estimated
        : basis === "reported"
          ? w.base.reported
          : line.source === "journal"
            ? w.base.journalActual
            : w.base.organizationActual;
    if (mostlyConfirmed) c += w.independentConfirmation;
    if (line.spanProvenance === "human_choice") c += w.spanChosenByPerson;
    else if (line.spanProvenance === "derived") c += w.spanDerived;
    if (line.contested) c *= w.contestedFactor;
    c = Math.min(w.ceiling, Math.max(0, c));
    confidenceBand = c >= w.bands.high - EPS ? "high" : c >= w.bands.medium - EPS ? "medium" : "low";
  }
  return { key: line.key, basis, confirmation, byState, confidenceBand, facts };
}

// ── overlap capacity ────────────────────────────────────────────────────

export type CapacityReading = {
  /** Hours removed from the total because overlapping lines exceed the
   *  calendar; taken from estimated / reported lines only. */
  readonly excessHours: number;
  readonly reductions: readonly { readonly key: string; readonly hours: number }[];
  /** Spans where ACTUAL records alone exceed the calendar: flagged, never
   *  reduced (a record is not edited by a reading). */
  readonly implausible: readonly { readonly from: string; readonly to: string; readonly hours: number; readonly capacity: number }[];
};

/** One line's hours inside [s, e] (day numbers, inclusive): its ACTUAL
 *  days when it has them, otherwise its span figure spread evenly (genuine
 *  period figures only — for this check, never shown). */
type CapacityShape =
  | { readonly kind: "days"; readonly days: readonly number[]; readonly prefix: readonly number[] }
  | { readonly kind: "span"; readonly a: number; readonly b: number; readonly hours: number };

function shapeOf(l: LedgerLine): CapacityShape | null {
  const days = (l.days ?? []).filter((d) => isIsoDay(d.day) && Number.isFinite(d.hours) && d.hours > 0);
  if (days.length > 0) {
    const byDay = new Map<number, number>();
    for (const d of days) byDay.set(dayNumber(d.day), (byDay.get(dayNumber(d.day)) ?? 0) + d.hours);
    const sorted = [...byDay.keys()].sort((x, y) => x - y);
    const prefix: number[] = [0];
    for (const n of sorted) prefix.push(prefix[prefix.length - 1] + byDay.get(n)!);
    return { kind: "days", days: sorted, prefix };
  }
  if (!isIsoDay(l.from) || !isIsoDay(l.to) || dayNumber(l.to!) < dayNumber(l.from!)) return null;
  return { kind: "span", a: dayNumber(l.from!), b: dayNumber(l.to!), hours: l.hours };
}

/** Index of the first element >= n. */
function lowerBound(xs: readonly number[], n: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function shareIn(shape: CapacityShape, s: number, e: number): number {
  if (shape.kind === "span") {
    const from = Math.max(s, shape.a);
    const to = Math.min(e, shape.b);
    return to < from ? 0 : (shape.hours * (to - from + 1)) / (shape.b - shape.a + 1);
  }
  const i = lowerBound(shape.days, s);
  const j = lowerBound(shape.days, e + 1);
  return shape.prefix[j] - shape.prefix[i];
}

export function capacityOf(lines: readonly LedgerLine[]): CapacityReading {
  const shaped = lines
    .filter((l) => l.counted && l.hours > 0)
    .map((l) => ({ line: l, shape: shapeOf(l) }))
    .filter((x): x is { line: LedgerLine; shape: CapacityShape } => x.shape !== null)
    .sort((x, y) => x.line.key.localeCompare(y.line.key));
  if (shaped.length < 2) return { excessHours: 0, reductions: [], implausible: [] };
  const bounds = new Set<number>();
  for (const { shape } of shaped) {
    if (shape.kind === "span") {
      bounds.add(shape.a);
      bounds.add(shape.b + 1);
    } else {
      for (const n of shape.days) {
        bounds.add(n);
        bounds.add(n + 1);
      }
    }
  }
  const cuts = [...bounds].sort((a, b) => a - b);
  const reduction = new Map<string, number>();
  const implausible: { from: string; to: string; hours: number; capacity: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const s = cuts[i];
    const e = cuts[i + 1] - 1;
    const segDays = e - s + 1;
    const shares: { line: LedgerLine; share: number; reducible: boolean }[] = [];
    for (const { line, shape } of shaped) {
      const share = shareIn(shape, s, e);
      if (share > EPS) shares.push({ line, share, reducible: basisOf(line) !== "actual" });
    }
    if (shares.length < 2) continue;
    const demand = shares.reduce((acc, x) => acc + x.share, 0);
    const capacity = segDays * MAX_HOURS_PER_CALENDAR_DAY;
    const excess = demand - capacity;
    if (excess <= EPS) continue;
    const reducible = shares.filter((x) => x.reducible).reduce((acc, x) => acc + x.share, 0);
    const take = Math.min(excess, reducible);
    if (take > EPS) {
      for (const x of shares) {
        if (!x.reducible) continue;
        reduction.set(x.line.key, (reduction.get(x.line.key) ?? 0) + (take * x.share) / reducible);
      }
    }
    if (excess - take > EPS) {
      implausible.push({ from: isoOf(s), to: isoOf(e), hours: round2(demand - take), capacity });
    }
  }
  const reductions = [...reduction.entries()]
    .map(([key, h]) => {
      const line = shaped.find((x) => x.line.key === key)!.line;
      return { key, hours: round2(Math.min(line.hours, h)) };
    })
    .filter((r) => r.hours > 0)
    .sort((x, y) => x.key.localeCompare(y.key));
  return {
    excessHours: round2(reductions.reduce((acc, r) => acc + r.hours, 0)),
    reductions,
    implausible,
  };
}

// ── skill split ─────────────────────────────────────────────────────────

export type SkillLink = {
  readonly lineKey: string;
  readonly skillKey: string;
  /** P_ij — the share of the line's hours that supports the skill, [0, 1]. */
  readonly share: number;
  readonly state: SkillEvidenceState;
};

export type SkillHours = {
  readonly skillKey: string;
  /** Σ H_i × P_ij over counted lines — SUPPORTING hours, not additive. */
  readonly hours: number;
  readonly byState: Readonly<Partial<Record<SkillEvidenceState, number>>>;
  readonly lines: number;
};

export type SkillSplit = {
  readonly skills: readonly SkillHours[];
  /** Counted hours of lines with no skill link at all. */
  readonly unattributedHours: number;
  /** One hour may support several skills: Σ skills may exceed the total. */
  readonly supportingNotAdditive: true;
};

const STATE_RANK: Readonly<Record<SkillEvidenceState, number>> = {
  potential: 0,
  declared: 1,
  recorded: 2,
  confirmed: 3,
  certified: 4,
};

export function skillSplit(
  lines: readonly LedgerLine[],
  links: readonly SkillLink[],
  /** Counted hours per line AFTER the capacity reductions. */
  countedHoursOf: (line: LedgerLine) => number = (l) => l.hours,
): SkillSplit {
  const counted = new Map(lines.filter((l) => l.counted && (l.actor ?? "person") === "person").map((l) => [l.key, l]));
  // One (line, skill) pair once: the largest share, the strongest state.
  const pair = new Map<string, SkillLink>();
  for (const k of links) {
    if (!counted.has(k.lineKey) || !Number.isFinite(k.share)) continue;
    const share = Math.min(1, Math.max(0, k.share));
    if (share <= 0) continue;
    const id = `${k.lineKey}\u0000${k.skillKey}`;
    const prev = pair.get(id);
    if (!prev || share > prev.share || (share === prev.share && STATE_RANK[k.state] > STATE_RANK[prev.state])) {
      pair.set(id, { ...k, share });
    }
  }
  const acc = new Map<string, { hours: number; byState: Partial<Record<SkillEvidenceState, number>>; lines: Set<string> }>();
  const linked = new Set<string>();
  for (const k of pair.values()) {
    const line = counted.get(k.lineKey)!;
    const h = countedHoursOf(line) * k.share;
    linked.add(k.lineKey);
    const a = acc.get(k.skillKey) ?? { hours: 0, byState: {}, lines: new Set<string>() };
    a.hours += h;
    a.byState[k.state] = (a.byState[k.state] ?? 0) + h;
    a.lines.add(k.lineKey);
    acc.set(k.skillKey, a);
  }
  const skills = [...acc.entries()]
    .map(([skillKey, a]) => ({
      skillKey,
      hours: round2(a.hours),
      byState: Object.fromEntries(Object.entries(a.byState).map(([s, h]) => [s, round2(h as number)])) as Partial<
        Record<SkillEvidenceState, number>
      >,
      lines: a.lines.size,
    }))
    .sort((x, y) => y.hours - x.hours || x.skillKey.localeCompare(y.skillKey));
  let unattributed = 0;
  for (const l of counted.values()) if (!linked.has(l.key)) unattributed += countedHoursOf(l);
  return { skills, unattributedHours: round2(unattributed), supportingNotAdditive: true };
}

// ── the ledger ──────────────────────────────────────────────────────────

export type HoursLedger = {
  readonly version: string;
  /** Counted hours after the capacity check — THE total. */
  readonly total: number;
  /** Counted hours before the capacity check. */
  readonly countedBeforeCapacity: number;
  readonly byState: Readonly<Record<HoursState, number>>;
  readonly capacity: CapacityReading;
  readonly lines: readonly LineStateSplit[];
  readonly skills: SkillSplit;
  /** Lines an AI agent produced autonomously: project history, not hours of
   *  the person. Listed, never in `total`. */
  readonly projectHistoryOnly: readonly { readonly key: string; readonly hours: number }[];
};

export function deriveHoursLedger(input: {
  readonly lines: readonly LedgerLine[];
  readonly skillLinks?: readonly SkillLink[] | null;
  /** Private confidence weights (server-side configuration); absent =
   *  every band null (unrated). */
  readonly confidenceWeights?: ConfidenceWeights | null;
}): HoursLedger {
  const own = input.lines.filter((l) => (l.actor ?? "person") === "person");
  const projectHistoryOnly = input.lines
    .filter((l) => l.actor === "ai_agent")
    .map((l) => ({ key: l.key, hours: round2(l.hours) }));
  const counted = own.filter((l) => l.counted);
  const capacity = capacityOf(counted);
  const reductionOf = new Map(capacity.reductions.map((r) => [r.key, r.hours]));
  const byState: Record<HoursState, number> = { actual: 0, reported: 0, estimated: 0, confirmed: 0 };
  const splits: LineStateSplit[] = [];
  let before = 0;
  for (const l of counted) {
    before += l.hours;
    const cut = reductionOf.get(l.key) ?? 0;
    const effective: LedgerLine = cut > 0 ? { ...l, hours: Math.max(0, l.hours - cut) } : l;
    const s = lineState(effective, input.confidenceWeights ?? null);
    splits.push(s);
    for (const k of Object.keys(byState) as HoursState[]) byState[k] += s.byState[k];
  }
  const total = round2(before - capacity.excessHours);
  return {
    version: HOURS_LEDGER_VERSION,
    total,
    countedBeforeCapacity: round2(before),
    byState: {
      actual: round2(byState.actual),
      reported: round2(byState.reported),
      estimated: round2(byState.estimated),
      confirmed: round2(byState.confirmed),
    },
    capacity,
    lines: splits.sort((x, y) => x.key.localeCompare(y.key)),
    skills: skillSplit(counted, input.skillLinks ?? [], (l) => Math.max(0, l.hours - (reductionOf.get(l.key) ?? 0))),
    projectHistoryOnly,
  };
}
