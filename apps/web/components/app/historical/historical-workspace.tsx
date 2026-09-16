"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { HistoricalAttention } from "@/components/app/historical/historical-attention";
import { HistoricalCalendar, HistoricalDayReality } from "@/components/app/historical/historical-calendar";
import { HistoricalObjectFocus, HistoricalObjects } from "@/components/app/historical/historical-objects";
import { HistoricalOverview } from "@/components/app/historical/historical-overview";
import { HistoricalFieldBoard } from "@/components/app/historical-field-board";
import { HistoricalPlayerCard, HistoricalPlayerCompact } from "@/components/app/historical-player-card";
import { SemanticIcon, type SemanticConcept } from "@/components/app/semantic-icon";
import type { Option } from "@/components/app/evidence-import-forms";
import { MobileSheet } from "@/components/ui/MobileSheet";
import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";
import type { ImportProjection } from "@/lib/organization-evidence/import-projections";
import { defaultCalendarAnchor, topState, type HistoricalCalendarScale } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE HISTORICAL WORKSPACE — one screen, one reality, six ways to look at it
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §G–§I, §AM, §BB–§BK).
 *
 *   TOP STATE      period · people · objects · person-days · daily hours ·
 *                  aggregates apart · decisions — icon + value + one word.
 *   MODES          Overview · People · Field · Objects · Calendar · Attention.
 *                  Selecting a mode REPLACES the central workspace; nothing
 *                  is appended below. The selection (week, person, object,
 *                  day) is ONE state shared by every mode, so a person chosen
 *                  on the field is the person in focus on the calendar.
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

type Mode = "overview" | "people" | "field" | "objects" | "calendar" | "attention";
const MODES: readonly { id: Mode; icon: SemanticConcept }[] = [
  { id: "overview", icon: "company" },
  { id: "people", icon: "person" },
  { id: "field", icon: "team" },
  { id: "objects", icon: "object" },
  { id: "calendar", icon: "calendar" },
  { id: "attention", icon: "warning" },
];

type Action = (prev: EvidenceImportActionState, form: FormData) => Promise<EvidenceImportActionState>;

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
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "0px 0px -80px 0px" });
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
  // Dynamic keys (`issue.${kind}`): next-intl's typed `t` cannot see the union.
  const tx = t as unknown as (key: string, values?: Record<string, string | number>) => string;

  const [mode, setMode] = useState<Mode>("overview");
  const [week, setWeek] = useState<number | "all">("all");
  const [person, setPerson] = useState<string | null>(null);
  const [object, setObject] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [scale, setScale] = useState<HistoricalCalendarScale>("month");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"calendar" | "table">("calendar");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const narrow = useNarrowViewport();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);

  const state = useMemo(() => topState(projection), [projection]);
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    return { hours: (n: number) => num.format(n), day: (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)) };
  }, [locale]);
  const calendarAnchor = anchor ?? defaultCalendarAnchor(projection.calendar, scale) ?? "";

  const focusPerson = useCallback((label: string | null) => {
    setPerson(label);
    if (label) setObject(null);
  }, []);
  const focusObject = useCallback((name: string | null) => {
    setObject(name);
    if (name) setPerson(null);
  }, []);
  const goPerson = (label: string) => { focusPerson(person === label && mode === "people" ? null : label); setMode("people"); };
  const goObject = (name: string) => { focusObject(object === name && mode === "objects" ? null : name); setMode("objects"); };
  const goWeek = (w: number) => { setWeek(w); setMode("field"); };
  const openSource = () => {
    const el = document.getElementById(sourceRowsId);
    if (el) {
      el.setAttribute("open", "");
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const personProjection = person ? projection.people.find((p) => p.label === person) ?? null : null;
  const objectProjection = object ? projection.places.find((p) => p.name === object) ?? null : null;

  // ── labels, once ──────────────────────────────────────────────────────────
  const interpretationNames = useMemo(
    () => Object.fromEntries(["typo_same_house_number", "street_without_number", "near_identical_name", "site_from_work_text", "hours_from_text", "canonical_spelling", "as_written"].map((m) => [m, tx(`interpretation.${m}`)])),
    [tx],
  );
  const cardLabels = {
    historical: t("card.historical"), state: "", relationship: t("card.relationship"), provenance: t("card.provenance"), provenanceText: t("card.provenanceText"),
    hours: t("card.hours"), days: t("card.days"), places: t("card.places"), aggregate: t("card.aggregate"), aggregateRemote: t("card.aggregateRemote"),
    aggregatePeriodUnknown: t("card.aggregatePeriodUnknown"), currentNotInferred: t("card.currentNotInferred"), currentToken: t("card.currentToken"), openQuestions: t("card.openQuestions"),
    weeks: t("card.weeks"), weekShort: t("weekShort"), details: t("card.details"),
    timeline: { title: t("card.timelineTitle"), current: t("card.timelineCurrent"), empty: t("card.timelineEmpty"), ariaLabel: t("card.timelineTitle") },
    activities: t("card.activities"), evidence: t("card.evidence"), interpretations: t("card.interpretations"), interpretationNames,
    unknowns: t("card.unknowns"), unknownAllocation: t("card.unknownAllocation"), unknownPlace: t("card.unknownPlace"), noActivities: t("card.noActivities"),
    unknown: t("card.unknowns"), person: t("icon.person"), time: t("icon.time"), evidenceIcon: t("icon.evidence"), warning: t("icon.warning"), moreLanes: t("card.moreLanes"),
  };
  const fieldLabels = {
    title: t("field.title"), allWeeks: t("field.allWeeks"), week: t("weekShort"), noWork: t("field.noWork"), hoursUnknown: t("field.hoursUnknown"),
    days: t("field.days"), hours: t("card.hours"), clear: t("field.clear"), notATeam: t("field.notATeam"), notATeamWhy: t("field.notATeamWhy"),
    person: t("icon.person"), object: t("icon.object"), legend: t("field.legend"), weekConflict: t("field.weekConflict"),
  };
  const calendarLabels = {
    title: t("calendarTitle"), prev: t("calendar.prev"), next: t("calendar.next"), month: t("calendar.month"), week: t("calendar.week"), table: t("calendar.table"),
    calendar: t("calendar.scale"), people: t("figures.people"), hours: t("card.hours"), days: t("field.days"), weekShort: t("weekShort"), apart: t("aggregatesTitle"),
    periodUnknown: t("card.aggregatePeriodUnknown"), remote: t("timeRemote"), open: t("aggregateOpen"), weekConflict: t("field.weekConflict"),
    performed: t("calendar.performed"), noWork: t("field.noWork"), dayLabel: t("calendar.day"), sum: t("calendar.sum"),
  };
  const objectLabels = {
    title: t("placesTitle", { count: state.objects }), days: t("field.days"), hours: t("card.hours"), people: t("figures.people"), hoursUnknown: t("field.hoursUnknown"),
    shared: t("placeShared"), spellings: t("placeSpellings"), fromText: t("placeFromText"), source: t("source"),
    state: { new: t("placeState.new"), existing: t("placeState.existing"), ambiguous: t("placeState.ambiguous") },
    weeks: t("card.weeks"), weekShort: t("weekShort"), object: t("icon.object"), time: t("icon.time"), clear: t("field.clear"), unknown: t("card.unknowns"),
  };
  const attentionLabels = {
    decisions: t("attention.decisions"), observations: t("attention.observations"), none: t("noIssues"),
    issue: (kind: string, v: { count: number; label: string }) => tx(`issue.${kind}`, v), why: (kind: string) => tx(`issueWhy.${kind}`),
    detected: t("attention.detected"), machineReading: { period_aggregate: t("attention.periodTotal"), unknown: t("machineReading.unknown") },
    remote: t("timeRemote"), period: t("timePeriod"), unknown: t("card.unknowns"), source: t("source"), whyLabel: t("attention.why"), person: t("icon.person"), sum: t("calendar.sum"),
    time: {
      question: t("timeQuestion"), kindLabel: t("timeKind"),
      kinds: { period_aggregate: t("timeKinds.period_aggregate"), daily: t("timeKinds.daily"), unknown: t("timeKinds.unknown") },
      remoteLabel: t("timeRemote"), remote: { yes: t("timeRemoteYes"), no: t("timeRemoteNo"), unknown: t("timeRemoteUnknown") },
      periodLabel: t("timePeriod"), periodHint: t("timePeriodHint"), from: t("from"), to: t("to"), save: t("timeSave"), hint: t("timeHint"), errors,
    },
    label: { question: t("whichPlace"), useExisting: t("useExisting"), sameAs: t("sameAs"), createNew: t("createNew"), notAPlace: t("notAPlace"), save: t("save"), errors },
  };
  const overviewLabels = {
    rhythm: t("spineTitle"), people: t("figures.people"), objects: t("figures.places"), footprint: t("overview.footprint"), unknownTitle: t("card.unknowns"),
    unknownItem: (k: string) => tx(`unknownItem.${k}`), weekShort: t("weekShort"), personDaysShort: t("personDaysShort"), days: t("field.days"), activities: t("activities"),
    card: cardLabels,
  };

  const period = state.firstDate && state.lastDate ? `${fmt.day(state.firstDate)} → ${fmt.day(state.lastDate)}` : t("periodUnknown");
  const blocking = state.decisions;

  // ── the detail beside the workspace ───────────────────────────────────────
  const detail: { title: string; node: ReactNode } | null =
    mode === "calendar" && day
      ? { title: fmt.day(day), node: <HistoricalDayReality calendar={projection.calendar} iso={day} locale={locale} labels={calendarLabels} onSelectPerson={goPerson} onSelectObject={goObject} /> }
      : mode === "objects" && objectProjection
        ? { title: objectProjection.name, node: <HistoricalObjectFocus place={objectProjection} field={projection.field} calendar={projection.calendar} locale={locale} labels={objectLabels} personFilter={person} onSelectPerson={goPerson} onSelectWeek={goWeek} /> }
        : null;

  const modeLabel = (m: Mode) => t(`mode.${m}`);

  return (
    <div ref={rootRef} className="flex flex-col gap-4" data-testid="evidence-reconstruction" data-mode={mode} data-decisions={blocking}>
      {/* ── TOP STATE ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2" data-testid="evidence-understood">
        <Stat icon="time" value={period} label={t("state.period")} compact />
        <span aria-hidden className="hidden h-6 w-px bg-ink-600 sm:block" />
        <Stat icon="person" value={String(state.people)} label={t("state.people")} compact onClick={() => setMode("people")} />
        <Stat icon="object" value={String(state.objects)} label={t("state.objects")} compact onClick={() => setMode("objects")} />
        <Stat icon="calendar" value={String(state.personDays)} label={t("state.personDays")} compact onClick={() => setMode("calendar")} />
        <Stat icon="work" value={`${fmt.hours(state.dailyHours)} h`} label={t("state.dailyHours")} compact />
        {state.aggregateRows > 0 && (
          <Stat icon="time" value={`Σ ${fmt.hours(state.aggregateHours)} h`} label={t("state.aggregate")} tone="amber" compact title={t("aggregateLine", { hours: fmt.hours(state.aggregateHours), rows: state.aggregateRows })} onClick={() => setMode("attention")} testid="evidence-aggregate-hours" />
        )}
        <Stat icon="warning" value={String(blocking)} label={blocking === 1 ? t("state.decision") : t("state.decisions")} tone={blocking > 0 ? "orange" : "muted"} compact onClick={() => setMode("attention")} testid="evidence-decisions" />
      </div>

      {/* ── MODES ──────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label={t("modesLabel")} className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink-600 px-1" data-testid="historical-modes"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const i = MODES.findIndex((m) => m.id === mode);
          const next = MODES[(i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length].id;
          setMode(next);
          (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
        }}
      >
        {MODES.map((m) => {
          const active = mode === m.id;
          const badge = m.id === "attention" && blocking > 0 ? blocking : null;
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
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-support transition-colors",
                active ? "border-brand-blue text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              <SemanticIcon concept={m.icon} label={modeLabel(m.id)} className="h-4 w-4" />
              <span aria-hidden>{modeLabel(m.id)}</span>
              {badge !== null && <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 font-mono text-meta font-bold leading-none text-ink-900">{badge}</span>}
            </button>
          );
        })}
        {/* SOURCE — not a mode: it opens the raw rows the section keeps below. */}
        <button type="button" onClick={openSource} className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary" data-testid="evidence-source-link">
          <SemanticIcon concept="source" label={t("source")} className="h-3.5 w-3.5" />
          {t("source")} · {projection.company.rows}
        </button>
      </div>

      {/* ── THE SELECTION — one state, visible in every mode ──────────── */}
      {(person || object || week !== "all") && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="historical-selection">
          {week !== "all" && (
            <button type="button" onClick={() => setWeek("all")} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-brand-blue/50 bg-brand-blue/10 px-2 font-mono text-meta uppercase tracking-label text-text-primary" data-testid="historical-selection-week">
              <SemanticIcon concept="time" label={t("weekShort")} className="h-3 w-3" />
              {t("weekShort")} {week}
              <span aria-hidden>×</span>
            </button>
          )}
          {person && (
            <button type="button" onClick={() => focusPerson(null)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-brand-blue/50 bg-brand-blue/10 px-2 font-mono text-meta text-text-primary" data-testid="historical-selection-person">
              <SemanticIcon concept="person" label={t("icon.person")} className="h-3 w-3" />
              {person}
              <span aria-hidden>×</span>
            </button>
          )}
          {object && (
            <button type="button" onClick={() => focusObject(null)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-brand-blue/50 bg-brand-blue/10 px-2 font-mono text-meta text-text-primary" data-testid="historical-selection-object">
              <SemanticIcon concept="object" label={t("icon.object")} className="h-3 w-3" />
              {object}
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
      )}

      {/* ── THE WORKSPACE ──────────────────────────────────────────────── */}
      <div className={cn("grid gap-4", detail ? "md:grid-cols-[minmax(0,1fr)_20rem]" : "")} data-testid="historical-workspace">
        <div className="min-w-0">
          {mode === "overview" && (
            <HistoricalOverview projection={projection} locale={locale} labels={overviewLabels} selectedPerson={person} selectedObject={object} onSelectPerson={goPerson} onSelectObject={goObject} onSelectWeek={goWeek} />
          )}

          {mode === "people" && (
            <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]" data-testid="evidence-people">
              <ul className="flex flex-col md:max-h-[32rem] md:overflow-y-auto">
                {projection.people.map((p) => (
                  <li key={p.label} data-testid="evidence-person-card" data-state={p.state}>
                    <HistoricalPlayerCompact person={p} labels={cardLabels} formatHours={fmt.hours} selected={person === p.label} onSelect={() => focusPerson(person === p.label ? null : p.label)} />
                  </li>
                ))}
              </ul>
              <div className="min-w-0 rounded-card border border-ink-600 bg-ink-800/60 p-3 sm:p-4">
                {personProjection ? (
                  <HistoricalPlayerCard person={personProjection} personId={`person-${encodeURIComponent(personProjection.label.toLowerCase())}`} formatDate={fmt.day} formatHours={fmt.hours} labels={{ ...cardLabels, state: tx(`personState.${personProjection.state}`) }} />
                ) : (
                  <p className="flex min-h-40 items-center justify-center text-center text-support text-text-muted">{t("people.pick")}</p>
                )}
              </div>
            </div>
          )}

          {mode === "field" && (
            <HistoricalFieldBoard calendar={projection.calendar} field={projection.field} locale={locale} labels={fieldLabels} selection={{ week, person, object }} onSelectWeek={setWeek} onSelectPerson={focusPerson} onSelectObject={focusObject} />
          )}

          {mode === "objects" && (
            <HistoricalObjects places={projection.places} field={projection.field} locale={locale} labels={objectLabels} selected={object} personFilter={person} onSelect={focusObject} />
          )}

          {mode === "calendar" && (
            <HistoricalCalendar calendar={projection.calendar} locale={locale} labels={calendarLabels} scale={scale} anchor={calendarAnchor} selectedDay={day} view={calendarView} personFilter={person} objectFilter={object} onScale={(s) => { setScale(s); setAnchor(null); }} onAnchor={setAnchor} onSelectDay={setDay} onView={setCalendarView} />
          )}

          {mode === "attention" && (
            <HistoricalAttention issues={projection.issues} sessionId={sessionId} locale={locale} labels={attentionLabels} workObjects={workObjects} actions={actions} />
          )}
        </div>

        {detail && (
          <>
            <aside className="hidden min-w-0 rounded-card border border-ink-600 bg-ink-800/60 p-3 md:block" data-testid="historical-detail" aria-label={detail.title}>
              {detail.node}
            </aside>
            <MobileSheet open={narrow} title={detail.title} closeLabel={t("close")} onClose={() => (mode === "calendar" ? setDay(null) : focusObject(null))}>
              {detail.node}
            </MobileSheet>
          </>
        )}
      </div>

      {/* ── DECISION BAR — fixed to the viewport while the section is on
             screen; an in-flow spacer keeps it off the last content. ──── */}
      <div aria-hidden className="h-16" data-testid="evidence-decision-bar-spacer" />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-ink-600 bg-ink-900/95 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform",
          inView ? "translate-y-0" : "translate-y-full",
        )}
        data-testid="evidence-decision-bar"
        data-blocking={blocking}
        data-ready={readyCount}
        data-in-view={inView ? "true" : "false"}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
          <Stat icon="confirmed" value={String(readyCount)} label={t("bar.ready")} tone={readyCount > 0 ? "success" : "muted"} compact />
          <Stat icon="warning" value={String(blocking)} label={blocking === 1 ? t("state.decision") : t("state.decisions")} tone={blocking > 0 ? "orange" : "muted"} compact onClick={() => setMode("attention")} />
          <Stat icon="person" value={`+${projection.commit.createPeople}`} label={t("bar.people")} compact title={t("impact.people", { count: projection.commit.createPeople, total: state.people })} />
          <Stat icon="object" value={`+${projection.commit.createObjects}`} label={t("bar.objects")} compact title={t("impact.places", { count: projection.commit.createObjects, total: state.objects })} />
          <span className="font-mono text-meta text-text-muted" data-testid="evidence-impact" title={t("impactNote")}>{t("nothingWrittenShort")}</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setMode("attention")} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-500 px-3 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-text-primary" data-testid="evidence-review">
              {t("bar.review")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen((o) => !o)}
              disabled={blocking > 0}
              aria-expanded={confirmOpen}
              title={blocking > 0 ? t("bar.blocked", { count: blocking }) : undefined}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-blue px-4 text-support font-semibold text-ink-900 disabled:cursor-not-allowed"
              data-testid="evidence-confirm-open"
            >
              <SemanticIcon concept="confirmed" label={t("bar.confirm")} className="h-4 w-4" />
              {t("bar.confirm")}
            </button>
          </div>
        </div>
        {blocking > 0 && <p className="mx-auto w-full max-w-7xl font-mono text-meta text-brand-orange" data-testid="evidence-confirm-blocked">{t("bar.blocked", { count: blocking })}</p>}
        {confirmOpen && blocking === 0 && (
          <div className="mx-auto flex max-h-[60vh] w-full max-w-7xl flex-col gap-3 overflow-y-auto border-t border-ink-600 pt-3" data-testid="evidence-confirm-panel">
            {commit}
          </div>
        )}
      </div>
    </div>
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
  const color = tone === "amber" ? "text-state-amber" : tone === "orange" ? "text-brand-orange" : tone === "muted" ? "text-text-muted" : tone === "success" ? "text-state-success" : "text-text-primary";
  const body = (
    <>
      <span className={cn("flex items-baseline gap-1.5 font-display font-bold tabular-nums", compact ? "text-support" : "text-card-title", color)}>
        <SemanticIcon concept={icon} label={label} className={cn("self-center", compact ? "h-3.5 w-3.5" : "h-4 w-4", tone === "default" ? "text-text-muted" : color)} />
        {value}
      </span>
      <span aria-hidden className="font-mono text-meta uppercase tracking-label text-text-muted">{label}</span>
    </>
  );
  const cls = cn("flex items-baseline gap-2 rounded-md text-left", onClick ? "min-h-11 hover:bg-ink-800/60" : "");
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={cls} data-testid={testid}>{body}</button>
  ) : (
    <span title={title} className={cls} data-testid={testid}>{body}</span>
  );
}
