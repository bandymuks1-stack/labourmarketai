"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { HistoricalAttention } from "@/components/app/historical/historical-attention";
import {
  HistoricalCalendar,
  HistoricalDayReality,
} from "@/components/app/historical/historical-calendar";
import {
  HistoricalObjectFocus,
  HistoricalObjects,
} from "@/components/app/historical/historical-objects";
import { HistoricalOverview } from "@/components/app/historical/historical-overview";
import { HistoricalFieldBoard } from "@/components/app/historical-field-board";
import {
  HistoricalPlayerCard,
  HistoricalPlayerCompact,
} from "@/components/app/historical-player-card";
import {
  SemanticIcon,
  type SemanticConcept,
} from "@/components/app/semantic-icon";
import type { Option } from "@/components/app/evidence-import-forms";
import { MobileSheet } from "@/components/ui/MobileSheet";
import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";
import type { ImportProjection } from "@/lib/organization-evidence/import-projections";
import {
  defaultCalendarAnchor,
  personDaySeries,
  personRing,
  topState,
  type HistoricalCalendarScale,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE HISTORICAL WORKSPACE — one screen, one reality, six ways to look at it
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §G–§I, §AM, §BB–§BK;
 * owner master handoff 2026-09-17 §22: "always visible: 156 ready · 7 people
 * · 17 objects · 1 decision; the one blocking decision directly resolvable").
 *
 *   TOP STATE      the period as the headline; people · objects ·
 *                  person-days · aggregates apart · decisions — icon + value
 *                  + one word, each a door into its mode.
 *   MODES          Overview · People · Field · Objects · Calendar · Attention.
 *                  Selecting a mode REPLACES the central workspace (a short
 *                  cross-fade, none under reduced motion); nothing is
 *                  appended below. The selection (week, person, object, day)
 *                  is ONE state shared by every mode, so a person chosen on
 *                  the field is the person in focus on the calendar and the
 *                  day chosen on the calendar is the column lit on the field.
 *   DETAIL         the focused person / object / day, inline beside the
 *                  workspace on a wide screen, a bottom sheet on a phone.
 *   DECISION BAR   always in reach: ready rows, decisions waiting, what the
 *                  plan creates, REVIEW → attention, CONFIRM → the existing
 *                  commit control. CONFIRM is withheld while a decision
 *                  blocks. The raw source rows stay one action away (SOURCE).
 *
 * Every figure is the projection's figure; every control is an existing
 * staging-only action or a client-side selection. Nothing here fetches,
 * writes or invents. Client Component: it receives serialisable data, server
 * actions and React nodes — never a formatter function.
 */

type Mode =
  | "overview"
  | "people"
  | "field"
  | "objects"
  | "calendar"
  | "attention";
const MODES: readonly { id: Mode; icon: SemanticConcept }[] = [
  { id: "overview", icon: "company" },
  { id: "people", icon: "person" },
  { id: "field", icon: "team" },
  { id: "objects", icon: "object" },
  { id: "calendar", icon: "calendar" },
  { id: "attention", icon: "warning" },
];

type Action = (
  prev: EvidenceImportActionState,
  form: FormData,
) => Promise<EvidenceImportActionState>;

/** Below the `md` breakpoint the detail is a bottom sheet; above it, an
 *  inline column. The sheet locks body scroll while open, so it must only be
 *  OPEN on a narrow viewport — `md:hidden` alone would leave a wide screen
 *  unable to scroll. */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

/** Whether the workspace's section is on screen. The decision bar is FIXED
 *  to the viewport bottom (the shell's `overflow-x: hidden` on html/body
 *  defeats `position: sticky`, as the compare bar found before it) and it
 *  must not follow the reader onto unrelated pages of the same scroll — so it
 *  shows only while the import section intersects the viewport. */
function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current?.closest("#evidence-import") ?? ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: "0px 0px -80px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

export function HistoricalWorkspace({
  locale,
  sessionId,
  projection,
  workObjects,
  actions,
  errors,
  commit,
  readyCount,
  sourceRowsId,
}: {
  locale: string;
  sessionId: string;
  projection: ImportProjection;
  workObjects: readonly Option[];
  actions: { readonly resolveLabel: Action; readonly resolveTime: Action };
  errors: Record<string, string>;
  /** The existing plan block + commit control, rendered by the server section. */
  commit: ReactNode;
  readyCount: number;
  /** DOM id of the raw-rows disclosure the section renders below. */
  sourceRowsId: string;
}) {
  const t = useTranslations("evidenceImport.reconstruction");
  const tRecords = useTranslations("evidenceImport.records");
  // Dynamic keys (`issue.${kind}`): next-intl's typed `t` cannot see the union.
  const tx = t as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<Mode>("overview");
  const [week, setWeek] = useState<number | "all">("all");
  const [person, setPerson] = useState<string | null>(null);
  const [object, setObject] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [scale, setScale] = useState<HistoricalCalendarScale>("month");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"calendar" | "table">(
    "calendar",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const narrow = useNarrowViewport();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);

  const state = useMemo(() => topState(projection), [projection]);
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: locale === "lt" ? "long" : "short",
      timeZone: "UTC",
    });
    return {
      hours: (n: number) => num.format(n),
      day: (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)),
    };
  }, [locale]);
  const calendarAnchor =
    anchor ?? defaultCalendarAnchor(projection.calendar, scale) ?? "";
  const rings = useMemo(
    () =>
      new Map(
        projection.people.map(
          (p) => [p.label, personRing(projection.calendar, p.label)] as const,
        ),
      ),
    [projection],
  );

  const focusPerson = useCallback((label: string | null) => {
    setPerson(label);
    if (label) setObject(null);
  }, []);
  const focusObject = useCallback((name: string | null) => {
    setObject(name);
    if (name) setPerson(null);
  }, []);
  const goPerson = (label: string) => {
    focusPerson(person === label && mode === "people" ? null : label);
    setMode("people");
  };
  const goObject = (name: string) => {
    focusObject(object === name && mode === "objects" ? null : name);
    setMode("objects");
  };
  const goWeek = (w: number) => {
    setWeek(w);
    setMode("field");
  };
  const openSource = () => {
    const el = document.getElementById(sourceRowsId);
    if (el) {
      el.setAttribute("open", "");
      el.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  const personProjection = person
    ? (projection.people.find((p) => p.label === person) ?? null)
    : null;
  const objectProjection = object
    ? (projection.places.find((p) => p.name === object) ?? null)
    : null;
  const personDays = useMemo(
    () => (person ? personDaySeries(projection.calendar, person) : []),
    [projection, person],
  );

  // ── labels, once ──────────────────────────────────────────────────────────
  const interpretationNames = useMemo(
    () =>
      Object.fromEntries(
        [
          "typo_same_house_number",
          "street_without_number",
          "near_identical_name",
          "site_from_work_text",
          "hours_from_text",
          "canonical_spelling",
          "as_written",
        ].map((m) => [m, tx(`interpretation.${m}`)]),
      ),
    [tx],
  );
  const cardLabels = {
    historical: t("card.historical"),
    state: "",
    relationship: t("card.relationship"),
    provenance: t("card.provenance"),
    provenanceText: t("card.provenanceText"),
    hours: t("card.hours"),
    days: t("card.days"),
    places: t("card.places"),
    aggregate: (hours: string, rows: number) =>
      t("card.aggregate", { hours, rows }),
    aggregateRemote: t("card.aggregateRemote"),
    aggregatePeriodUnknown: t("card.aggregatePeriodUnknown"),
    currentNotInferred: t("card.currentNotInferred"),
    currentToken: t("card.currentToken"),
    openQuestions: (count: number) => t("card.openQuestions", { count }),
    weeks: t("card.weeks"),
    weekShort: t("weekShort"),
    details: t("card.details"),
    timeline: {
      title: t("card.timelineTitle"),
      current: t("card.timelineCurrent"),
      empty: t("card.timelineEmpty"),
      ariaLabel: t("card.timelineTitle"),
    },
    activities: t("card.activities"),
    evidence: t("card.evidence"),
    interpretations: t("card.interpretations"),
    interpretationNames,
    unknowns: t("card.unknowns"),
    unknownAllocation: (count: number) =>
      t("card.unknownAllocation", { count }),
    unknownPlace: (count: number) => t("card.unknownPlace", { count }),
    noActivities: t("card.noActivities"),
    unknown: t("card.unknowns"),
    person: t("icon.person"),
    time: t("icon.time"),
    evidenceIcon: t("icon.evidence"),
    warning: t("icon.warning"),
    moreLanes: (count: number) => t("card.moreLanes", { count }),
    profession: t("card.profession"),
    skills: t("card.skills"),
    availability: t("card.availability"),
    pay: t("card.pay"),
    contexts: t("card.contexts"),
    object: t("icon.object"),
    rhythm: t("card.rhythm"),
    ring: (weeks: number, total: number) => t("card.ring", { weeks, total }),
  };
  const fieldLabels = {
    title: t("field.title"),
    allWeeks: t("field.allWeeks"),
    week: t("weekShort"),
    noWork: t("field.noWork"),
    hoursUnknown: t("field.hoursUnknown"),
    days: t("field.days"),
    hours: t("card.hours"),
    clear: t("field.clear"),
    notATeam: t("field.notATeam"),
    notATeamWhy: t("field.notATeamWhy"),
    person: t("icon.person"),
    object: t("icon.object"),
    legend: t("field.legend"),
    weekConflict: t("field.weekConflict"),
    formation: t("field.formation"),
    unplaced: t("field.unplaced"),
    path: t("field.path"),
    people: t("figures.people"),
    dayLabel: t("calendar.day"),
  };
  const calendarLabels = {
    title: t("calendarTitle"),
    prev: t("calendar.prev"),
    next: t("calendar.next"),
    month: t("calendar.month"),
    week: t("calendar.week"),
    table: t("calendar.table"),
    calendar: t("calendar.scale"),
    people: t("figures.people"),
    hours: t("card.hours"),
    days: t("field.days"),
    weekShort: t("weekShort"),
    apart: t("aggregatesTitle"),
    periodUnknown: t("card.aggregatePeriodUnknown"),
    monthlyShare: tRecords("monthlyShare"),
    remote: t("timeRemote"),
    open: t("aggregateOpen"),
    weekConflict: t("field.weekConflict"),
    performed: t("calendar.performed"),
    noWork: t("field.noWork"),
    dayLabel: t("calendar.day"),
    sum: t("calendar.sum"),
    object: t("icon.object"),
    actual: t("calendar.actual"),
    hoursUnknown: t("field.hoursUnknown"),
    unplaced: t("field.unplaced"),
  };
  const objectLabels = {
    title: t("placesTitle", { count: state.objects }),
    days: t("field.days"),
    hours: t("card.hours"),
    people: t("figures.people"),
    hoursUnknown: t("field.hoursUnknown"),
    shared: (count: number) => t("placeShared", { count }),
    spellings: t("placeSpellings"),
    fromText: t("placeFromText"),
    source: t("source"),
    state: {
      new: t("placeState.new"),
      existing: t("placeState.existing"),
      ambiguous: t("placeState.ambiguous"),
    },
    weeks: t("card.weeks"),
    weekShort: t("weekShort"),
    object: t("icon.object"),
    time: t("icon.time"),
    clear: t("field.clear"),
    unknown: t("card.unknowns"),
    period: t("state.period"),
  };
  const attentionLabels = {
    decisions: t("attention.decisions"),
    observations: t("attention.observations"),
    none: t("noIssues"),
    issue: (kind: string, v: { count: number; label: string }) =>
      tx(`issue.${kind}`, v),
    why: (kind: string) => tx(`issueWhy.${kind}`),
    detected: t("attention.detected"),
    machineReading: {
      period_aggregate: t("attention.periodTotal"),
      unknown: t("machineReading.unknown"),
    },
    remote: t("timeRemote"),
    period: t("timePeriod"),
    unknown: t("card.unknowns"),
    source: t("source"),
    whyLabel: t("attention.why"),
    person: t("icon.person"),
    sum: t("calendar.sum"),
    time: {
      question: t("timeQuestion"),
      kindLabel: t("timeKind"),
      kinds: {
        period_aggregate: t("timeKinds.period_aggregate"),
        daily: t("timeKinds.daily"),
        unknown: t("timeKinds.unknown"),
      },
      remoteLabel: t("timeRemote"),
      remote: {
        yes: t("timeRemoteYes"),
        no: t("timeRemoteNo"),
        unknown: t("timeRemoteUnknown"),
      },
      periodLabel: t("timePeriod"),
      periodHint: t("timePeriodHint"),
      from: t("from"),
      to: t("to"),
      save: t("timeSave"),
      hint: t("timeHint"),
      errors,
    },
    label: {
      question: t("whichPlace"),
      useExisting: t("useExisting"),
      sameAs: t("sameAs"),
      createNew: t("createNew"),
      notAPlace: t("notAPlace"),
      save: t("save"),
      errors,
    },
  };
  const overviewLabels = {
    rhythm: t("spineTitle"),
    people: t("figures.people"),
    objects: t("figures.places"),
    footprint: t("overview.footprint"),
    unknownTitle: t("card.unknowns"),
    unknownItem: (k: string) => tx(`unknownItem.${k}`),
    weekShort: t("weekShort"),
    personDaysShort: t("personDaysShort"),
    days: t("field.days"),
    activities: t("activities"),
    object: t("icon.object"),
    card: cardLabels,
  };

  const period =
    state.firstDate && state.lastDate
      ? `${fmt.day(state.firstDate)} → ${fmt.day(state.lastDate)}`
      : t("periodUnknown");
  const blocking = state.decisions;

  // ── the detail beside the workspace ───────────────────────────────────────
  const dayNode = (iso: string) => (
    <HistoricalDayReality
      calendar={projection.calendar}
      iso={iso}
      locale={locale}
      labels={calendarLabels}
      personFilter={person}
      objectFilter={object}
      onSelectPerson={goPerson}
      onSelectObject={goObject}
    />
  );
  const detail: { key: string; title: string; node: ReactNode } | null =
    (mode === "calendar" || mode === "field") && day
      ? { key: `day:${day}`, title: fmt.day(day), node: dayNode(day) }
      : mode === "objects" && objectProjection
        ? {
            key: `object:${objectProjection.name}`,
            title: objectProjection.name,
            node: (
              <HistoricalObjectFocus
                place={objectProjection}
                field={projection.field}
                calendar={projection.calendar}
                locale={locale}
                labels={objectLabels}
                personFilter={person}
                onSelectPerson={goPerson}
                onSelectWeek={goWeek}
              />
            ),
          }
        : null;

  const modeLabel = (m: Mode) => t(`mode.${m}`);
  // Enter-only, in CSS: `.rise-in` is the product's token-driven entrance
  // (globals.css) and the ONE reduced-motion block disables it — the server
  // and the client render the same markup, so nothing can hydrate invisible.
  // A changed `key` remounts the node and replays the entrance.
  const RISE = "rise-in";

  return (
    // reducedMotion="user": under prefers-reduced-motion every transform and
    // layout animation completes instantly, whatever a child declares.
    <MotionConfig reducedMotion="user">
      <div
        ref={rootRef}
        className="flex flex-col gap-5"
        data-testid="evidence-reconstruction"
        data-mode={mode}
        data-decisions={blocking}
      >
        {/* ── TOP STATE — the period as the headline, the counts as doors ── */}
        <div
          className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3"
          data-testid="evidence-understood"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("state.period")}
            </span>
            <span className="inline-flex items-center gap-2 font-display text-title font-semibold tracking-tightest text-text-primary">
              <SemanticIcon
                concept="historical"
                label={t("card.historical")}
                className="h-5 w-5 text-brand-orange"
              />
              {period}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:items-end">
            <Stat
              icon="person"
              value={String(state.people)}
              label={t("state.people")}
              onClick={() => setMode("people")}
            />
            <Stat
              icon="object"
              value={String(state.objects)}
              label={t("state.objects")}
              onClick={() => setMode("objects")}
            />
            <Stat
              icon="calendar"
              value={String(state.personDays)}
              label={t("state.personDays")}
              onClick={() => setMode("calendar")}
              title={`${fmt.hours(state.dailyHours)} h`}
            />
            {state.aggregateRows > 0 && (
              <Stat
                icon="time"
                value={`Σ ${fmt.hours(state.aggregateHours)} h`}
                label={t("state.aggregate")}
                tone="amber"
                title={t("aggregateLine", {
                  hours: fmt.hours(state.aggregateHours),
                  rows: state.aggregateRows,
                })}
                onClick={() => setMode("attention")}
                testid="evidence-aggregate-hours"
              />
            )}
            <Stat
              icon="warning"
              value={String(blocking)}
              label={
                blocking === 1 ? t("state.decision") : t("state.decisions")
              }
              tone={blocking > 0 ? "orange" : "muted"}
              onClick={() => setMode("attention")}
              testid="evidence-decisions"
            />
          </div>
        </div>

        {/* ── MODES ──────────────────────────────────────────────────────── */}
        <div
          role="tablist"
          aria-label={t("modesLabel")}
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink-600 px-1"
          data-testid="historical-modes"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const i = MODES.findIndex((m) => m.id === mode);
            const next =
              MODES[
                (i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) %
                  MODES.length
              ].id;
            setMode(next);
            (
              e.currentTarget.querySelector(
                `[data-mode="${next}"]`,
              ) as HTMLElement | null
            )?.focus();
          }}
        >
          {MODES.map((m) => {
            const active = mode === m.id;
            const badge =
              m.id === "attention" && blocking > 0 ? blocking : null;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                data-mode={m.id}
                data-testid={`historical-mode-${m.id}`}
                onClick={() => setMode(m.id)}
                className={cn(
                  "relative inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-support transition-colors duration-fast",
                  active
                    ? "text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <SemanticIcon
                  concept={m.icon}
                  label={modeLabel(m.id)}
                  className="h-4 w-4"
                />
                <span aria-hidden>{modeLabel(m.id)}</span>
                {badge !== null && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 font-mono text-meta font-bold leading-none text-ink-900">
                    {badge}
                  </span>
                )}
                {active && (
                  <motion.span
                    layoutId="historical-mode-underline"
                    aria-hidden
                    className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-blue"
                    transition={{
                      type: "spring",
                      duration: reduce ? 0 : 0.32,
                      bounce: 0,
                    }}
                  />
                )}
              </button>
            );
          })}
          {/* SOURCE — not a mode: it opens the raw rows the section keeps below. */}
          <button
            type="button"
            onClick={openSource}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary"
            data-testid="evidence-source-link"
          >
            <SemanticIcon
              concept="source"
              label={t("source")}
              className="h-3.5 w-3.5"
            />
            {t("source")}
          </button>
        </div>

        {/* ── THE SELECTION — one state, visible in every mode ──────────── */}
        {(person || object || week !== "all" || day) && (
          <div
            key="selection"
            className={cn(RISE, "flex flex-wrap items-center gap-1.5")}
            data-testid="historical-selection"
          >
            {week !== "all" && (
              <button
                type="button"
                onClick={() => setWeek("all")}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 font-mono text-meta uppercase tracking-label text-text-primary ring-1 ring-brand-blue/50"
                data-testid="historical-selection-week"
              >
                <SemanticIcon
                  concept="time"
                  label={t("weekShort")}
                  className="h-3 w-3"
                />
                {t("weekShort")} {week}
                <span aria-hidden>×</span>
              </button>
            )}
            {day && (
              <button
                type="button"
                onClick={() => setDay(null)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 font-mono text-meta text-text-primary ring-1 ring-brand-blue/50"
                data-testid="historical-selection-day"
              >
                <SemanticIcon
                  concept="calendar"
                  label={t("calendar.day")}
                  className="h-3 w-3"
                />
                {fmt.day(day)}
                <span aria-hidden>×</span>
              </button>
            )}
            {person && (
              <button
                type="button"
                onClick={() => focusPerson(null)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 font-mono text-meta text-text-primary ring-1 ring-brand-blue/50"
                data-testid="historical-selection-person"
              >
                <SemanticIcon
                  concept="person"
                  label={t("icon.person")}
                  className="h-3 w-3"
                />
                {person}
                <span aria-hidden>×</span>
              </button>
            )}
            {object && (
              <button
                type="button"
                onClick={() => focusObject(null)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 font-mono text-meta text-text-primary ring-1 ring-brand-blue/50"
                data-testid="historical-selection-object"
              >
                <SemanticIcon
                  concept="object"
                  label={t("icon.object")}
                  className="h-3 w-3"
                />
                {object}
                <span aria-hidden>×</span>
              </button>
            )}
          </div>
        )}

        {/* ── THE WORKSPACE ──────────────────────────────────────────────── */}
        <div
          className={cn(
            "grid gap-5",
            detail ? "md:grid-cols-[minmax(0,1fr)_21rem]" : "",
          )}
          data-testid="historical-workspace"
        >
          <div className="min-w-0">
            <div key={mode} className={cn(RISE, "min-w-0")}>
              {mode === "overview" && (
                <HistoricalOverview
                  projection={projection}
                  locale={locale}
                  labels={overviewLabels}
                  selectedPerson={person}
                  selectedObject={object}
                  onSelectPerson={(l) => focusPerson(person === l ? null : l)}
                  onSelectObject={(n) => focusObject(object === n ? null : n)}
                  onSelectWeek={goWeek}
                />
              )}

              {mode === "people" && (
                <div
                  className="grid gap-5 md:grid-cols-[17rem_minmax(0,1fr)]"
                  data-testid="evidence-people"
                >
                  <ul className="flex flex-col md:max-h-[34rem] md:overflow-y-auto">
                    {projection.people.map((p) => (
                      <li
                        key={p.label}
                        data-testid="evidence-person-card"
                        data-state={p.state}
                      >
                        <HistoricalPlayerCompact
                          person={p}
                          ring={rings.get(p.label)}
                          labels={cardLabels}
                          formatHours={fmt.hours}
                          selected={person === p.label}
                          dimmed={person !== null}
                          onSelect={() =>
                            focusPerson(person === p.label ? null : p.label)
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="min-w-0">
                    {personProjection ? (
                      <div key={personProjection.label} className={RISE}>
                        <HistoricalPlayerCard
                          person={personProjection}
                          ring={rings.get(personProjection.label) ?? []}
                          days={personDays}
                          personId={`person-${encodeURIComponent(personProjection.label.toLowerCase())}`}
                          formatDate={fmt.day}
                          formatHours={fmt.hours}
                          labels={{
                            ...cardLabels,
                            state: tx(`personState.${personProjection.state}`),
                          }}
                          onSelectObject={goObject}
                        />
                      </div>
                    ) : (
                      <p
                        key="pick"
                        className={cn(
                          RISE,
                          "flex min-h-40 items-center justify-center text-center text-support text-text-muted",
                        )}
                      >
                        {t("people.pick")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {mode === "field" && (
                <HistoricalFieldBoard
                  calendar={projection.calendar}
                  field={projection.field}
                  locale={locale}
                  labels={fieldLabels}
                  selection={{ week, person, object, day }}
                  onSelectWeek={(w) => {
                    setWeek(w);
                    if (w === "all") setDay(null);
                  }}
                  onSelectPerson={focusPerson}
                  onSelectObject={focusObject}
                  onSelectDay={setDay}
                />
              )}

              {mode === "objects" && (
                <HistoricalObjects
                  places={projection.places}
                  field={projection.field}
                  locale={locale}
                  labels={objectLabels}
                  selected={object}
                  personFilter={person}
                  onSelect={focusObject}
                />
              )}

              {mode === "calendar" && (
                <HistoricalCalendar
                  calendar={projection.calendar}
                  locale={locale}
                  labels={calendarLabels}
                  scale={scale}
                  anchor={calendarAnchor}
                  selectedDay={day}
                  view={calendarView}
                  personFilter={person}
                  objectFilter={object}
                  onScale={(s) => {
                    setScale(s);
                    setAnchor(null);
                  }}
                  onAnchor={setAnchor}
                  onSelectDay={setDay}
                  onView={setCalendarView}
                />
              )}

              {mode === "attention" && (
                <HistoricalAttention
                  issues={projection.issues}
                  sessionId={sessionId}
                  locale={locale}
                  labels={attentionLabels}
                  workObjects={workObjects}
                  actions={actions}
                />
              )}
            </div>
          </div>

          {detail && (
            <>
              <aside
                className="hidden min-w-0 border-l border-ink-600 pl-5 md:block"
                data-testid="historical-detail"
                aria-label={detail.title}
              >
                <div key={detail.key} className={RISE}>
                  {detail.node}
                </div>
              </aside>
              <MobileSheet
                open={narrow}
                title={detail.title}
                closeLabel={t("close")}
                onClose={() =>
                  mode === "objects" ? focusObject(null) : setDay(null)
                }
              >
                {detail.node}
              </MobileSheet>
            </>
          )}
        </div>

        {/* ── DECISION BAR — fixed to the viewport while the section is on
             screen; an in-flow spacer keeps it off the last content. ──── */}
        <div
          aria-hidden
          className="h-16"
          data-testid="evidence-decision-bar-spacer"
        />
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-ink-600 bg-ink-900/95 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-base ease-out",
            inView ? "translate-y-0" : "translate-y-full",
          )}
          data-testid="evidence-decision-bar"
          data-blocking={blocking}
          data-ready={readyCount}
          data-in-view={inView ? "true" : "false"}
          title={t("nothingWrittenShort")}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-5 gap-y-2">
            <Stat
              icon="confirmed"
              value={String(readyCount)}
              label={t("bar.ready")}
              tone={readyCount > 0 ? "success" : "muted"}
              compact
            />
            <Stat
              icon="warning"
              value={String(blocking)}
              label={
                blocking === 1 ? t("state.decision") : t("state.decisions")
              }
              tone={blocking > 0 ? "orange" : "muted"}
              compact
              onClick={() => setMode("attention")}
            />
            <span className="hidden sm:contents">
              <Stat
                icon="person"
                value={`+${projection.commit.createPeople}`}
                label={t("bar.people")}
                compact
                title={t("impact.people", {
                  count: projection.commit.createPeople,
                  total: state.people,
                })}
              />
              <Stat
                icon="object"
                value={`+${projection.commit.createObjects}`}
                label={t("bar.objects")}
                compact
                title={t("impact.places", {
                  count: projection.commit.createObjects,
                  total: state.objects,
                })}
              />
            </span>
            <span className="sr-only" data-testid="evidence-impact">
              {t("nothingWrittenShort")} · {t("impactNote")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("attention")}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-500 px-3 text-support font-medium text-text-secondary transition-colors duration-fast hover:border-brand-blue hover:text-text-primary"
                data-testid="evidence-review"
              >
                {t("bar.review")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen((o) => !o)}
                disabled={blocking > 0}
                aria-expanded={confirmOpen}
                title={
                  blocking > 0
                    ? t("bar.blocked", { count: blocking })
                    : undefined
                }
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-blue px-4 text-support font-semibold text-ink-900 transition-transform duration-instant active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="evidence-confirm-open"
              >
                <SemanticIcon
                  concept="confirmed"
                  label={t("bar.confirm")}
                  className="h-4 w-4"
                />
                {t("bar.confirm")}
              </button>
            </div>
          </div>
          {blocking > 0 && (
            <button
              type="button"
              onClick={() => setMode("attention")}
              className="mx-auto flex w-full max-w-7xl items-center gap-1.5 text-left font-mono text-meta text-brand-orange"
              data-testid="evidence-confirm-blocked"
            >
              <SemanticIcon
                concept="warning"
                label={t("icon.warning")}
                className="h-3 w-3 shrink-0"
              />
              <span className="truncate">
                {t("bar.blocked", { count: blocking })}
              </span>
            </button>
          )}
          {confirmOpen && blocking === 0 && (
            <div
              className="mx-auto flex max-h-[60vh] w-full max-w-7xl flex-col gap-3 overflow-y-auto border-t border-ink-600 pt-3"
              data-testid="evidence-confirm-panel"
            >
              {commit}
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

function Stat({
  icon,
  value,
  label,
  tone = "default",
  onClick,
  title,
  testid,
  compact,
}: {
  icon: SemanticConcept;
  value: string;
  label: string;
  tone?: "default" | "amber" | "orange" | "muted" | "success";
  onClick?: () => void;
  title?: string;
  testid?: string;
  compact?: boolean;
}) {
  const color =
    tone === "amber"
      ? "text-state-amber"
      : tone === "orange"
        ? "text-brand-orange"
        : tone === "muted"
          ? "text-text-muted"
          : tone === "success"
            ? "text-state-success"
            : "text-text-primary";
  const body = (
    <>
      <span
        className={cn(
          "flex items-baseline gap-1.5 whitespace-nowrap font-display font-bold tabular-nums",
          compact ? "text-support" : "text-card-title",
          color,
        )}
      >
        <SemanticIcon
          concept={icon}
          label={label}
          className={cn(
            "self-center",
            compact ? "h-3.5 w-3.5" : "h-4 w-4",
            tone === "default" ? "text-text-muted" : color,
          )}
        />
        {value}
      </span>
      <span
        aria-hidden
        className="font-mono text-meta uppercase tracking-label text-text-muted"
      >
        {label}
      </span>
    </>
  );
  const cls = cn(
    "flex items-baseline gap-2 rounded-md text-left",
    onClick
      ? "min-h-11 px-1 transition-colors duration-fast hover:bg-ink-800/70"
      : "",
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cls}
      data-testid={testid}
    >
      {body}
    </button>
  ) : (
    <span title={title} className={cls} data-testid={testid}>
      {body}
    </span>
  );
}
