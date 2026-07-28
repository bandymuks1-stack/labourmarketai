/**
 * Pure planning model (control room PR E, capability gap map §4) — shared by
 * the server composition (lib/planning/planning.ts), the planning page and
 * the guard test. No server-only imports, no IO, no date library.
 *
 * ONE planning surface combines, WITHOUT duplicating source records, the
 * three dated sources that really exist today:
 *
 *   - bookings        (booking_requests.start_date / expected_end_date)
 *   - projects        (projects.start_date / end_date — manager date bands)
 *   - tasks           (work_tasks.due_at — the PR D layer; degrades
 *                      honestly while the owner-gated migration is unapplied)
 *
 * Sources that do NOT exist yet (availability windows, milestones, CRM
 * follow-up dates, external calendars) are deliberately ABSENT — nothing
 * here fakes a schedule and nothing claims a calendar sync.
 *
 * Conflict semantics mirror the ONLY real conflict logic in the product —
 * the booking accept guard (respond_booking_request, errcode 23P01):
 * INCLUSIVE calendar-day ranges (`daterange(start, coalesce(end, start),
 * '[]')`) compared with `&&` — touching edges (one ends the day the other
 * starts) IS an overlap. Only the caller's own commitments are compared:
 * accepted INCOMING bookings (the caller is the worker on the row) and the
 * caller's own project assignments. Proposed/declined bookings, the
 * company's outgoing proposals (different workers — no shared axis in the
 * row) and managed project date bands are never flagged.
 */

export const PLANNING_SOURCE_TYPES = [
  "booking",
  "project",
  "task",
  "journal",
  "finance",
  "invitation",
  "absence",
  "stage",
] as const;
export type PlanningSourceType = (typeof PLANNING_SOURCE_TYPES)[number];

/**
 * Canonical calendar views (core-network area C). The calendar is a PLAN
 * over real records; the work journal is FACT — journal entries join the
 * projection at their real recorded day and deep-link back to the entry.
 */
export const PLANNING_VIEWS = ["agenda", "day", "week", "month", "year"] as const;
export type PlanningView = (typeof PLANNING_VIEWS)[number];

export function isPlanningView(value: string | undefined): value is PlanningView {
  return (PLANNING_VIEWS as readonly string[]).includes(value ?? "");
}

/** Compact agenda window: today + the next N-1 calendar days (UTC). */
export const PLANNING_WINDOW_DAYS = 14;
/** The week strip covers today + 6 days — plain date math, no library. */
export const PLANNING_WEEK_STRIP_DAYS = 7;
/** Bounded reads everywhere — planning never streams unbounded rows. */
export const PLANNING_PROJECT_READ_LIMIT = 100;

/** Whose plan-line an item is — display context, never a security signal. */
export type PlanningRoleContext =
  | "incoming" /* booking proposed TO the caller (caller = worker) */
  | "outgoing" /* booking proposed BY the caller's company */
  | "managed" /* project date band of a project the caller manages */
  | "assigned" /* project the caller is assigned to as a worker */
  | "mine"; /* the caller's own task */

export interface PlanningItem {
  /** Stable list id: `${sourceType}:${sourceId}` (React keys, testids). */
  readonly id: string;
  readonly sourceType: PlanningSourceType;
  readonly sourceId: string;
  /** Real title-ish data from the source record (booking role text, project
   *  title, task title). Null → the page renders an i18n fallback noun,
   *  never invented copy. */
  readonly label: string | null;
  /** Secondary real detail (booking country, project city). */
  readonly detail: string | null;
  /** Calendar day "YYYY-MM-DD" (UTC). Null → the "no date yet" section. */
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** Source-native status value (booking/project/task lifecycle). */
  readonly status: string;
  /** Full i18n path for the status label — reuses each source's own copy. */
  readonly statusKey: string;
  /** Route of the REAL source object — never a planning-local detail page. */
  readonly href: string;
  readonly roleContext: PlanningRoleContext;
}

/* ------------------------------------------------------------------ */
/* Source routes — every item links back to its real object            */
/* ------------------------------------------------------------------ */

/** The real route the source record lives on. Bookings and tasks are
 *  list-anchored surfaces; a project has its own real detail route. */
export function hrefForSource(
  sourceType: PlanningSourceType,
  sourceId: string,
): string {
  switch (sourceType) {
    case "booking":
      return "/dashboard/bookings";
    case "project":
      return `/dashboard/projects/${sourceId}`;
    case "task":
      return "/dashboard/tasks";
    case "journal":
      // The entry's own editor — the calendar never grows a duplicate
      // journal detail page; the source record stays canonical.
      return `/dashboard/journal?editing=${sourceId}#journal-composer`;
    case "finance":
      // List-anchored like bookings/tasks — amounts and counterparties live
      // ONLY on the finance surface under its own permissions.
      return "/dashboard/finance";
    case "invitation":
      // Both directions live on the network surface (sent list + incoming).
      return "/dashboard/network";
    case "absence":
      // List-anchored — the absence lifecycle lives on its own surface.
      return "/dashboard/absences";
    case "stage":
      // A stage belongs to a project; the PURE mapper builds the real
      // project-operations href from the project id (this generic fallback
      // only anchors the projects surface).
      return "/dashboard/projects";
  }
}

/** One naming source per lifecycle — booking and task statuses reuse the
 *  copy their own surfaces already ship; project statuses get the small
 *  planning-local set (draft/live/paused). */
export function statusKeyForSource(
  sourceType: PlanningSourceType,
  status: string,
): string {
  switch (sourceType) {
    case "booking":
      return `bookings.status.${status}`;
    case "project":
      return `planning.projectStatus.${status}`;
    case "task":
      return `tasks.status.${status}`;
    case "journal":
      return `planning.journalStatus.${status}`;
    case "finance":
      // Reuses the finance surface's own lifecycle copy. "overdue" is a
      // DERIVED display state (due_date passed + unpaid status — the same
      // rule the finance page applies), so it names the finance surface's
      // existing overdue label rather than a stored status.
      return status === "overdue"
        ? "finance.summary.overdue"
        : `finance.status.${status}`;
    case "invitation":
      // Reuses the network surface's invitation lifecycle copy.
      return `network.sent.status.${status}`;
    case "absence":
      // Reuses the absences surface's own lifecycle copy (W7 model).
      return `absences.statuses.${status}`;
    case "stage":
      // Reuses the project-stages panel's own lifecycle copy (W6 model).
      return `projectStages.statuses.${status}`;
  }
}

export function isPlanningSourceType(
  value: string | undefined,
): value is PlanningSourceType {
  return (PLANNING_SOURCE_TYPES as readonly string[]).includes(value ?? "");
}

/* ------------------------------------------------------------------ */
/* Pure date helpers (UTC calendar days, string math on "YYYY-MM-DD")  */
/* ------------------------------------------------------------------ */

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

/** UTC calendar day of an ISO date/timestamp — "YYYY-MM-DD", null when
 *  unparseable (an unparseable date degrades to "no date yet", never NaN). */
export function toIsoDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (DAY_RX.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** dayIso + n calendar days (UTC-safe plain date math). */
export function addDays(dayIso: string, n: number): string {
  const d = new Date(`${dayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The effective (inclusive) end day — a missing end collapses to the start
 *  day, exactly like the accept guard's `coalesce(end, start)`. */
export function effectiveEndDay(item: Pick<PlanningItem, "startDate" | "endDate">): string | null {
  if (!item.startDate) return null;
  return item.endDate && item.endDate >= item.startDate
    ? item.endDate
    : item.startDate;
}

/**
 * Inclusive day-range overlap — the `daterange(a, coalesce(aEnd, a), '[]')
 * && daterange(b, coalesce(bEnd, b), '[]')` semantics of the booking accept
 * guard. Touching edges (aEnd === bStart) IS an overlap. Lexicographic
 * comparison is correct for "YYYY-MM-DD".
 */
export function rangesOverlapInclusive(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** True when the item covers the given day (inclusive band). */
export function itemCoversDay(item: PlanningItem, dayIso: string): boolean {
  const end = effectiveEndDay(item);
  if (!item.startDate || !end) return false;
  return item.startDate <= dayIso && dayIso <= end;
}

/* ------------------------------------------------------------------ */
/* Conflicts — only REAL overlapping personal commitments              */
/* ------------------------------------------------------------------ */

export interface PlanningConflict {
  readonly aId: string;
  readonly bId: string;
  /** First shared day of the two inclusive ranges (display hint). */
  readonly overlapStart: string;
}

/**
 * A record participates in conflict detection only when it is a dated
 * personal commitment of the caller:
 *  - an ACCEPTED booking where the caller is the worker (incoming) — the
 *    exact rows the accept guard compares server-side,
 *  - a project the caller is personally assigned to, or
 *  - an APPROVED absence of the caller (Time Engine W2: approved leave and
 *    an accepted booking on the same days is a real, physically impossible
 *    plan — the calendar must surface it, since no DB guard does yet).
 * Proposals, declined/withdrawn/expired bookings, REQUESTED (not yet
 * approved) absences, the company's outgoing rows (different workers),
 * managed project bands and project stages never conflict here — flagging
 * them would invent a problem no real record proves.
 */
export function isConflictEligible(item: PlanningItem): boolean {
  if (!item.startDate) return false;
  if (item.sourceType === "booking") {
    return item.status === "accepted" && item.roleContext === "incoming";
  }
  if (item.sourceType === "project") {
    return item.roleContext === "assigned";
  }
  if (item.sourceType === "absence") {
    return item.status === "approved";
  }
  return false;
}

/** Pairwise overlap among the eligible items — deterministic order, each
 *  pair reported once. Pure; bounded by the already-bounded source reads. */
export function detectConflicts(
  items: readonly PlanningItem[],
): readonly PlanningConflict[] {
  const eligible = items.filter(isConflictEligible);
  const conflicts: PlanningConflict[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      const aEnd = effectiveEndDay(a);
      const bEnd = effectiveEndDay(b);
      if (!a.startDate || !b.startDate || !aEnd || !bEnd) continue;
      if (rangesOverlapInclusive(a.startDate, aEnd, b.startDate, bEnd)) {
        conflicts.push({
          aId: a.id,
          bId: b.id,
          overlapStart: a.startDate >= b.startDate ? a.startDate : b.startDate,
        });
      }
    }
  }
  return conflicts;
}

export function conflictItemIds(
  conflicts: readonly PlanningConflict[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    ids.add(c.aId);
    ids.add(c.bId);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* Agenda — compact, mobile-safe day grouping (no calendar library)    */
/* ------------------------------------------------------------------ */

export interface AgendaDayGroup {
  /** "YYYY-MM-DD" (UTC). */
  readonly day: string;
  readonly isToday: boolean;
  readonly items: readonly PlanningItem[];
}

export interface WeekStripDay {
  readonly day: string;
  readonly isToday: boolean;
  /** Real count of items whose inclusive band covers this day. */
  readonly count: number;
  /** A conflicting item covers this day. */
  readonly hasConflict: boolean;
}

export interface PlanningAgenda {
  /** Non-empty day groups inside the window, ascending. An item that is
   *  already running (started before today, not finished) anchors to TODAY;
   *  a future item anchors to its start day. */
  readonly days: readonly AgendaDayGroup[];
  /** Dated items starting after the window — honest "later", not hidden. */
  readonly later: readonly PlanningItem[];
  /** Items with no date recorded (a proposal without dates, a task without
   *  a due date is excluded upstream — bookings mainly). */
  readonly undated: readonly PlanningItem[];
  /** Items whose band ended before today — dropped from the forward-looking
   *  agenda, reported as an honest count (history lives on each source). */
  readonly pastCount: number;
  readonly conflicts: readonly PlanningConflict[];
  readonly conflictIds: ReadonlySet<string>;
  readonly weekStrip: readonly WeekStripDay[];
}

function sortItems(a: PlanningItem, b: PlanningItem): number {
  const aKey = `${a.startDate ?? "9999-99-99"}|${a.sourceType}|${a.sourceId}`;
  const bKey = `${b.startDate ?? "9999-99-99"}|${b.sourceType}|${b.sourceId}`;
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}

/**
 * Build the compact agenda for a reference date (pure, deterministic).
 * Grouping rule: ongoing → today; future within the window → its start day;
 * beyond the window → "later"; no start date → "undated"; already finished →
 * counted, not listed (planning looks forward; history stays on the source).
 */
export function buildAgenda(
  items: readonly PlanningItem[],
  referenceDate: Date,
  windowDays: number = PLANNING_WINDOW_DAYS,
): PlanningAgenda {
  const today = referenceDate.toISOString().slice(0, 10);
  const windowEnd = addDays(today, Math.max(windowDays, 1) - 1);

  const byDay = new Map<string, PlanningItem[]>();
  const later: PlanningItem[] = [];
  const undated: PlanningItem[] = [];
  const active: PlanningItem[] = [];
  let pastCount = 0;

  for (const item of [...items].sort(sortItems)) {
    if (!item.startDate) {
      undated.push(item);
      continue;
    }
    const end = effectiveEndDay(item);
    if (end && end < today) {
      pastCount++;
      continue;
    }
    active.push(item);
    const anchor = item.startDate > today ? item.startDate : today;
    if (anchor > windowEnd) {
      later.push(item);
      continue;
    }
    const group = byDay.get(anchor);
    if (group) group.push(item);
    else byDay.set(anchor, [item]);
  }

  const days: AgendaDayGroup[] = [...byDay.keys()].sort().map((day) => ({
    day,
    isToday: day === today,
    items: byDay.get(day) ?? [],
  }));

  // Conflicts run over every non-past dated item (`active` includes the
  // "later" ones) so an overlap is never hidden by the window size.
  const conflicts = detectConflicts(active);
  const conflictIds = conflictItemIds(conflicts);

  const weekStrip: WeekStripDay[] = [];
  for (let i = 0; i < PLANNING_WEEK_STRIP_DAYS; i++) {
    const day = addDays(today, i);
    const covering = active.filter((it) => itemCoversDay(it, day));
    weekStrip.push({
      day,
      isToday: i === 0,
      count: covering.length,
      hasConflict: covering.some((it) => conflictIds.has(it.id)),
    });
  }

  return { days, later, undated, pastCount, conflicts, conflictIds, weekStrip };
}

/* ------------------------------------------------------------------ */
/* Calendar views — month / week / day / year (pure UTC date math)     */
/* ------------------------------------------------------------------ */

/** Strict "YYYY-MM-DD" parse that rejects impossible dates (2026-02-31). */
export function parseIsoDay(value: string | undefined | null): string | null {
  if (!value || !DAY_RX.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === value ? value : null;
}

/** Monday of the ISO week containing the day (European work week). */
export function startOfWeekMonday(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(dayIso, -shift);
}

/** First calendar day of the month containing the day. */
export function firstDayOfMonth(dayIso: string): string {
  return `${dayIso.slice(0, 7)}-01`;
}

/** dayIso + n months, clamped to the target month's last day (UTC). */
export function addMonths(dayIso: string, n: number): string {
  const d = new Date(`${firstDayOfMonth(dayIso)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  const first = d.toISOString().slice(0, 10);
  const wanted = Number(dayIso.slice(8, 10));
  const last = new Date(`${first}T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const lastDay = Number(last.toISOString().slice(8, 10));
  const day = Math.min(wanted, lastDay);
  return `${first.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

export interface CalendarDayCell {
  readonly day: string;
  /** False for the leading/trailing days that pad the month grid. */
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly count: number;
  readonly hasConflict: boolean;
}

export interface MonthGrid {
  /** "YYYY-MM" of the anchored month. */
  readonly month: string;
  /** Full weeks (Mon–Sun rows) covering the month — 4..6 rows. */
  readonly weeks: readonly (readonly CalendarDayCell[])[];
}

/** Items covering a day, deterministic order (start day, type, id). */
export function itemsForDay(
  items: readonly PlanningItem[],
  dayIso: string,
): readonly PlanningItem[] {
  return [...items].sort(sortItems).filter((it) => itemCoversDay(it, dayIso));
}

/**
 * Month grid over the anchored day's month: full Monday-started weeks with
 * real per-day counts + conflict flags. Pure projection — cells carry only
 * counts; each cell links to the day view, and the day view links every
 * item back to its real source record.
 */
export function buildMonthGrid(
  anchorDay: string,
  items: readonly PlanningItem[],
  todayIso: string,
): MonthGrid {
  const month = anchorDay.slice(0, 7);
  const gridStart = startOfWeekMonday(firstDayOfMonth(anchorDay));
  const lastOfMonth = addDays(addMonths(firstDayOfMonth(anchorDay), 1), -1);
  const gridEnd = addDays(startOfWeekMonday(lastOfMonth), 6);
  const conflictIds = conflictItemIds(detectConflicts(items));

  const weeks: CalendarDayCell[][] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
    const row: CalendarDayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i);
      const covering = itemsForDay(items, day);
      row.push({
        day,
        inMonth: day.slice(0, 7) === month,
        isToday: day === todayIso,
        count: covering.length,
        hasConflict: covering.some((it) => conflictIds.has(it.id)),
      });
    }
    weeks.push(row);
  }
  return { month, weeks };
}

export interface WeekViewDay {
  readonly day: string;
  readonly isToday: boolean;
  readonly items: readonly PlanningItem[];
}

/** The 7 Monday-started days of the anchored week with covering items. */
export function buildWeekView(
  anchorDay: string,
  items: readonly PlanningItem[],
  todayIso: string,
): readonly WeekViewDay[] {
  const start = startOfWeekMonday(anchorDay);
  const days: WeekViewDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    days.push({ day, isToday: day === todayIso, items: itemsForDay(items, day) });
  }
  return days;
}

export interface YearMonthCell {
  /** "YYYY-MM". */
  readonly month: string;
  readonly isCurrent: boolean;
  /** Items whose inclusive band intersects the month. */
  readonly count: number;
}

/** 12 month cells with real intersect counts — the year overview. */
export function buildYearOverview(
  year: number,
  items: readonly PlanningItem[],
  todayIso: string,
): readonly YearMonthCell[] {
  const cells: YearMonthCell[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    const first = `${month}-01`;
    const last = addDays(addMonths(first, 1), -1);
    const count = items.filter((it) => {
      const end = effectiveEndDay(it);
      return it.startDate && end && rangesOverlapInclusive(it.startDate, end, first, last);
    }).length;
    cells.push({ month, isCurrent: todayIso.slice(0, 7) === month, count });
  }
  return cells;
}

/** Prev/next anchor days for a view (day±1, week±7, month±1, year±12, agenda±14). */
export function navAnchors(
  view: PlanningView,
  anchorDay: string,
): { prev: string; next: string } {
  switch (view) {
    case "day":
      return { prev: addDays(anchorDay, -1), next: addDays(anchorDay, 1) };
    case "week":
      return { prev: addDays(anchorDay, -7), next: addDays(anchorDay, 7) };
    case "month":
      return { prev: addMonths(anchorDay, -1), next: addMonths(anchorDay, 1) };
    case "year":
      return { prev: addMonths(anchorDay, -12), next: addMonths(anchorDay, 12) };
    case "agenda":
      return {
        prev: addDays(anchorDay, -PLANNING_WINDOW_DAYS),
        next: addDays(anchorDay, PLANNING_WINDOW_DAYS),
      };
  }
}

/** The [rangeStart, rangeEnd] a view makes visible — drives the bounded
 *  journal read so facts appear exactly where the user is looking. */
export function visibleRange(
  view: PlanningView,
  anchorDay: string,
): { start: string; end: string } {
  switch (view) {
    case "day":
      return { start: anchorDay, end: anchorDay };
    case "week": {
      const start = startOfWeekMonday(anchorDay);
      return { start, end: addDays(start, 6) };
    }
    case "month": {
      const start = startOfWeekMonday(firstDayOfMonth(anchorDay));
      return { start, end: addDays(start, 41) };
    }
    case "year":
      return {
        start: `${anchorDay.slice(0, 4)}-01-01`,
        end: `${anchorDay.slice(0, 4)}-12-31`,
      };
    case "agenda":
      return { start: anchorDay, end: addDays(anchorDay, PLANNING_WINDOW_DAYS - 1) };
  }
}

/* ------------------------------------------------------------------ */
/* Source projections — finance & invitations (Timeline Source         */
/* Expansion v1). PURE mappers: the server composition feeds them the  */
/* rows its existing RLS-scoped services return; the mappers decide    */
/* date/status/label semantics deterministically and are unit-tested   */
/* without IO.                                                         */
/* ------------------------------------------------------------------ */

/** The finance fields the calendar is allowed to see. Deliberately NARROW:
 *  no money fields and no third-party names — that detail stays on the
 *  finance surface under its existing permissions (owner privacy decision,
 *  Timeline Source Expansion v1). */
export interface FinancePlanningInput {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  /** "YYYY-MM-DD" or null. */
  readonly dueDate: string | null;
  /** ISO timestamp or null. */
  readonly paidAt: string | null;
}

/** Unpaid lifecycle states — mirrors UNPAID_FINANCE_STATUSES in the finance
 *  model (single rule: only unpaid records can be overdue). */
const FINANCE_UNPAID = new Set(["draft", "issued", "partially_paid"]);

/**
 * Project ONE finance record to at most ONE calendar item (no per-timestamp
 * fan-out — a record never becomes several rows in v1; documented decision):
 *
 *  - cancelled        → null (not an operational commitment; finance page
 *                       keeps its history)
 *  - paid             → the payment FACT at its real paid day (falls back to
 *                       the due day when legacy rows lack paid_at)
 *  - unpaid + due     → the due deadline; "overdue" is derived exactly like
 *                       the finance surface derives it (due day before
 *                       today + unpaid status)
 *  - no usable date   → null (created_at is deliberately NOT projected —
 *                       record creation is bookkeeping, not a plan)
 */
export function projectFinanceItem(
  record: FinancePlanningInput,
  todayIso: string,
): PlanningItem | null {
  if (record.status === "cancelled") return null;
  const paidDay = toIsoDay(record.paidAt);
  const dueDay = toIsoDay(record.dueDate);
  const day = record.status === "paid" ? (paidDay ?? dueDay) : dueDay;
  if (!day) return null;
  const overdue =
    FINANCE_UNPAID.has(record.status) && dueDay !== null && dueDay < todayIso;
  const status = overdue ? "overdue" : record.status;
  return {
    id: `finance:${record.id}`,
    sourceType: "finance",
    sourceId: record.id,
    label: record.title.trim() ? record.title : null,
    detail: null,
    startDate: day,
    endDate: null,
    status,
    statusKey: statusKeyForSource("finance", status),
    href: hrefForSource("finance", record.id),
    roleContext: "mine",
  };
}

/** A sent invitation as the calendar sees it (network.ts row subset). */
export interface SentInvitationPlanningInput {
  readonly id: string;
  /** Display status — stale pending already reads as expired upstream. */
  readonly status: string;
  readonly invitedName: string | null;
  readonly invitedEmail: string;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly declinedAt: string | null;
  readonly revokedAt: string | null;
}

/** An incoming (pending, addressed-to-me) invitation row subset. */
export interface IncomingInvitationPlanningInput {
  readonly id: string;
  readonly expiresAt: string;
  readonly organizationName: string | null;
  readonly projectTitle: string | null;
  readonly inviterName: string | null;
}

/**
 * The day an invitation's lifecycle event REALLY happened / really ends:
 * pending → its expiry deadline (a real future bound, never the creation
 * time); accepted/declined/revoked → the decision day; expired → the day it
 * expired. A missing decision timestamp yields null — the item degrades to
 * the honest "no date yet" section instead of inventing a date.
 */
export function invitationEventDay(
  status: string,
  row: Pick<
    SentInvitationPlanningInput,
    "expiresAt" | "acceptedAt" | "declinedAt" | "revokedAt"
  >,
): string | null {
  switch (status) {
    case "pending":
    case "expired":
      return toIsoDay(row.expiresAt);
    case "accepted":
      return toIsoDay(row.acceptedAt);
    case "declined":
      return toIsoDay(row.declinedAt);
    case "revoked":
      return toIsoDay(row.revokedAt);
    default:
      return null;
  }
}

/** ONE calendar item per sent invitation, at its real lifecycle day. */
export function projectSentInvitationItem(
  row: SentInvitationPlanningInput,
): PlanningItem {
  const name = row.invitedName?.trim() ? row.invitedName : row.invitedEmail;
  return {
    id: `invitation:${row.id}`,
    sourceType: "invitation",
    sourceId: row.id,
    label: name?.trim() ? name : null,
    detail: null,
    startDate: invitationEventDay(row.status, row),
    endDate: null,
    status: row.status,
    statusKey: statusKeyForSource("invitation", row.status),
    href: hrefForSource("invitation", row.id),
    roleContext: "outgoing",
  };
}

/** ONE calendar item per incoming pending invitation — an actionable
 *  deadline at its real expiry day. The read itself returns pending rows
 *  only, so no past decision is ever presented as upcoming. */
export function projectIncomingInvitationItem(
  row: IncomingInvitationPlanningInput,
): PlanningItem {
  const label =
    row.organizationName?.trim()
      ? row.organizationName
      : row.projectTitle?.trim()
        ? row.projectTitle
        : row.inviterName?.trim()
          ? row.inviterName
          : null;
  return {
    id: `invitation:${row.id}`,
    sourceType: "invitation",
    sourceId: row.id,
    label,
    detail: null,
    startDate: toIsoDay(row.expiresAt),
    endDate: null,
    status: "pending",
    statusKey: statusKeyForSource("invitation", "pending"),
    href: hrefForSource("invitation", row.id),
    roleContext: "incoming",
  };
}

/**
 * Combine both invitation directions into one deduped list. The same row can
 * surface twice when someone invites their own address (inviter AND
 * recipient scopes overlap) — the outgoing projection wins, the incoming
 * duplicate is dropped, and the item count never inflates.
 */
export function combineInvitationItems(
  outgoing: readonly PlanningItem[],
  incoming: readonly PlanningItem[],
): PlanningItem[] {
  const seen = new Set(outgoing.map((i) => i.id));
  const merged = [...outgoing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* Source projections — absences & project stages (Time Engine W2).    */
/* The applied W6/W7 tables finally join the ONE canonical calendar    */
/* instead of living as orphaned per-module date views.                */
/* ------------------------------------------------------------------ */

/** The absence fields the calendar sees (worker_absences, W7 model). */
export interface AbsencePlanningInput {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: string;
}

/** Absence lifecycle states that belong on a FORWARD plan — a requested
 *  absence is a pending intention, an approved one is a commitment;
 *  rejected/cancelled rows are history and stay on the absences surface. */
export const PLANNED_ABSENCE_STATUSES = ["requested", "approved"] as const;

/** ONE calendar item per planned absence at its real date band. The label
 *  stays null (the page renders the honest source fallback noun) — absence
 *  TYPE detail lives on the absences surface under its own copy. */
export function projectAbsenceItem(
  row: AbsencePlanningInput,
): PlanningItem | null {
  if (!(PLANNED_ABSENCE_STATUSES as readonly string[]).includes(row.status)) {
    return null;
  }
  const start = toIsoDay(row.startDate);
  if (!start) return null;
  return {
    id: `absence:${row.id}`,
    sourceType: "absence",
    sourceId: row.id,
    label: null,
    detail: null,
    startDate: start,
    endDate: toIsoDay(row.endDate),
    status: row.status,
    statusKey: statusKeyForSource("absence", row.status),
    href: hrefForSource("absence", row.id),
    roleContext: "mine",
  };
}

/** The stage fields the calendar sees (project_stages, W6 model). */
export interface StagePlanningInput {
  readonly id: string;
  readonly projectId: string;
  /** Real project title for the detail line (null → no invented copy). */
  readonly projectTitle: string | null;
  readonly name: string;
  readonly status: string;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly actualStart: string | null;
  readonly actualEnd: string | null;
}

/** Stage lifecycle states with calendar meaning — cancelled stages are
 *  history; done stages keep their band (a finished phase is a fact). */
const PLANNED_STAGE_STATUSES = new Set([
  "planned",
  "in_progress",
  "blocked",
  "done",
]);

/**
 * ONE calendar item per dated stage. Date semantics mirror the stage gantt
 * exactly (lib/projects/stage-gantt.ts): ACTUAL dates override PLANNED ones
 * — the calendar and the gantt may never disagree about the same row. A
 * stage with no date at all is skipped (it has no calendar meaning; it
 * stays on the operations panel), never parked in "undated".
 */
export function projectStageItem(
  row: StagePlanningInput,
): PlanningItem | null {
  if (!PLANNED_STAGE_STATUSES.has(row.status)) return null;
  const start = toIsoDay(row.actualStart) ?? toIsoDay(row.plannedStart);
  const end = toIsoDay(row.actualEnd) ?? toIsoDay(row.plannedEnd);
  if (!start && !end) return null;
  return {
    id: `stage:${row.id}`,
    sourceType: "stage",
    sourceId: row.id,
    label: row.name.trim() ? row.name : null,
    detail: row.projectTitle?.trim() ? row.projectTitle : null,
    startDate: start ?? end,
    endDate: end,
    status: row.status,
    statusKey: statusKeyForSource("stage", row.status),
    // The stage's REAL home — the project operations centre, not a
    // planning-local detail page.
    href: `/dashboard/projects/${row.projectId}/operations`,
    roleContext: "managed",
  };
}
