import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import {
  buildAgenda,
  buildMonthGrid,
  buildWeekView,
  buildYearOverview,
  conflictItemIds,
  detectConflicts,
  isPlanningSourceType,
  isPlanningView,
  itemsForDay,
  navAnchors,
  parseIsoDay,
  visibleRange,
  PLANNING_SOURCE_TYPES,
  PLANNING_VIEWS,
  type PlanningItem,
  type PlanningSourceType,
  type PlanningView,
} from "@/lib/planning/planning-model";
import {
  getPlanning,
  type PlanningSources,
} from "@/lib/planning/planning";

/**
 * THE canonical calendar (core-network area C) — one planning surface over
 * the records that really exist. The calendar is a PLAN (bookings, project
 * date bands, task due dates); the work journal is FACT (dated entries at
 * their real recorded day). No source record is duplicated — every event
 * links back to its real object, and editing happens on the source.
 *
 * Views: year / month / week / day / agenda, driven by plain searchParams
 * (?view, ?date, ?source) — server component, no calendar library, no
 * client state, UTC calendar-day math (locale switching can never move an
 * event to another day).
 *
 * Honest by construction (guard: lib/guards/planning.test.ts):
 *  - composes ONLY the existing RLS-scoped reads; each source degrades
 *    independently into a calm per-source note — never fake rows;
 *  - sources with no real model yet (leave/sickness, meetings, holidays,
 *    availability windows, service-order dates, instruction due dates) are
 *    ABSENT and documented as blockers in
 *    docs/launch/canonical-calendar-contract-v1.md — not simulated;
 *  - conflict flags mirror the booking accept guard's inclusive date-range
 *    overlap and mark only REAL overlapping personal commitments.
 */

export const dynamic = "force-dynamic";

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const CHIP_ACTIVE = "border-brand-blue text-brand-blue";
const CHIP_IDLE = "border-ink-500 text-text-secondary hover:border-brand-blue";

const SOURCE_TONE: Record<PlanningSourceType, string> = {
  booking: "border-brand-blue/40 text-brand-blue",
  project: "border-brand-orange/40 text-brand-orange",
  task: "border-state-success/40 text-state-success",
  journal: "border-brand-cyan/40 text-brand-cyan",
  finance: "border-state-warning/40 text-state-warning",
  invitation: "border-brand-purple/40 text-brand-purple",
  // Time Engine W2: the W6/W7 sources joined the canonical calendar.
  absence: "border-state-amber/40 text-state-amber",
  stage: "border-brand-violet/40 text-brand-violet",
};

/** Canonical href — omits defaults so the clean URL stays canonical. */
function planningHref(opts: {
  view?: PlanningView;
  date?: string | null;
  source?: PlanningSourceType | null;
  today: string;
}): string {
  const params = new URLSearchParams();
  if (opts.view && opts.view !== "agenda") params.set("view", opts.view);
  if (opts.date && opts.date !== opts.today) params.set("date", opts.date);
  if (opts.source) params.set("source", opts.source);
  const qs = params.toString();
  return qs ? `/dashboard/planning?${qs}` : "/dashboard/planning";
}

export default async function PlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ source?: string; view?: string; date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { source: rawSource, view: rawView, date: rawDate } = await searchParams;
  const sourceFilter = isPlanningSourceType(rawSource) ? rawSource : null;
  const view: PlanningView = isPlanningView(rawView) ? rawView : "agenda";
  const today = new Date().toISOString().slice(0, 10);
  const anchor = parseIsoDay(rawDate) ?? today;
  const range = visibleRange(view, anchor);

  const t = await getTranslations("planning");
  // Un-namespaced translator for the source-native status keys the items
  // carry (bookings.status.*, tasks.status.*, planning.*Status.*).
  const tAll = await getTranslations();

  const result = await getPlanning({
    rangeStart: range.start,
    rangeEnd: range.end,
  });

  const header = (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="text-sm text-text-secondary">{t("intro")}</p>
    </header>
  );

  if (result.status === "not-authed") {
    return (
      <div className="flex flex-col gap-6" data-testid="planning-page">
        {header}
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {t("notAuthed")}
        </p>
      </div>
    );
  }

  const visibleItems = sourceFilter
    ? result.items.filter((i) => i.sourceType === sourceFilter)
    : result.items;
  const conflictIds = conflictItemIds(detectConflicts(visibleItems));

  const dayFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const shortFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });
  const monthFmt = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  });
  const monthOnlyFmt = new Intl.DateTimeFormat(locale, { month: "long" });
  const stripFmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const utc = (dayIso: string) => new Date(`${dayIso}T00:00:00Z`);
  const fmtDay = (dayIso: string) => dayFmt.format(utc(dayIso));
  const fmtShort = (dayIso: string) => shortFmt.format(utc(dayIso));

  /**
   * Localized duration. Two honest shapes only, both from real source data:
   * `"<n>|<unit>"` (the journal's own quantity metric with a TIME unit) and
   * a bare day count (an inclusive date band). Anything else is dropped
   * rather than rendered as an unlabelled number.
   */
  function durationLabel(raw: string): string | null {
    if (raw.includes("|")) {
      const [value, unit] = raw.split("|", 2);
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      const key = `meta.unit.${unit}`;
      return t.has(key) ? `${n} ${t(key)}` : null;
    }
    const days = Number(raw);
    if (!Number.isFinite(days)) return null;
    return `${days} ${t("meta.unit.days")}`;
  }

  function ItemRow({ item }: { item: PlanningItem }) {
    const conflict = conflictIds.has(item.id);
    const contextKey =
      item.sourceType === "booking" || item.sourceType === "invitation"
        ? `context.${item.roleContext}`
        : null;
    return (
      <li>
        {/* The whole row links the REAL source object — planning duplicates
            no record and owns no detail page. */}
        <Link
          href={item.href as "/dashboard"}
          data-testid={`planning-item-${item.id}`}
          className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-800/30 px-4 py-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${SOURCE_TONE[item.sourceType]}`}
            >
              {t(`source.${item.sourceType}`)}
            </span>
            <span className="min-w-0 break-words text-sm font-semibold text-text-primary">
              {item.label ?? t(`fallback.${item.sourceType}`)}
            </span>
            {conflict ? (
              <span
                className="inline-flex items-center rounded-full border border-state-danger/50 bg-state-danger/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-danger"
                data-testid={`planning-conflict-${item.id}`}
              >
                {t("conflict.flag")}
              </span>
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
            {item.startDate ? (
              <span>
                {fmtShort(item.startDate)}
                {item.endDate && item.endDate !== item.startDate
                  ? ` – ${fmtShort(item.endDate)}`
                  : ""}
              </span>
            ) : (
              <span>{t("undated.title")}</span>
            )}
            {/* §7.1 TIME + DURATION — real clock time when the source stored
                one, real length when the source recorded one. */}
            {item.startTime ? (
              <span data-testid={`planning-time-${item.id}`}>{item.startTime}</span>
            ) : null}
            {item.duration ? (
              <span data-testid={`planning-duration-${item.id}`}>
                {durationLabel(item.duration)}
              </span>
            ) : null}
            <span>{tAll(item.statusKey)}</span>
            <span>{t(`source.${item.sourceType}`)}</span>
            {item.detail ? <span>{item.detail}</span> : null}
            {contextKey ? <span>{t(contextKey)}</span> : null}
          </span>
          {/* §7.1 THE WORK CONTEXT ROW — workspace · project · place ·
              organization · counterpart. Rendered only for the fields the
              source really carries; a row with none of them shows nothing
              extra rather than a line of dashes. */}
          {[item.workspace, item.project, item.place, item.organization, item.counterpart].some(
            Boolean,
          ) ? (
            <span
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-secondary"
              data-testid={`planning-context-${item.id}`}
            >
              {item.workspace ? (
                <span>
                  <span className="text-text-muted">{t("meta.workspace")}: </span>
                  {item.workspace}
                </span>
              ) : null}
              {/* The project name is not repeated when it is already the row's
                  own title (project rows) or its detail line (stages). */}
              {item.project && item.project !== item.label && item.project !== item.detail ? (
                <span>
                  <span className="text-text-muted">{t("meta.project")}: </span>
                  {item.project}
                </span>
              ) : null}
              {item.place && item.place !== item.detail ? (
                <span>
                  <span className="text-text-muted">{t("meta.place")}: </span>
                  {item.place}
                </span>
              ) : null}
              {item.organization && item.organization !== item.workspace ? (
                <span>
                  <span className="text-text-muted">{t("meta.organization")}: </span>
                  {item.organization}
                </span>
              ) : null}
              {item.counterpart ? (
                <span>
                  <span className="text-text-muted">{t("meta.counterpart")}: </span>
                  {item.counterpart}
                </span>
              ) : null}
            </span>
          ) : null}
        </Link>
      </li>
    );
  }

  function ItemList({
    items,
    testid,
  }: {
    items: readonly PlanningItem[];
    testid: string;
  }) {
    return (
      <ul className="flex flex-col gap-2" data-testid={testid}>
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </ul>
    );
  }

  /* ---------------- view-specific projections ---------------- */

  const agenda =
    view === "agenda" ? buildAgenda(visibleItems, utc(anchor)) : null;
  const monthGrid =
    view === "month" ? buildMonthGrid(anchor, visibleItems, today) : null;
  const weekDays =
    view === "week" ? buildWeekView(anchor, visibleItems, today) : null;
  const yearCells =
    view === "year"
      ? buildYearOverview(Number(anchor.slice(0, 4)), visibleItems, today)
      : null;
  const dayItems = view === "day" ? itemsForDay(visibleItems, anchor) : null;

  const { prev, next } = navAnchors(view, anchor);

  const periodLabel =
    view === "year"
      ? anchor.slice(0, 4)
      : view === "month"
        ? monthFmt.format(utc(firstOf(anchor)))
        : view === "week"
          ? `${fmtShort(weekDays?.[0]?.day ?? anchor)} – ${fmtShort(weekDays?.[6]?.day ?? anchor)}`
          : fmtDay(anchor);

  function firstOf(dayIso: string): string {
    return `${dayIso.slice(0, 7)}-01`;
  }

  const hasAnything = agenda
    ? agenda.days.length > 0 || agenda.later.length > 0 || agenda.undated.length > 0
    : visibleItems.length > 0;

  return (
    <div className="flex flex-col gap-6" data-testid="planning-page">
      {header}

      <SourceNotes sources={result.sources} t={t} />

      {/* View switcher — plain searchParams links, keyboard accessible. */}
      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label={t("views.label")}
        data-testid="planning-views"
      >
        {PLANNING_VIEWS.map((v) => (
          <Link
            key={v}
            href={planningHref({ view: v, date: anchor, source: sourceFilter, today }) as "/dashboard"}
            aria-current={view === v ? "true" : undefined}
            data-testid={`planning-view-${v}`}
            className={`${CHIP_BASE} ${view === v ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </nav>

      {/* Date navigation: previous / today / next + a native date picker
          (GET form — no client state; the URL is the whole state). */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="planning-date-nav"
      >
        <Link
          href={planningHref({ view, date: prev, source: sourceFilter, today }) as "/dashboard"}
          aria-label={t("nav.prev")}
          data-testid="planning-nav-prev"
          className={`${CHIP_BASE} ${CHIP_IDLE}`}
        >
          ←
        </Link>
        <Link
          href={planningHref({ view, source: sourceFilter, today }) as "/dashboard"}
          data-testid="planning-nav-today"
          className={`${CHIP_BASE} ${anchor === today ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {t("nav.today")}
        </Link>
        <Link
          href={planningHref({ view, date: next, source: sourceFilter, today }) as "/dashboard"}
          aria-label={t("nav.next")}
          data-testid="planning-nav-next"
          className={`${CHIP_BASE} ${CHIP_IDLE}`}
        >
          →
        </Link>
        <span
          className="min-w-0 break-words text-sm font-semibold text-text-primary"
          data-testid="planning-period-label"
        >
          {periodLabel}
        </span>
        <form
          action={`/${locale}/dashboard/planning`}
          method="get"
          className="ml-auto flex items-center gap-2"
          data-testid="planning-date-picker"
        >
          {view !== "agenda" ? <input type="hidden" name="view" value={view} /> : null}
          {sourceFilter ? <input type="hidden" name="source" value={sourceFilter} /> : null}
          <label className="sr-only" htmlFor="planning-date-input">
            {t("nav.dateLabel")}
          </label>
          <input
            id="planning-date-input"
            type="date"
            name="date"
            defaultValue={anchor}
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-xs text-text-primary"
          />
          <button type="submit" className={`${CHIP_BASE} ${CHIP_IDLE}`}>
            {t("nav.go")}
          </button>
        </form>
      </div>

      {/* Source filter — plain searchParams links. */}
      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label={t("filters.label")}
        data-testid="planning-filters"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("filters.label")}
        </span>
        <Link
          href={planningHref({ view, date: anchor, source: null, today }) as "/dashboard"}
          aria-current={sourceFilter === null ? "true" : undefined}
          data-testid="planning-filter-all"
          className={`${CHIP_BASE} ${sourceFilter === null ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {t("filters.all")}
        </Link>
        {PLANNING_SOURCE_TYPES.map((s) => (
          <Link
            key={s}
            href={planningHref({ view, date: anchor, source: s, today }) as "/dashboard"}
            aria-current={sourceFilter === s ? "true" : undefined}
            data-testid={`planning-filter-${s}`}
            className={`${CHIP_BASE} ${sourceFilter === s ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {t(`source.${s}`)}
          </Link>
        ))}
      </nav>

      {/* ---------------- MONTH ---------------- */}
      {monthGrid ? (
        <section className="flex flex-col gap-2" data-testid="planning-month">
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.weeks[0]?.map((cell) => (
              <span
                key={`hdr-${cell.day}`}
                className="text-center font-mono text-meta uppercase tracking-label text-text-muted"
              >
                {stripFmt.format(utc(cell.day))}
              </span>
            ))}
            {monthGrid.weeks.flat().map((cell) => (
              <Link
                key={cell.day}
                href={planningHref({ view: "day", date: cell.day, source: sourceFilter, today }) as "/dashboard"}
                data-testid={`planning-month-cell-${cell.day}`}
                className={`flex min-h-14 min-w-0 flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                  cell.isToday
                    ? "border-brand-blue/60 bg-brand-blue/5"
                    : cell.inMonth
                      ? "border-ink-600 bg-ink-800/20"
                      : "border-ink-700/60 bg-transparent opacity-50"
                }`}
              >
                <span className="text-sm font-semibold tabular-nums text-text-primary">
                  {cell.day.slice(8, 10)}
                </span>
                {cell.count > 0 ? (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-meta font-bold leading-none tabular-nums ${
                      cell.hasConflict
                        ? "bg-state-danger/15 text-state-danger"
                        : "bg-brand-blue/15 text-brand-blue"
                    }`}
                  >
                    {cell.count}
                  </span>
                ) : (
                  <span className="h-5 text-meta text-text-muted">·</span>
                )}
              </Link>
            ))}
          </div>
          <p className="text-xs text-text-muted">{t("month.hint")}</p>
        </section>
      ) : null}

      {/* ---------------- WEEK ---------------- */}
      {weekDays ? (
        <section className="flex flex-col gap-4" data-testid="planning-week-view">
          {weekDays.map((d) => (
            <div key={d.day} className="flex flex-col gap-2">
              <h2 className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-secondary">
                <Link
                  href={planningHref({ view: "day", date: d.day, source: sourceFilter, today }) as "/dashboard"}
                  className="hover:text-brand-blue"
                >
                  {fmtDay(d.day)}
                </Link>
                {d.isToday ? (
                  <span className="inline-flex items-center rounded-full border border-brand-blue/50 bg-brand-blue/10 px-2 py-0.5 text-meta text-brand-blue">
                    {t("today")}
                  </span>
                ) : null}
              </h2>
              {d.items.length > 0 ? (
                <ItemList items={d.items} testid={`planning-week-day-${d.day}`} />
              ) : (
                <p className="text-xs text-text-muted">—</p>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {/* ---------------- DAY ---------------- */}
      {dayItems ? (
        <section className="flex flex-col gap-2" data-testid="planning-day-view">
          {dayItems.length > 0 ? (
            <ItemList items={dayItems} testid={`planning-day-${anchor}`} />
          ) : (
            <p
              className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary"
              data-testid="planning-day-empty"
            >
              {t("day.empty")}
            </p>
          )}
        </section>
      ) : null}

      {/* ---------------- YEAR ---------------- */}
      {yearCells ? (
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
          data-testid="planning-year-view"
        >
          {yearCells.map((m) => (
            <Link
              key={m.month}
              href={planningHref({ view: "month", date: `${m.month}-01`, source: sourceFilter, today }) as "/dashboard"}
              data-testid={`planning-year-${m.month}`}
              className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                m.isCurrent
                  ? "border-brand-blue/60 bg-brand-blue/5"
                  : "border-ink-600 bg-ink-800/20"
              }`}
            >
              <span className="text-sm font-semibold capitalize text-text-primary">
                {monthOnlyFmt.format(utc(`${m.month}-01`))}
              </span>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("year.count", { count: m.count })}
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      {/* ---------------- AGENDA ---------------- */}
      {agenda ? (
        <>
          {/* Week strip — seven cells of plain date math (informational). */}
          <section
            className="flex flex-col gap-2"
            aria-label={t("week.label")}
            data-testid="planning-week-strip"
          >
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("week.label")}
            </span>
            <div className="grid grid-cols-7 gap-1">
              {agenda.weekStrip.map((d) => (
                <Link
                  key={d.day}
                  href={planningHref({ view: "day", date: d.day, source: sourceFilter, today }) as "/dashboard"}
                  data-testid={`planning-strip-${d.day}`}
                  className={`flex min-w-0 flex-col items-center gap-0.5 rounded-md border px-1 py-2 transition-colors hover:border-brand-blue ${
                    d.isToday
                      ? "border-brand-blue/60 bg-brand-blue/5"
                      : "border-ink-600 bg-ink-800/20"
                  }`}
                >
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {stripFmt.format(utc(d.day))}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-text-primary">
                    {d.day.slice(8, 10)}
                  </span>
                  {d.count > 0 ? (
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-meta font-bold leading-none tabular-nums ${
                        d.hasConflict
                          ? "bg-state-danger/15 text-state-danger"
                          : "bg-brand-blue/15 text-brand-blue"
                      }`}
                    >
                      {d.count}
                    </span>
                  ) : (
                    <span className="h-5 text-meta text-text-muted">·</span>
                  )}
                </Link>
              ))}
            </div>
          </section>

          {!hasAnything ? (
            <EmptyState t={t} sourceFilter={sourceFilter} />
          ) : (
            <section className="flex flex-col gap-4" data-testid="planning-agenda">
              {agenda.days.map((group) => (
                <div key={group.day} className="flex flex-col gap-2">
                  <h2 className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-secondary">
                    {fmtDay(group.day)}
                    {group.isToday ? (
                      <span className="inline-flex items-center rounded-full border border-brand-blue/50 bg-brand-blue/10 px-2 py-0.5 text-meta text-brand-blue">
                        {t("today")}
                      </span>
                    ) : null}
                  </h2>
                  <ItemList
                    items={group.items}
                    testid={`planning-day-${group.day}`}
                  />
                </div>
              ))}

              {agenda.later.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                    {t("later.title")}
                  </h2>
                  <ItemList items={agenda.later} testid="planning-later" />
                </div>
              ) : null}

              {agenda.undated.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                    {t("undated.title")}
                  </h2>
                  <p className="text-xs text-text-muted">{t("undated.hint")}</p>
                  <ItemList items={agenda.undated} testid="planning-undated" />
                </div>
              ) : null}
            </section>
          )}

          {agenda.pastCount > 0 ? (
            /* Honest history note: finished items are not hidden silently. */
            <p className="text-xs text-text-muted" data-testid="planning-past-note">
              {t("pastHidden", { count: agenda.pastCount })}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Non-agenda empty state (month/week/day/year render their shells
          above; agenda handles its own). */}
      {!agenda && !hasAnything && view !== "day" ? (
        <EmptyState t={t} sourceFilter={sourceFilter} />
      ) : null}
    </div>
  );
}

/** Calm empty state with REAL next actions — every link is a live route. */
function EmptyState({
  t,
  sourceFilter,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  sourceFilter: PlanningSourceType | null;
}) {
  const actions: { href: string; key: string; testid: string }[] = [
    { href: "/dashboard/bookings", key: "emptyActions.bookings", testid: "planning-empty-cta-bookings" },
    { href: "/dashboard/tasks", key: "emptyActions.tasks", testid: "planning-empty-cta-tasks" },
    { href: "/dashboard/journal", key: "emptyActions.journal", testid: "planning-empty-cta-journal" },
  ];
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-dashed border-ink-500 p-5"
      data-testid="planning-empty"
    >
      <p className="text-sm text-text-secondary">
        {sourceFilter ? t("emptyFiltered") : t("empty")}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.key}
            href={a.href as "/dashboard"}
            data-testid={a.testid}
            className="inline-flex min-h-9 items-center rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue transition-colors hover:border-brand-blue"
          >
            {t(a.key)}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Per-source honest degradation notes — a source that cannot contribute
 *  says so calmly; it never crashes the plan and never fakes rows. */
function SourceNotes({
  sources,
  t,
}: {
  sources: PlanningSources;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const notes: { key: string; testid: string }[] = [];
  if (sources.booking.status === "unavailable") {
    notes.push({
      key: "sourceNotes.bookingUnavailable",
      testid: "planning-source-note-booking",
    });
  }
  if (sources.task.status === "unavailable") {
    notes.push({
      key: "sourceNotes.taskUnavailable",
      testid: "planning-source-note-task",
    });
  }
  if (sources.task.status === "error") {
    notes.push({
      key: "sourceNotes.taskError",
      testid: "planning-source-note-task-error",
    });
  }
  if (sources.project.status === "managers-only") {
    notes.push({
      key: "sourceNotes.projectManagersOnly",
      testid: "planning-source-note-project",
    });
  }
  if (sources.project.status === "error") {
    notes.push({
      key: "sourceNotes.projectError",
      testid: "planning-source-note-project-error",
    });
  }
  if (sources.journal.status === "error") {
    notes.push({
      key: "sourceNotes.journalError",
      testid: "planning-source-note-journal-error",
    });
  }
  if (sources.finance.status === "unavailable") {
    notes.push({
      key: "sourceNotes.financeUnavailable",
      testid: "planning-source-note-finance",
    });
  }
  if (sources.finance.status === "error") {
    notes.push({
      key: "sourceNotes.financeError",
      testid: "planning-source-note-finance-error",
    });
  }
  if (sources.invitation.status === "unavailable") {
    notes.push({
      key: "sourceNotes.invitationUnavailable",
      testid: "planning-source-note-invitation",
    });
  }
  if (sources.invitation.status === "error") {
    notes.push({
      key: "sourceNotes.invitationError",
      testid: "planning-source-note-invitation-error",
    });
  }
  if (sources.absence.status === "unavailable") {
    notes.push({
      key: "sourceNotes.absenceUnavailable",
      testid: "planning-source-note-absence",
    });
  }
  if (sources.absence.status === "error") {
    notes.push({
      key: "sourceNotes.absenceError",
      testid: "planning-source-note-absence-error",
    });
  }
  if (sources.stage.status === "unavailable") {
    notes.push({
      key: "sourceNotes.stageUnavailable",
      testid: "planning-source-note-stage",
    });
  }
  if (sources.stage.status === "error") {
    notes.push({
      key: "sourceNotes.stageError",
      testid: "planning-source-note-stage-error",
    });
  }
  // journal "workers-only" is silent by design: a company owner without a
  // worker profile simply has no journal facts — that is normal, not a
  // condition to explain.
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="planning-source-notes">
      {notes.map((n) => (
        <p
          key={n.key}
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-text-secondary"
          data-testid={n.testid}
        >
          {t(n.key)}
        </p>
      ))}
    </div>
  );
}
