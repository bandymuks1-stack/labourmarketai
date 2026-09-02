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
  // Train F1 (2026-09-02): the organization's PLAN primitive — a planned work
  // window for one worker (work_plan_entries). CALENDAR = PLAN.
  "plan",
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

  // ── §7.1 THE FULL AGREED FIELD SET (owner visual acceptance) ──────────
  // Every field below is OPTIONAL BY CONTRACT and null when the source row
  // genuinely does not carry it. The calendar renders what exists and says
  // nothing about what does not — a null is never padded with an example
  // (doctrine §7 honesty), and no field here is derived by guessing.

  /** Clock time of day, "HH:MM" (24h, source timezone as stored). Null for
   *  day-precision sources (project bands, task due days). */
  readonly startTime: string | null;
  /** Real duration, already humanized by the source (e.g. "6 val.", "3 d.").
   *  Null when the source records no length. */
  readonly duration: string | null;
  /** The WORK CONTEXT the row belongs to — the workspace/organization name
   *  the person was acting in. Null for personal-space rows. */
  readonly workspace: string | null;
  /** Project title when the row belongs to a project. */
  readonly project: string | null;
  /** Physical place: site name, city or country — whatever the row states. */
  readonly place: string | null;
  /** The other real person on the row (worker on a booking, task assignee).
   *  Only ever a counterpart the caller may already see. */
  readonly counterpart: string | null;
  /** The related organization (company that proposed a booking, project org). */
  readonly organization: string | null;
}

/**
 * Clock time "HH:MM" (UTC) from a real timestamp, or null when the value is
 * absent / unparsable / midnight-exact. Midnight is excluded on purpose:
 * a date-only value stored as `…T00:00:00Z` would otherwise render as a
 * fabricated "00:00 appointment".
 */
export function clockTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  if (hh === 0 && mm === 0) return null;
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${p(hh)}:${p(mm)}`;
}

/**
 * INCLUSIVE day-span length of a real date band, as a bare count of days
 * (the UI appends the localized unit). Returns null for a single day or an
 * unknown end — a one-day row states its date, not a "1 day" duration.
 * Pure UTC arithmetic, no date library.
 */
export function daySpanDays(
  startIso: string | null,
  endIso: string | null,
): string | null {
  if (!startIso || !endIso || endIso <= startIso) return null;
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const days = Math.round((b - a) / 86_400_000) + 1; // inclusive
  return days > 1 ? String(days) : null;
}

/** Builder for the optional §7.1 fields — keeps every reader honest by
 *  defaulting the whole set to null, so a source can only ever ADD what it
 *  really has. */
export function planningMeta(
  partial: Partial<
    Pick<
      PlanningItem,
      | "startTime"
      | "duration"
      | "workspace"
      | "project"
      | "place"
      | "counterpart"
      | "organization"
    >
  > = {},
): Pick<
  PlanningItem,
  | "startTime"
  | "duration"
  | "workspace"
  | "project"
  | "place"
  | "counterpart"
  | "organization"
> {
  const clean = (v: string | null | undefined): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    return t.length > 0 ? t : null;
  };
  return {
    startTime: clean(partial.startTime),
    duration: clean(partial.duration),
    workspace: clean(partial.workspace),
    project: clean(partial.project),
    place: clean(partial.place),
    counterpart: clean(partial.counterpart),
    organization: clean(partial.organization),
  };
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
    case "plan":
      // Train F1: the plan list lives on the workforce planning zone; the
      // projector overrides this with the dated day-view link.
      return `/dashboard/company/planning#work-plan-${sourceId}`;
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
    case "plan":
      return `planning.planStatus.${status}`;
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

/**
 * Which calendar day a Work Journal entry belongs on.
 *
 * THE DAY WORKED, not the day typed. The save action stores the worker's own
 * `work_date` metric, but the projection read only `created_at` — so an entry
 * logged in the evening for yesterday's shift ("įrašyk vakarykštį darbą į
 * žurnalą", a first-class journal phrase) landed on the wrong day, and a worker
 * checking which days they had filled was reading fiction.
 *
 * `createdAt` remains the fallback for entries that never carried a work date.
 * A `workDate` that is not exactly YYYY-MM-DD is ignored rather than guessed
 * at — a malformed value must not silently move an entry to a wrong day. Being
 * a plain day already, it never enters a timezone conversion (W12: one
 * UTC-pinned formatter, and this value bypasses it by construction).
 */
export function journalStartDay(
  workDate: string | null | undefined,
  createdAt: string | null | undefined,
): string | null {
  const wd = typeof workDate === "string" ? workDate.trim() : "";
  if (DAY_RX.test(wd)) return wd;
  return toIsoDay(createdAt);
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

/**
 * W12 slice 3 — which SOURCES a visible item conflicts with that the current
 * filter is hiding.
 *
 * THE DEFECT THIS EXISTS FOR. Conflicts used to be derived from the FILTERED
 * list, so `?source=booking` removed the absence rows from the input and the
 * overlap simply stopped being computed. A worker who filtered to bookings saw
 * a clean plan while approved leave sat on the same days. A filter is a
 * question about what to SHOW; it must never change what is TRUE.
 *
 * Conflicts are now derived from the full model and the rows are still
 * rendered filtered, which alone would leave a flag with no visible partner —
 * a red badge next to a row that looks fine. This returns the source types of
 * the hidden partners so the UI can say WHY.
 *
 * NO DATA LEAK. `isConflictEligible` admits only the caller's OWN dated
 * commitments (their incoming accepted bookings, projects they are personally
 * assigned to, their approved absences), so every partner named here is
 * already the caller's own record — the filter was hiding it from them, not
 * protecting it from them. Only the SOURCE TYPE is returned, never a label,
 * a date or an id.
 */
export function hiddenConflictSources(
  conflicts: readonly PlanningConflict[],
  allItems: readonly PlanningItem[],
  visibleItems: readonly PlanningItem[],
): ReadonlyMap<string, readonly PlanningItem["sourceType"][]> {
  const visibleIds = new Set(visibleItems.map((i) => i.id));
  const byId = new Map(allItems.map((i) => [i.id, i]));
  const out = new Map<string, PlanningItem["sourceType"][]>();

  const note = (visibleId: string, hiddenId: string): void => {
    if (!visibleIds.has(visibleId) || visibleIds.has(hiddenId)) return;
    const hidden = byId.get(hiddenId);
    if (!hidden) return;
    const list = out.get(visibleId) ?? [];
    if (!list.includes(hidden.sourceType)) list.push(hidden.sourceType);
    out.set(visibleId, list);
  };

  for (const c of conflicts) {
    note(c.aId, c.bId);
    note(c.bId, c.aId);
  }
  // Deterministic order so the rendered note never reshuffles between requests.
  for (const [, list] of out) list.sort();
  return out;
}

/** One counterpart of a conflict that the reader can actually see on the page. */
export interface VisibleConflictPartner {
  readonly id: string;
  readonly sourceType: PlanningItem["sourceType"];
  /** The partner's own label, or null → the caller renders its fallback noun. */
  readonly label: string | null;
  /** First shared day of the two inclusive ranges, "YYYY-MM-DD" (UTC). */
  readonly overlapStart: string;
}

/**
 * W12 item C — the VISIBLE counterpart of `hiddenConflictSources`.
 *
 * THE DEFECT THIS EXISTS FOR. A conflicted row rendered a bare red badge:
 * "Dates overlap". Overlap with *what*? The page already knew — `detectConflicts`
 * returns the pair and the first shared day — and it already said so when the
 * partner was HIDDEN by a filter. So the reader learned strictly LESS when the
 * partner was on screen than when it was filtered away, which is backwards.
 * Naming the counterpart turns a flag into something a person can act on
 * without opening every row on the day to find the collision themselves.
 *
 * NO NEW DISCLOSURE, BY CONSTRUCTION. Two independent reasons: every conflict
 * partner is already the caller's OWN dated commitment (`isConflictEligible`
 * admits only incoming accepted bookings, personally assigned projects and own
 * approved absences), and this function returns partners that are in
 * `visibleItems` — i.e. rows whose label and dates the same page is rendering
 * anyway. It adds no field the reader cannot already read one row away.
 *
 * That is why this may carry the LABEL while `hiddenConflictSources`
 * deliberately carries only the source TYPE: a hidden partner is one the
 * reader's own filter removed, so it is named as narrowly as still explains
 * the badge.
 *
 * Pure. No new read, no new store — it re-reads the conflicts the page has
 * already computed from the full (unfiltered) model.
 */
export function visibleConflictPartners(
  conflicts: readonly PlanningConflict[],
  allItems: readonly PlanningItem[],
  visibleItems: readonly PlanningItem[],
): ReadonlyMap<string, readonly VisibleConflictPartner[]> {
  const visibleIds = new Set(visibleItems.map((i) => i.id));
  const byId = new Map(allItems.map((i) => [i.id, i]));
  const out = new Map<string, VisibleConflictPartner[]>();

  const note = (ownerId: string, partnerId: string, overlapStart: string): void => {
    // Both ends must be on screen: the hidden case is the other function's job,
    // and naming an off-screen row here would duplicate that note.
    if (!visibleIds.has(ownerId) || !visibleIds.has(partnerId)) return;
    const partner = byId.get(partnerId);
    if (!partner) return;
    const list = out.get(ownerId) ?? [];
    if (list.some((p) => p.id === partner.id)) return;
    list.push({
      id: partner.id,
      sourceType: partner.sourceType,
      label: partner.label,
      overlapStart,
    });
    out.set(ownerId, list);
  };

  for (const c of conflicts) {
    note(c.aId, c.bId, c.overlapStart);
    note(c.bId, c.aId, c.overlapStart);
  }

  // Earliest overlap first, then a stable tiebreak, so the rendered sentence
  // never reshuffles between two requests over identical data.
  for (const [, list] of out) {
    list.sort(
      (x, y) =>
        x.overlapStart.localeCompare(y.overlapStart) ||
        x.sourceType.localeCompare(y.sourceType) ||
        x.id.localeCompare(y.id),
    );
  }
  return out;
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
  /** A Work Journal entry is recorded on this day (D-13) — same distinction
   *  the month grid makes, so the two surfaces cannot disagree. */
  readonly hasJournal: boolean;
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

/** Dated items that still lie ahead — the set planning reasons about. Past
 *  bands are history and stay on their own source surface. */
function activeDated(
  items: readonly PlanningItem[],
  todayIso: string,
): readonly PlanningItem[] {
  return items.filter((it) => {
    if (!it.startDate) return false;
    const end = effectiveEndDay(it);
    return !(end && end < todayIso);
  });
}

/**
 * Build the compact agenda for a reference date (pure, deterministic).
 * Grouping rule: ongoing → today; future within the window → its start day;
 * beyond the window → "later"; no start date → "undated"; already finished →
 * counted, not listed (planning looks forward; history stays on the source).
 *
 * `truthItems` is the FULL model when the caller renders a filtered subset.
 * The grouped lists and the strip COUNTS follow `items` (a filter decides what
 * is shown), while conflicts and the strip's journal mark are derived from
 * `truthItems` — a source filter must not be able to change what is true.
 * Defaults to `items`, so every caller that never filters is unaffected.
 */
export function buildAgenda(
  items: readonly PlanningItem[],
  referenceDate: Date,
  windowDays: number = PLANNING_WINDOW_DAYS,
  truthItems: readonly PlanningItem[] = items,
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
  // "later" ones) so an overlap is never hidden by the window size — and over
  // the FULL model, so a source filter cannot hide one either.
  const truthActive = truthItems === items ? active : activeDated(truthItems, today);
  const conflicts = detectConflicts(truthActive);
  const conflictIds = conflictItemIds(conflicts);

  const weekStrip: WeekStripDay[] = [];
  for (let i = 0; i < PLANNING_WEEK_STRIP_DAYS; i++) {
    const day = addDays(today, i);
    const covering = active.filter((it) => itemCoversDay(it, day));
    weekStrip.push({
      day,
      isToday: i === 0,
      count: covering.length,
      // A rendered row is marked when it really is in conflict — the partner
      // may well be one the filter removed, which is precisely the case that
      // used to lose the mark.
      hasConflict: covering.some((it) => conflictIds.has(it.id)),
      // "Did I record this day?" is a fact about the day, not about what the
      // filter is showing.
      hasJournal: truthActive.some(
        (it) => it.sourceType === "journal" && itemCoversDay(it, day),
      ),
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
  /** A Work Journal entry is recorded on this day (D-13). A bare `count`
   *  cannot answer "which days did I fill?" — a day holding one booking and a
   *  day holding one journal entry both render "1". */
  readonly hasJournal: boolean;
  /** A PAST day the person was committed to work (their own accepted booking
   *  or a project they are assigned to) that carries no journal entry yet —
   *  the "still unfilled" question. Never set for today or the future: a day
   *  that has not happened cannot be missing its record. */
  readonly isUnfilled: boolean;
}

/**
 * Does this row mean the person was ACTUALLY EXPECTED TO WORK that day?
 *
 * Deliberately narrow, and narrower than `isConflictEligible`: only the
 * caller's OWN confirmed commitments count — an accepted incoming booking and
 * a project they are personally assigned to. A proposal is not yet work; a
 * managed project band is somebody else's schedule; an absence is the
 * opposite of work; an invitation or finance row says nothing about a shift.
 *
 * This predicate exists so "unfilled" can only ever be claimed about a day the
 * product can PROVE was a working day. Marking every empty past day as unfilled
 * would nag people about weekends and holidays the product knows nothing about.
 */
export function indicatesExpectedWork(item: PlanningItem): boolean {
  if (!item.startDate) return false;
  if (item.sourceType === "booking") {
    return item.status === "accepted" && item.roleContext === "incoming";
  }
  if (item.sourceType === "project") return item.roleContext === "assigned";
  return false;
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
  truthItems: readonly PlanningItem[] = items,
): MonthGrid {
  const month = anchorDay.slice(0, 7);
  const gridStart = startOfWeekMonday(firstDayOfMonth(anchorDay));
  const lastOfMonth = addDays(addMonths(firstDayOfMonth(anchorDay), 1), -1);
  const gridEnd = addDays(startOfWeekMonday(lastOfMonth), 6);
  const conflictIds = conflictItemIds(detectConflicts(truthItems));

  const weeks: CalendarDayCell[][] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
    const row: CalendarDayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i);
      const covering = itemsForDay(items, day);
      // The two marks below answer questions about the DAY, so they read the
      // full model. Reading the filtered list made `?source=booking` erase the
      // journal rows that prove a day was recorded, and the cell then claimed
      // the day was unfilled — a false statement about the person's own work.
      const truthCovering =
        truthItems === items ? covering : itemsForDay(truthItems, day);
      const hasJournal = truthCovering.some((it) => it.sourceType === "journal");
      row.push({
        day,
        inMonth: day.slice(0, 7) === month,
        isToday: day === todayIso,
        // COUNT is a render question — it still follows the filter.
        count: covering.length,
        hasConflict: covering.some((it) => conflictIds.has(it.id)),
        hasJournal,
        // Strictly BEFORE today: today is still being lived, and a future day
        // cannot be missing a record of work that has not happened.
        isUnfilled:
          day < todayIso &&
          !hasJournal &&
          truthCovering.some(indicatesExpectedWork),
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
  // The finance row subset deliberately carries no place, no organization
  // and no third-party name (the calendar projection drops money and
  // third-party identity by design), so every §7.1 field is absent here.
  const meta = planningMeta();
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
    ...meta,
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
  // The invited person IS the counterpart on this row (the caller invited
  // them, so the name is already theirs to see).
  const meta = planningMeta({ counterpart: name });
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
    ...meta,
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
  const meta = planningMeta({
    organization: row.organizationName,
    project: row.projectTitle,
    counterpart: row.inviterName,
  });
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
    ...meta,
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
  // An absence is a whole-day band on the person's OWN plan: it carries no
  // place, no project and no counterpart, and the calendar says nothing it
  // does not know. The day span IS the duration.
  const meta = planningMeta({
    duration: daySpanDays(start, toIsoDay(row.endDate)),
  });
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
    ...meta,
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
  // A stage belongs to a real project; the band itself is its duration.
  const meta = planningMeta({
    project: row.projectTitle,
    duration: daySpanDays(start ?? end, end),
  });
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
    ...meta,
  };
}
