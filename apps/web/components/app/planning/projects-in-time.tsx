import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { EpistemicMark } from "@/components/app/planning/epistemic-mark";
import { Legend } from "@/components/app/planning/people-in-time";
import { createUtcFormatter } from "@/lib/time/display";
import type { RosterTimeline } from "@/lib/planning/roster-timeline-model";
import {
  buildCapacityBand,
  type OpenNeedLane,
  type ProjectInTime,
  type ProjectsInTime as ProjectsInTimeModel,
} from "@/lib/planning/time-lens";
import { cn } from "@/lib/utils";

/**
 * PROJECTS IN TIME — project stages, staffing and open need on one axis
 * (Work in Time, perspective 3).
 *
 * Per project, three thin lanes read top to bottom: the project's own date
 * band, its dated stages, and STAFFING DENSITY — one column per day whose
 * height is how many people are assigned that day. Where a headcount was
 * stated and not covered, a dashed OPEN NEED outline sits over the band: the
 * gap is drawn as a gap, never as a shorter bar. A project without dates or
 * without a stated headcount says NOT PROVIDED instead of a made-up span.
 *
 * Only what the data layer really provides is drawn. Handovers, document and
 * certificate deadlines have no source in the planning data today; the gaps
 * note says so rather than rendering empty promises.
 */

const chip =
  "inline-flex min-h-[44px] items-center rounded-md border px-3 text-support transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue border-ink-500 text-text-secondary hover:border-brand-blue";

export async function ProjectsInTime({
  model,
  timeline,
  today,
  locale,
  focusProjectId,
  hrefs,
}: {
  readonly model: ProjectsInTimeModel;
  readonly timeline: RosterTimeline;
  readonly today: string;
  readonly locale: string;
  readonly focusProjectId: string | null;
  readonly hrefs: {
    readonly prev: string;
    readonly next: string;
    readonly today: string;
    readonly project: (projectId: string) => string;
  };
}) {
  const t = await getTranslations("workInTime");
  const tickFmt = createUtcFormatter(locale, { day: "numeric", month: "short" });
  const rangeFmt = createUtcFormatter(locale, { day: "numeric", month: "long" });
  const capacity = buildCapacityBand(timeline);
  const weekendStops: string[] = [];
  for (const d of capacity) {
    if (!d.weekend) continue;
    const a = d.leftPct.toFixed(3);
    const b = (d.leftPct + d.widthPct).toFixed(3);
    weekendStops.push(`transparent ${a}%`, `rgb(var(--c-ink-600) / 0.3) ${a}%`, `rgb(var(--c-ink-600) / 0.3) ${b}%`, `transparent ${b}%`);
  }
  const weekendBg = weekendStops.length ? `linear-gradient(to right, ${weekendStops.join(", ")})` : "none";
  const range = (s: string | null, e: string | null) =>
    !s ? t("projects.noDates") : !e || e === s ? (tickFmt(s) ?? s) : `${tickFmt(s) ?? s} – ${tickFmt(e) ?? e}`;
  const globalPeak = Math.max(1, ...model.projects.map((p) => p.peakStaffing));
  // A project with a span, a dated stage or an assignment has a place on the
  // axis. One with none of them is NOT PROVIDED: listed compactly, not drawn.
  const placed = model.projects.filter((p) => p.band !== null || p.stages.length > 0 || p.staffed.length > 0);
  const unplaced = model.projects.filter((p) => !placed.includes(p));
  const hasAnything = model.projects.length > 0 || model.needs.length > 0;

  return (
    <section className="flex flex-col gap-5" aria-labelledby="wit-projects-title" data-testid="wit-projects">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="wit-projects-title" className="font-display text-xl font-bold tracking-tightest text-text-primary">
            {t("projects.title")}
          </h2>
          <p className="max-w-prose text-sm text-text-secondary">{t("projects.intro")}</p>
        </div>
        <nav className="flex items-center gap-2" aria-label={t("window.label")} data-testid="wit-window-nav">
          <Link href={hrefs.prev as "/dashboard"} aria-label={t("window.prev")} className={chip}>
            ←
          </Link>
          <Link href={hrefs.today as "/dashboard"} className={chip}>
            {t("window.today")}
          </Link>
          <Link href={hrefs.next as "/dashboard"} aria-label={t("window.next")} className={chip}>
            →
          </Link>
        </nav>
      </div>
      <p className="text-support font-medium text-text-muted" data-testid="wit-window-range">
        {rangeFmt(timeline.from)} – {rangeFmt(timeline.to)}
      </p>

      {!hasAnything ? (
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary" data-testid="wit-projects-empty">
          {t("projects.none")}
        </p>
      ) : null}

      {/* ───────── DESKTOP: lanes ───────── */}
      {placed.length > 0 ? (
        <div className="hidden sm:block" data-testid="wit-projects-axis">
          <div className="grid grid-cols-[14rem_minmax(0,1fr)] border-t border-ink-600">
            <div />
            <div className="relative h-6" aria-hidden>
              {timeline.ticks.map((tick) => (
                <span key={tick.day} className="absolute top-1 text-meta tabular-nums text-text-muted" style={{ left: `${tick.leftPct}%` }}>
                  {tickFmt(tick.day) ?? tick.day}
                </span>
              ))}
            </div>
            {placed.map((p) => (
              <ProjectLane
                key={p.projectId}
                p={p}
                todayPct={timeline.todayPct}
                weekendBg={weekendBg}
                selected={p.projectId === focusProjectId}
                href={hrefs.project(p.projectId)}
                globalPeak={globalPeak}
                t={t}
                range={range}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ───────── MOBILE: project cards ───────── */}
      <ul className="flex flex-col gap-3 sm:hidden" data-testid="wit-projects-cards">
        {placed.map((p) => {
          const nowStage = p.stages.find((s) => s.startDate <= today && today <= s.endDate) ?? null;
          const nextStage = p.stages.find((s) => s.startDate > today) ?? null;
          return (
            <li key={p.projectId}>
              <Link
                href={hrefs.project(p.projectId) as "/dashboard"}
                aria-current={p.projectId === focusProjectId ? "true" : undefined}
                data-testid={`wit-project-card-${p.projectId}`}
                className={cn(
                  "flex min-h-[44px] flex-col gap-3 rounded-xl border bg-ink-800/30 p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                  p.projectId === focusProjectId ? "border-brand-blue/60" : "border-ink-600 hover:border-brand-blue/50",
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-semibold text-text-primary">{p.label ?? t("projects.untitled")}</span>
                  <EpistemicMark state={p.state} label={t(`state.${p.state}`)} />
                </span>
                <span className="text-support tabular-nums text-text-muted">{range(p.startDate, p.endDate)}</span>
                <span className="flex flex-col gap-1 text-support">
                  <span className="flex gap-2">
                    <span className="w-12 shrink-0 text-meta font-medium uppercase tracking-label text-text-muted">{t("people.now")}</span>
                    <span className={nowStage ? "text-text-primary" : "text-text-muted"}>{nowStage ? (nowStage.label ?? t("projects.stage")) : t("projects.noStageNow")}</span>
                  </span>
                  <span className="flex gap-2">
                    <span className="w-12 shrink-0 text-meta font-medium uppercase tracking-label text-text-muted">{t("people.next")}</span>
                    <span className={nextStage ? "text-text-primary" : "text-text-muted"}>
                      {nextStage ? `${nextStage.label ?? t("projects.stage")} · ${range(nextStage.startDate, nextStage.endDate)}` : t("projects.noStageNext")}
                    </span>
                  </span>
                </span>
                <NeedLine p={p} t={t} />
                <span className="relative block h-6 rounded-md" style={{ backgroundImage: weekendBg }} aria-hidden>
                  <StaffingColumns p={p} peak={globalPeak} />
                  {timeline.todayPct !== null ? <span className="absolute inset-y-0 w-px bg-brand-blue" style={{ left: `${timeline.todayPct}%` }} /> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {unplaced.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-ink-600/70 pt-4" data-testid="wit-unplaced">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <EpistemicMark state="notProvided" label={t("state.notProvided")} />
            {t("projects.unplacedTitle", { count: unplaced.length })}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {unplaced.map((p) => (
              <li key={p.projectId}>
                <Link
                  href={hrefs.project(p.projectId) as "/dashboard"}
                  data-testid={`wit-unplaced-${p.projectId}`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-dashed border-ink-500 px-4 text-sm text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  {p.label ?? t("projects.untitled")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ───────── OPEN NEEDS WITHOUT A PROJECT ───────── */}
      {model.needs.length > 0 || model.undatedNeeds > 0 ? (
        <div className="flex flex-col gap-3 border-t border-ink-600/70 pt-4" data-testid="wit-needs">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <EpistemicMark state="openNeed" label={t("state.openNeed")} />
            {t("projects.needsTitle")}
          </h3>
          <ul className="flex flex-col gap-2">
            {model.needs.map((n) => (
              <NeedRow key={n.id} n={n} t={t} range={range} />
            ))}
          </ul>
          {model.undatedNeeds > 0 ? (
            <p className="flex items-center gap-2 text-support text-text-secondary" data-testid="wit-needs-undated">
              <EpistemicMark state="notProvided" label={t("state.notProvided")} />
              {t("projects.needsUndated", { count: model.undatedNeeds })}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ───────── WHAT THE DATA LAYER DOES NOT HOLD ───────── */}
      <div className="flex flex-col gap-1 border-t border-ink-600/70 pt-3 text-support text-text-secondary" data-testid="wit-projects-gaps">
        <p className="flex items-start gap-2">
          <EpistemicMark state="notProvided" label={t("state.notProvided")} className="mt-0.5" />
          <span>{t("projects.gaps")}</span>
        </p>
      </div>
      <Legend t={t} />
    </section>
  );
}

function StaffingColumns({ p, peak }: { p: ProjectInTime; peak: number }) {
  const n = p.staffingByDay.length;
  if (n === 0) return null;
  return (
    <span className="absolute inset-0 flex items-end">
      {p.staffingByDay.map((c, i) => (
        <span key={i} className="flex h-full min-w-0 flex-1 items-end">
          {c > 0 ? (
            <span className="wit-grow-y w-full bg-brand-blue/70" style={{ height: `${Math.max(18, (c / peak) * 100)}%` }} />
          ) : null}
        </span>
      ))}
    </span>
  );
}

function NeedLine({ p, t }: { p: ProjectInTime; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const n = p.need;
  return (
    <span className="flex flex-wrap items-center gap-2 text-support text-text-secondary" data-testid={`wit-need-${p.projectId}`} data-need={n.kind}>
      {n.kind === "open" ? (
        <>
          <EpistemicMark state="openNeed" label={t("state.openNeed")} />
          {t("projects.needOpen", { missing: n.missing, required: n.required })}
        </>
      ) : n.kind === "covered" ? (
        <>
          <EpistemicMark state="known" label={t("state.known")} />
          {t("projects.needCovered", { required: n.required })}
        </>
      ) : (
        <>
          <EpistemicMark state="notProvided" label={t("state.notProvided")} />
          {t("projects.needNotProvided")}
        </>
      )}
      <span className="text-text-muted">{t("projects.staffed", { count: p.staffed.length })}</span>
    </span>
  );
}

function NeedRow({
  n,
  t,
  range,
}: {
  n: OpenNeedLane;
  t: Awaited<ReturnType<typeof getTranslations>>;
  range: (s: string | null, e: string | null) => string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{n.label ?? t("projects.untitled")}</span>
      <span className="shrink-0 tabular-nums text-support text-text-muted">{range(n.startDate, n.endDate)}</span>
      <span className="shrink-0 text-support font-medium text-state-warning">{t("projects.needOpen", { missing: n.missing, required: n.required })}</span>
    </>
  );
  const cls =
    "flex min-h-[44px] flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-dashed border-state-warning/50 px-3 py-2";
  return (
    <li data-testid={`wit-need-row-${n.id}`}>
      {n.href ? (
        <Link href={n.href as "/dashboard"} className={cn(cls, "transition-colors hover:border-state-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function ProjectLane({
  p,
  todayPct,
  weekendBg,
  selected,
  href,
  globalPeak,
  t,
  range,
}: {
  p: ProjectInTime;
  todayPct: number | null;
  weekendBg: string;
  selected: boolean;
  href: string;
  globalPeak: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
  range: (s: string | null, e: string | null) => string;
}) {
  return (
    <>
      <div className={cn("flex flex-col justify-center gap-1.5 border-t border-ink-600/80 py-3 pr-3", selected && "bg-brand-blue/5")}>
        <Link
          href={href as "/dashboard"}
          aria-current={selected ? "true" : undefined}
          data-testid={`wit-project-${p.projectId}`}
          className="flex min-h-[44px] items-center rounded-lg text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <span className="min-w-0 break-words">{p.label ?? t("projects.untitled")}</span>
        </Link>
        <span className="flex flex-wrap items-center gap-2">
          <EpistemicMark state={p.state} label={t(`state.${p.state}`)} />
          <span className="text-meta tabular-nums text-text-muted">{range(p.startDate, p.endDate)}</span>
        </span>
        <NeedLine p={p} t={t} />
      </div>
      <div
        className={cn("relative flex flex-col gap-1.5 border-t border-ink-600/80 py-3", selected && "bg-brand-blue/5")}
        style={{ backgroundImage: weekendBg }}
        data-testid={`wit-project-lane-${p.projectId}`}
      >
        {todayPct !== null ? (
          <span aria-hidden data-testid="wit-now-line" className="wit-now pointer-events-none absolute inset-y-0 z-10 w-px bg-brand-blue shadow-[0_0_8px_rgb(var(--c-brand-blue)/0.7)]" style={{ left: `${todayPct}%` }} />
        ) : null}
        {/* 1. the project's own band — a hairline, because it is a span, not work */}
        <div className="relative h-2">
          {p.band ? (
            <span
              className={cn("wit-bar absolute top-0.5 h-1 rounded-full bg-brand-blue/50", p.state === "planned" && "opacity-70")}
              style={{ left: `${p.band.leftPct}%`, width: `${p.band.widthPct}%` }}
              data-testid={`wit-band-${p.projectId}`}
              data-state={p.state}
            />
          ) : null}
        </div>
        {/* 2. stages */}
        <div className="relative h-6" data-testid={`wit-stages-${p.projectId}`}>
          {p.stages.map((s) => (
            <span
              key={s.id}
              title={`${s.label ?? t("projects.stage")} · ${range(s.startDate, s.endDate)} · ${t(`state.${s.state}`)}`}
              data-state={s.state}
              data-testid={`wit-stage-${s.id}`}
              className={cn(
                "wit-bar absolute flex h-6 items-center overflow-hidden border px-1.5 text-meta text-text-primary",
                "border-brand-violet/60 bg-brand-violet/20",
                s.clippedStart ? "rounded-l-none border-l-0" : "rounded-l-md",
                s.clippedEnd ? "rounded-r-none border-r-0" : "rounded-r-md",
                s.state === "planned" && "border-dashed",
                s.state === "recorded" && "border-brand-cyan/60 bg-brand-cyan/15",
              )}
              style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%` }}
            >
              <span className="truncate">{s.label ?? t("projects.stage")}</span>
              <span className="sr-only">
                {" "}
                {range(s.startDate, s.endDate)} {t(`state.${s.state}`)}
              </span>
            </span>
          ))}
          {p.stages.length === 0 ? (
            <span className="absolute inset-y-0 left-0 flex items-center text-meta text-text-muted">{t("projects.noStages")}</span>
          ) : null}
        </div>
        {/* 3. staffing density (+ the open-need outline over the band) */}
        <div className="relative h-8" data-testid={`wit-staffing-${p.projectId}`}>
          <StaffingColumns p={p} peak={globalPeak} />
          {p.need.kind === "open" && p.band ? (
            <span
              className="absolute inset-y-0 rounded-md border border-dashed border-state-warning/70"
              style={{ left: `${p.band.leftPct}%`, width: `${p.band.widthPct}%` }}
              data-testid={`wit-open-need-${p.projectId}`}
              aria-hidden
            />
          ) : null}
          {p.peakStaffing === 0 ? (
            <span className="absolute inset-0 flex items-center px-1 text-meta text-text-muted">
              {t("projects.noStaffingRecord")}
            </span>
          ) : null}
          <span className="sr-only">
            {t("projects.staffed", { count: p.staffed.length })}
          </span>
        </div>
      </div>
    </>
  );
}
