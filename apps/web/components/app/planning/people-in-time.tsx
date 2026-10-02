import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { EpistemicMark } from "@/components/app/planning/epistemic-mark";
import { playerInitials } from "@/lib/identity/player-identity";
import { createUtcFormatter } from "@/lib/time/display";
import type { RosterTimeline, TimelineBar, TimelineKind, TimelinePerson } from "@/lib/planning/roster-timeline-model";
import {
  assignLanes,
  buildCapacityBand,
  epistemicForBar,
  nowAndNext,
  type CapacityDay,
} from "@/lib/planning/time-lens";
import { cn } from "@/lib/utils";

/**
 * PEOPLE IN TIME — the roster on one time axis (Work in Time, perspective 2).
 *
 * Each person is a lane. A bar is something that BINDS or REMOVES them on
 * those days (a project assignment, an accepted booking, a trip, approved
 * leave); overlapping bars stack in their own lanes, so an overlap is seen as
 * two bars on the same days instead of one covering the other. The top band is
 * the roster's capacity per day — committed (gold), away (amber) — and the
 * remainder is drawn as a dotted outline: NOTHING ON RECORD, which is not
 * "free" and is never coloured as if it were.
 *
 * Pure presentation over `RosterTimeline` (the model the company planning zone
 * already builds). No read, no inference. Mobile is a different hierarchy, not
 * a squeezed axis: per person, NOW then NEXT, then a one-row density strip.
 */

const BAR_TONE: Record<TimelineKind, string> = {
  project: "border-brand-blue/60 bg-brand-blue/25",
  booking: "border-brand-cyan/60 bg-brand-cyan/20",
  trip: "border-brand-violet/60 bg-brand-violet/20",
  absence: "border-state-amber/60 bg-state-amber/20",
};
const LANE_H = 24; // px, one bar lane
const LANE_GAP = 4;

function weekendGradient(days: readonly CapacityDay[]): string {
  const stops: string[] = [];
  for (const d of days) {
    if (!d.weekend) continue;
    const a = d.leftPct.toFixed(3);
    const b = (d.leftPct + d.widthPct).toFixed(3);
    stops.push(`transparent ${a}%`, `transparent ${a}%`);
    stops.push(`rgb(var(--c-ink-600) / 0.3) ${a}%`, `rgb(var(--c-ink-600) / 0.3) ${b}%`);
    stops.push(`transparent ${b}%`);
  }
  return stops.length ? `linear-gradient(to right, ${stops.join(", ")})` : "none";
}

export async function PeopleInTime({
  timeline,
  avatars,
  today,
  locale,
  focusWorkerId,
  hrefs,
  absenceReadFailed,
  withoutRecord,
}: {
  readonly timeline: RosterTimeline;
  readonly avatars: Readonly<Record<string, string | null>>;
  readonly today: string;
  readonly locale: string;
  readonly focusWorkerId: string | null;
  readonly hrefs: {
    readonly prev: string;
    readonly next: string;
    readonly today: string;
    readonly person: (workerId: string) => string;
  };
  /** The approved-absence read failed: leave is UNKNOWN, not absent. */
  readonly absenceReadFailed: boolean;
  /** Roster people with NOTHING on record: not drawn as lanes, counted here. */
  readonly withoutRecord: number;
}) {
  const t = await getTranslations("workInTime");
  const tickFmt = createUtcFormatter(locale, { day: "numeric", month: "short" });
  const rangeFmt = createUtcFormatter(locale, { day: "numeric", month: "long" });
  const dayFmt = createUtcFormatter(locale, { weekday: "short", day: "numeric", month: "short" });
  const capacity = buildCapacityBand(timeline, withoutRecord);
  const total = timeline.people.length + withoutRecord;
  const peak = capacity.reduce((m, d) => (d.committed > m.committed ? d : m), capacity[0]);
  const weekendBg = weekendGradient(capacity);

  const summary = peak
    ? t("people.capacitySummary", {
        total,
        peak: peak.committed,
        date: dayFmt(peak.day) ?? peak.day,
      })
    : "";
  const label = (b: TimelineBar) =>
    b.kind === "absence" ? t("people.away") : (b.label ?? t(`people.kind.${b.kind}`));
  const range = (s: string, e: string) =>
    s === e ? (tickFmt(s) ?? s) : `${tickFmt(s) ?? s} – ${tickFmt(e) ?? e}`;

  const chip =
    "inline-flex min-h-11 items-center rounded-md border px-3 text-support transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

  return (
    <section className="flex flex-col gap-5" aria-labelledby="wit-people-title" data-testid="wit-people">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="wit-people-title" className="font-display text-xl font-bold tracking-tightest text-text-primary">
            {t("people.title")}
          </h2>
          <p className="max-w-prose text-sm text-text-secondary">{t("people.intro")}</p>
        </div>
        <nav className="flex items-center gap-2" aria-label={t("window.label")} data-testid="wit-window-nav">
          <Link href={hrefs.prev as "/dashboard"} aria-label={t("window.prev")} className={cn(chip, "border-ink-500 text-text-secondary hover:border-brand-blue")}>
            ←
          </Link>
          <Link href={hrefs.today as "/dashboard"} className={cn(chip, "border-ink-500 text-text-secondary hover:border-brand-blue")}>
            {t("window.today")}
          </Link>
          <Link href={hrefs.next as "/dashboard"} aria-label={t("window.next")} className={cn(chip, "border-ink-500 text-text-secondary hover:border-brand-blue")}>
            →
          </Link>
        </nav>
      </div>
      <p className="text-support font-medium text-text-muted" data-testid="wit-window-range">
        {rangeFmt(timeline.from)} – {rangeFmt(timeline.to)}
      </p>

      {absenceReadFailed ? (
        <p role="status" className="flex items-center gap-2 rounded-md border border-dashed border-ink-500 px-3 py-2 text-sm text-text-secondary" data-testid="wit-absence-unknown">
          <EpistemicMark state="unknown" label={t("state.unknown")} />
          {t("people.absenceUnknown")}
        </p>
      ) : null}

      {/* ───────── DESKTOP: lanes on a shared axis ───────── */}
      <div className="hidden sm:block" data-testid="wit-people-axis">
        <div className="grid grid-cols-[13rem_minmax(0,1fr)] border-t border-ink-600">
          {/* axis header */}
          <div className="py-2 pr-3 text-support font-medium text-text-muted">{t("people.capacity")}</div>
          <div className="relative py-2" style={{ backgroundImage: weekendBg }}>
            <div
              role="img"
              aria-label={summary}
              className="relative flex h-10 items-end"
              data-testid="wit-capacity-band"
            >
              {capacity.map((d) => {
                const c = total > 0 ? (d.committed / total) * 100 : 0;
                const a = total > 0 ? (d.away / total) * 100 : 0;
                return (
                  <span
                    key={d.day}
                    title={t("people.capacityDay", {
                      date: dayFmt(d.day) ?? d.day,
                      committed: d.committed,
                      away: d.away,
                      noRecord: d.noRecord,
                    })}
                    className="relative flex h-full min-w-0 flex-1 flex-col-reverse justify-start border-l border-dotted border-ink-600/70 first:border-l-0"
                  >
                    <span className="wit-grow-y w-full bg-brand-blue/70" style={{ height: `${c}%` }} />
                    <span className="wit-grow-y w-full bg-state-amber/70" style={{ height: `${a}%` }} />
                  </span>
                );
              })}
              {timeline.todayPct !== null ? <NowLine pct={timeline.todayPct} /> : null}
            </div>
            <div className="relative mt-1 h-4" aria-hidden>
              {timeline.ticks.map((tick) => (
                <span key={tick.day} className="absolute top-0 text-meta tabular-nums text-text-muted" style={{ left: `${tick.leftPct}%` }}>
                  {tickFmt(tick.day) ?? tick.day}
                </span>
              ))}
            </div>
          </div>

          {timeline.people.map((p) => (
            <PersonLane
              key={p.workerId}
              person={p}
              avatarUrl={avatars[p.workerId] ?? null}
              todayPct={timeline.todayPct}
              weekendBg={weekendBg}
              selected={p.workerId === focusWorkerId}
              href={hrefs.person(p.workerId)}
              today={today}
              t={t}
              label={label}
              range={range}
              absenceReadFailed={absenceReadFailed}
            />
          ))}
        </div>
      </div>

      {/* ───────── MOBILE: now → next → density, per person ───────── */}
      <ul className="flex flex-col gap-3 sm:hidden" data-testid="wit-people-cards">
        {timeline.people.map((p) => {
          const { now, next } = nowAndNext(p.bars, today);
          const lanes = assignLanes(p.bars);
          return (
            <li key={p.workerId}>
              <Link
                href={hrefs.person(p.workerId) as "/dashboard"}
                aria-current={p.workerId === focusWorkerId ? "true" : undefined}
                data-testid={`wit-person-card-${p.workerId}`}
                className={cn(
                  "flex min-h-11 flex-col gap-3 rounded-xl border bg-ink-800/30 p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                  p.workerId === focusWorkerId ? "border-brand-blue/60" : "border-ink-600 hover:border-brand-blue/50",
                )}
              >
                <span className="flex items-center gap-3">
                  <PersonPortrait name={p.name ?? t("people.unnamed")} avatarUrl={avatars[p.workerId] ?? null} initials={playerInitials(p.name ?? "?")} width="44px" lit={p.workerId === focusWorkerId} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{p.name ?? t("people.unnamed")}</span>
                  {p.bars.some((b) => b.conflict) ? (
                    <span className="rounded-full border border-state-danger/50 bg-state-danger/10 px-2 py-0.5 text-meta font-medium text-state-danger">{t("people.overlap")}</span>
                  ) : null}
                </span>
                <span className="flex flex-col gap-1 text-support">
                  <NowNextLine kind="now" bar={now} label={label} range={range} t={t} today={today} />
                  <NowNextLine kind="next" bar={next} label={label} range={range} t={t} today={today} />
                </span>
                {/* one-row density strip over the same window */}
                <span className="relative block h-2 rounded-full bg-ink-800" style={{ backgroundImage: weekendBg }} aria-hidden>
                  {lanes.items.map(({ bar }) => (
                    <span key={bar.key} className={cn("absolute top-0 h-2 rounded-full border", BAR_TONE[bar.kind])} style={{ left: `${bar.leftPct}%`, width: `${Math.max(bar.widthPct, 1.5)}%` }} />
                  ))}
                  {timeline.todayPct !== null ? <span className="absolute -top-1 h-4 w-px bg-brand-blue" style={{ left: `${timeline.todayPct}%` }} /> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {withoutRecord > 0 ? (
        <p className="flex flex-wrap items-center gap-2 border-t border-ink-600/70 pt-3 text-sm text-text-secondary" data-testid="wit-without-record">
          <EpistemicMark state="unknown" label={t("state.unknown")} />
          {t("people.withoutRecord", { count: withoutRecord })}
        </p>
      ) : null}
      <Legend t={t} />
    </section>
  );
}

function NowLine({ pct }: { pct: number }) {
  return (
    <span
      aria-hidden
      data-testid="wit-now-line"
      className="wit-now pointer-events-none absolute inset-y-0 z-10 w-px bg-brand-blue shadow-[0_0_8px_rgb(var(--c-brand-blue)/0.7)]"
      style={{ left: `${pct}%` }}
    />
  );
}

function NowNextLine({
  kind,
  bar,
  label,
  range,
  t,
  today,
}: {
  kind: "now" | "next";
  bar: TimelineBar | null;
  label: (b: TimelineBar) => string;
  range: (s: string, e: string) => string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  today: string;
}) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="w-12 shrink-0 text-meta font-medium uppercase tracking-label text-text-muted">{t(`people.${kind}`)}</span>
      {bar ? (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-text-primary">{label(bar)}</span>
          <span className="shrink-0 tabular-nums text-text-muted">{range(bar.startDate, bar.endDate)}</span>
          <EpistemicMark state={epistemicForBar(bar, today)} label={t(`state.${epistemicForBar(bar, today)}`)} className="hidden min-[400px]:inline-flex" />
        </span>
      ) : (
        // NO RECORD is not NO WORK: this is a gap in the record, said as such.
        <span className="text-text-muted">{t("people.noRecord")}</span>
      )}
    </span>
  );
}

function PersonLane({
  person,
  avatarUrl,
  todayPct,
  weekendBg,
  selected,
  href,
  today,
  t,
  label,
  range,
  absenceReadFailed,
}: {
  person: TimelinePerson;
  avatarUrl: string | null;
  todayPct: number | null;
  weekendBg: string;
  selected: boolean;
  href: string;
  today: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  label: (b: TimelineBar) => string;
  range: (s: string, e: string) => string;
  absenceReadFailed: boolean;
}) {
  const { items, lanes } = assignLanes(person.bars);
  const height = lanes * LANE_H + (lanes + 1) * LANE_GAP;
  const name = person.name ?? t("people.unnamed");
  return (
    <>
      <div className={cn("flex items-center border-t border-ink-600/80 py-2 pr-3", selected && "bg-brand-blue/5")}>
        <Link
          href={href as "/dashboard"}
          aria-current={selected ? "true" : undefined}
          data-testid={`wit-person-${person.workerId}`}
          className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <PersonPortrait name={name} avatarUrl={avatarUrl} initials={playerInitials(person.name ?? "?")} width="36px" lit={selected} />
          <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{name}</span>
        </Link>
      </div>
      <div
        className={cn("relative border-t border-ink-600/80", selected && "bg-brand-blue/5")}
        style={{ height, backgroundImage: weekendBg }}
        data-testid={`wit-lane-${person.workerId}`}
      >
        {todayPct !== null ? <NowLine pct={todayPct} /> : null}
        {items.map(({ bar, lane }) => {
          const state = epistemicForBar(bar, today);
          return (
            <Link
              key={bar.key}
              href={href as "/dashboard"}
              title={`${label(bar)} · ${range(bar.startDate, bar.endDate)} · ${t(`state.${state}`)}`}
              data-testid={`wit-bar-${bar.key}`}
              data-kind={bar.kind}
              data-state={state}
              data-conflict={bar.conflict ? "true" : undefined}
              className={cn(
                "wit-bar absolute flex items-center overflow-hidden border px-1.5 text-meta text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                BAR_TONE[bar.kind],
                bar.clippedStart ? "rounded-l-none border-l-0" : "rounded-l-md",
                bar.clippedEnd ? "rounded-r-none border-r-0" : "rounded-r-md",
                state === "planned" && "border-dashed",
                bar.conflict && "ring-1 ring-state-danger",
              )}
              style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%`, top: LANE_GAP + lane * (LANE_H + LANE_GAP), height: LANE_H }}
            >
              <span className="truncate">{label(bar)}</span>
              <span className="sr-only">
                {" "}
                {range(bar.startDate, bar.endDate)} {t(`state.${state}`)}
                {bar.conflict ? ` ${t("people.overlap")}` : ""}
              </span>
            </Link>
          );
        })}
        {person.bars.length === 0 ? (
          <span className="absolute inset-0 flex items-center px-3 text-meta text-text-muted">
            <span className="mr-2 inline-flex h-4 flex-1 items-center rounded-sm border border-dotted border-ink-500/80 px-2">
              {absenceReadFailed ? t("people.noRecordUnknownLeave") : t("people.noRecordWindow")}
              {person.outsideWindow > 0 ? ` · ${t("people.outside", { count: person.outsideWindow })}` : ""}
            </span>
          </span>
        ) : null}
      </div>
    </>
  );
}

export async function Legend({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-600/70 pt-3 text-support text-text-muted" data-testid="wit-legend">
      <span className="font-medium text-text-secondary">{t("legend.title")}</span>
      {(["known", "planned", "confirmed", "recorded", "openNeed", "notProvided", "unknown"] as const).map((s) => (
        <EpistemicMark key={s} state={s} label={t(`state.${s}`)} />
      ))}
      <span className="basis-full text-meta">{t("legend.rule")}</span>
    </div>
  );
}
