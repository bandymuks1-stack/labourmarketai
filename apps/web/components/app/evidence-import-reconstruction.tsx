import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { createUtcFormatter } from "@/lib/time/display";
import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";
import type { ImportProjection, IssueProjection } from "@/lib/organization-evidence/import-projections";
import {
  EvidenceLabelResolveForm,
  EvidenceTimeSemanticsForm,
  type Option,
} from "@/components/app/evidence-import-forms";
import { HistoricalPlayerCard } from "@/components/app/historical-player-card";
import { HistoricalFieldBoard } from "@/components/app/historical-field-board";

/**
 * THE RECONSTRUCTION — "this is how your company actually worked", read
 * from the staged source before anything is written (owner commands
 * 2026-09-16 §39–§40, §57 and the post-#1748 correction §2, §5–§9, §14–§15).
 *
 *   UNDERSTOOD     one sentence in real figures, and the time spine — the
 *                  weeks of the period with the daily work stacked on them;
 *   TO CHECK       only the genuine questions, blocking ones first, each
 *                  with the one decision that settles it, asked once;
 *   PEOPLE         the `history-card` variant of the ONE player identity —
 *                  evidence-backed, provenance-edged, no score;
 *   THE FIELD      who is evidenced working where, by week — the PAST state
 *                  of the team/field board, read-only, never a team;
 *   PLACES         the real objects, spellings shown, shared days apart;
 *   CALENDAR       actual work by person and week; period aggregates
 *                  listed apart, never as a day;
 *   THE COMPANY    what this data lets the system say, and what it does NOT;
 *   AFTER CONFIRM  exactly what would exist — records, people, places,
 *                  cards, field, calendar, provenance.
 *
 * Every figure is a projection of staged rows. Nothing here is a record,
 * nothing here writes, and the section says so above and below.
 */

type Action = (prev: EvidenceImportActionState, form: FormData) => Promise<EvidenceImportActionState>;

const HEADING = "font-display text-lg font-semibold tracking-tightest text-text-primary";
const EYEBROW = "font-mono text-meta uppercase tracking-label text-brand-orange";
const STATE_CHIP: Record<string, string> = {
  new: "border-brand-cyan/40 text-brand-cyan",
  existing: "border-state-success/40 text-state-success",
  ambiguous: "border-state-amber/40 text-state-amber",
  unresolved: "border-ink-500 text-text-muted",
};

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>{children}</span>;
}

export async function EvidenceImportReconstruction({
  locale,
  sessionId,
  projection,
  workObjects,
  actions,
  errors,
}: {
  locale: string;
  sessionId: string;
  projection: ImportProjection;
  /** The organization's existing objects, for a label-level choice. */
  workObjects: readonly Option[];
  actions: { readonly resolveLabel: Action; readonly resolveTime: Action };
  errors: Record<string, string>;
}) {
  const t = await getTranslations("evidenceImport.reconstruction");
  // Dynamic keys (`issue.${kind}`) with values: next-intl's typed `t` cannot
  // see the union, so the call is widened once here and nowhere else.
  const tx = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  // Lithuanian has no textual short month ("10-22"); the long month reads as
  // a date in every active locale ("spalio 22 d.", "22 okt").
  const fmtDay = createUtcFormatter(locale, { day: "numeric", month: locale === "lt" ? "long" : "short" });
  const fmtLong = createUtcFormatter(locale, { day: "numeric", month: "long", year: "numeric" });
  const fmtDate = (iso: string) => fmtDay(iso) ?? iso;
  const hours = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const { people, places, calendar, field, issues, company, commit } = projection;
  const period =
    company.firstDate && company.lastDate
      ? `${fmtLong(company.firstDate) ?? company.firstDate} – ${fmtLong(company.lastDate) ?? company.lastDate}`
      : t("periodUnknown");
  const blocking = issues.filter((i) => i.blocking);
  const informational = issues.filter((i) => !i.blocking);
  const maxWeek = Math.max(1, ...calendar.weeks.map((w) => w.hours));
  const interpretationNames: Record<string, string> = Object.fromEntries(
    ["typo_same_house_number", "street_without_number", "near_identical_name", "site_from_work_text", "hours_from_text", "canonical_spelling", "as_written"].map(
      (m) => [m, tx(`interpretation.${m}`)],
    ),
  );

  const issueLine = (i: IssueProjection) => (
    <li
      key={`${i.kind}:${i.key ?? ""}`}
      className={`flex flex-col gap-2 rounded-md border px-3 py-2 ${i.blocking ? "border-state-amber/40 bg-state-amber/5" : "border-ink-500 bg-ink-900"}`}
      data-testid="evidence-issue"
      data-kind={i.kind}
      data-blocking={i.blocking ? "true" : "false"}
      data-count={i.count}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold text-text-primary">{tx(`issue.${i.kind}`, { count: i.count, label: i.label ?? "" })}</span>
        {i.sample && i.kind !== "ambiguous_place" && i.kind !== "place_from_text" && i.kind !== "time_semantics" && (
          <span className="text-xs text-text-muted">{i.sample}</span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">{tx(`issueWhy.${i.kind}`)}</p>
      {i.kind === "time_semantics" && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5" data-testid="evidence-time-rows">
            {i.timeRows.map((r) => (
              <li key={r.rowId} className="rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-xs" data-testid="evidence-time-row">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-text-primary">{r.label}</span>
                  <span className="text-text-secondary">{r.recordedOn ? fmtDate(r.recordedOn) : "—"}</span>
                  <span className="font-display text-base font-bold tabular-nums text-state-amber">{hours(r.sourceHours)} h</span>
                  <span className="text-text-muted">
                    {tx(`machineReading.${r.machineReading}`)}
                    {r.periodWords ? ` (“${r.periodWords}”)` : ""}
                    {r.remote === true ? ` · ${t("remoteEvidenced")}` : ""}
                  </span>
                </div>
                {r.context && <div className="text-text-secondary">{r.context}</div>}
                {r.text && <div className="italic leading-relaxed text-text-muted">“{r.text.length > 160 ? `${r.text.slice(0, 157)}…` : r.text}”</div>}
              </li>
            ))}
          </ul>
          <EvidenceTimeSemanticsForm
            action={actions.resolveTime}
            sessionId={sessionId}
            rowIds={i.rowIds}
            suggestedKind={i.timeRows.every((r) => r.machineReading === "period_aggregate") ? "period_aggregate" : "unknown"}
            suggestedRemote={i.timeRows.some((r) => r.remote === true) ? true : null}
            labels={{
              question: t("timeQuestion"),
              kindLabel: t("timeKind"),
              kinds: { period_aggregate: t("timeKinds.period_aggregate"), daily: t("timeKinds.daily"), unknown: t("timeKinds.unknown") },
              remoteLabel: t("timeRemote"),
              remote: { yes: t("timeRemoteYes"), no: t("timeRemoteNo"), unknown: t("timeRemoteUnknown") },
              periodLabel: t("timePeriod"),
              periodHint: t("timePeriodHint"),
              from: t("from"),
              to: t("to"),
              save: t("timeSave"),
              hint: t("timeHint"),
              errors,
            }}
          />
        </div>
      )}
      {(i.kind === "ambiguous_place" || i.kind === "place_from_text") && i.key && i.label && (
        <EvidenceLabelResolveForm
          action={actions.resolveLabel}
          sessionId={sessionId}
          labelKey={i.key}
          sourceLabel={i.label}
          defaultChoice={i.kind === "place_from_text" ? "create" : undefined}
          candidates={[
            ...(i.candidates.length > 0
              ? i.candidates.map((c) => ({ value: c.id, label: c.name }))
              : i.kind === "ambiguous_place"
                ? workObjects
                : []),
            ...i.siblings.map((n) => ({ value: `alias:${n}`, label: n })),
          ]}
          labels={{
            question: t("whichPlace"),
            useExisting: t("useExisting"),
            sameAs: t("sameAs"),
            createNew: t("createNew"),
            notAPlace: t("notAPlace"),
            save: t("save"),
            errors,
          }}
        />
      )}
    </li>
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
    aggregate: t("card.aggregate"),
    aggregateRemote: t("card.aggregateRemote"),
    aggregatePeriodUnknown: t("card.aggregatePeriodUnknown"),
    currentNotInferred: t("card.currentNotInferred"),
    openQuestions: t("card.openQuestions"),
    weeks: t("card.weeks"),
    weekShort: t("weekShort"),
    details: t("card.details"),
    timeline: { title: t("card.timelineTitle"), current: t("card.timelineCurrent"), empty: t("card.timelineEmpty"), ariaLabel: t("card.timelineTitle") },
    activities: t("card.activities"),
    evidence: t("card.evidence"),
    interpretations: t("card.interpretations"),
    interpretationNames,
    unknowns: t("card.unknowns"),
    unknownAllocation: t("card.unknownAllocation"),
    unknownPlace: t("card.unknownPlace"),
    noActivities: t("card.noActivities"),
  };

  return (
    <div className="flex flex-col gap-4" data-testid="evidence-reconstruction">
      {/* ── UNDERSTOOD: the sentence and the time spine ─────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-4" data-testid="evidence-understood">
          <div className="flex flex-col gap-1">
            <p className={EYEBROW}>{t("understoodEyebrow")}</p>
            <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">{t("understoodTitle")}</h2>
            <p className="text-sm leading-relaxed text-text-secondary" data-testid="evidence-understood-sentence">
              {t("understoodSentence", {
                period,
                people: company.people,
                places: company.places,
                personDays: company.personDays,
                hours: hours(company.statedHours),
              })}
            </p>
          </div>

          {/* the time spine: weeks × daily hours, people stacked */}
          {calendar.weeks.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="evidence-time-spine">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("spineTitle")}</span>
              <ol className="flex h-24 items-end gap-1.5">
                {calendar.weeks.map((w) => {
                  const byPerson = new Map<string, number>();
                  for (const d of w.days) for (const p of d.people) byPerson.set(p.label, (byPerson.get(p.label) ?? 0) + (p.hours ?? 0));
                  const stack = [...byPerson.entries()].sort((a, b) => a[0].localeCompare(b[0]));
                  return (
                    <li
                      key={w.isoWeek}
                      className="flex flex-1 flex-col items-stretch justify-end gap-0.5"
                      title={`${t("weekShort")} ${w.isoWeek} · ${fmtDate(w.days[0].date)} – ${fmtDate(w.days[w.days.length - 1].date)} · ${hours(w.hours)} h · ${w.personDays} ${t("personDaysShort")}`}
                      data-testid="evidence-spine-week"
                      data-iso-week={w.isoWeek}
                    >
                      <span className="text-center font-mono text-meta tabular-nums text-text-secondary">{hours(w.hours)}</span>
                      <div className="flex w-full flex-col-reverse gap-px" style={{ height: `${Math.max(4, Math.round((w.hours / maxWeek) * 64))}px` }}>
                        {stack.map(([label, h], idx) => (
                          <span
                            key={label}
                            title={`${label}: ${hours(h)} h`}
                            className={idx % 2 === 0 ? "w-full flex-none bg-brand-cyan/80" : "w-full flex-none bg-brand-cyan/50"}
                            style={{ height: `${w.hours > 0 ? Math.max(1, (h / w.hours) * 100) : 0}%` }}
                          />
                        ))}
                      </div>
                      <span className="text-center font-mono text-meta tabular-nums text-text-muted">{w.isoWeek}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {company.aggregateRows > 0 && (
            <p className="text-xs text-state-amber" data-testid="evidence-aggregate-hours">
              {t("aggregateLine", { hours: hours(company.aggregateHours), rows: company.aggregateRows })}
              {company.remoteRows > 0 ? ` · ${t("aggregateRemote", { rows: company.remoteRows })}` : ""}
            </p>
          )}
          <p className="text-xs text-text-muted">{t("nothingWritten")}</p>
        </section>
      </Card>

      {/* ── TO CHECK ───────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-issues" data-blocking={blocking.length}>
          <h2 className={HEADING}>{blocking.length > 0 ? t("issuesTitleBlocking", { count: blocking.length }) : t("issuesTitleClear")}</h2>
          {blocking.length === 0 && informational.length === 0 && <p className="text-sm text-text-muted">{t("noIssues")}</p>}
          {blocking.length > 0 && <ul className="flex flex-col gap-2">{blocking.map(issueLine)}</ul>}
          {informational.length > 0 && (
            <details className="rounded-md border border-ink-600" data-testid="evidence-issues-informational">
              <summary className="cursor-pointer px-3 py-2 text-sm text-text-secondary">{t("informational", { count: informational.length })}</summary>
              <ul className="flex flex-col gap-2 px-3 pb-3">{informational.map(issueLine)}</ul>
            </details>
          )}
        </section>
      </Card>

      {/* ── PEOPLE: the player cards ───────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-people">
          <div className="flex flex-col gap-1">
            <h2 className={HEADING}>{t("peopleTitle", { count: people.length })}</h2>
            <p className="text-xs text-text-secondary">{t("peopleSubtitle")}</p>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {people.map((p) => (
              <li key={p.label} data-testid="evidence-person-card" data-state={p.state}>
                <HistoricalPlayerCard
                  person={p}
                  personId={`person-${encodeURIComponent(p.label.toLowerCase())}`}
                  formatDate={fmtDate}
                  formatHours={hours}
                  labels={{ ...cardLabels, state: tx(`personState.${p.state}`) }}
                />
              </li>
            ))}
          </ul>
        </section>
      </Card>

      {/* ── THE FIELD ──────────────────────────────────────────────────── */}
      <Card compact>
        <HistoricalFieldBoard
          field={field}
          locale={locale}
          labels={{
            title: t("field.title"),
            subtitle: t("field.subtitle"),
            allWeeks: t("field.allWeeks"),
            week: t("weekShort"),
            peopleEvidenced: t("field.peopleEvidenced"),
            noWork: t("field.noWork"),
            hoursUnknown: t("field.hoursUnknown"),
            hoursUnknownNote: t("field.hoursUnknownNote"),
            days: t("field.days"),
            clear: t("field.clear"),
            selectedPerson: t("field.selectedPerson"),
            selectedPlace: t("field.selectedPlace"),
            notATeam: t("field.notATeam"),
          }}
        />
      </Card>

      {/* ── PLACES ─────────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-places">
          <h2 className={HEADING}>{t("placesTitle", { count: places.length })}</h2>
          <ul className="flex flex-col divide-y divide-ink-600">
            {places.map((pl) => (
              <li key={`${pl.state}:${pl.name}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" data-testid="evidence-place-row" data-state={pl.state}>
                <span className="font-semibold text-text-primary">{pl.name}</span>
                <Chip tone={STATE_CHIP[pl.state]}>{tx(`placeState.${pl.state}`)}</Chip>
                <span className="text-xs tabular-nums text-text-secondary">{t("placeLine", { rows: pl.rows, people: pl.people, hours: hours(pl.statedHours) })}</span>
                {pl.sharedRows > 0 && <span className="text-xs text-text-muted">{t("placeShared", { count: pl.sharedRows })}</span>}
                {pl.origin === "text" && <span className="text-xs text-text-muted">{t("placeFromText")}</span>}
                {pl.spellings.length > 0 && (
                  <span className="text-xs text-text-muted" data-testid="evidence-place-spellings">{t("placeSpellings")}: {pl.spellings.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </Card>

      {/* ── CALENDAR ───────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-calendar">
          <h2 className={HEADING}>{t("calendarTitle")}</h2>
          <p className="text-xs text-text-secondary">{t("calendarLine", { weeks: calendar.weeks.length, personDays: calendar.personDays })}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-ink-500 text-left">
                  <th className="px-2 py-1 font-mono text-meta uppercase tracking-label text-text-muted">{t("week")}</th>
                  {calendar.people.map((p) => (
                    <th key={p} className="px-2 py-1 font-mono text-meta uppercase tracking-label text-text-muted">{p}</th>
                  ))}
                  <th className="px-2 py-1 text-right font-mono text-meta uppercase tracking-label text-text-muted">Σ</th>
                </tr>
              </thead>
              <tbody>
                {calendar.weeks.map((w) => {
                  const byPerson = new Map<string, { hours: number; days: number; conflict: boolean }>();
                  for (const d of w.days) {
                    for (const p of d.people) {
                      const cur = byPerson.get(p.label) ?? { hours: 0, days: 0, conflict: false };
                      byPerson.set(p.label, { hours: cur.hours + (p.hours ?? 0), days: cur.days + 1, conflict: cur.conflict || p.weekConflict });
                    }
                  }
                  return (
                    <tr key={w.isoWeek} className="border-b border-ink-500/50" data-testid="evidence-calendar-week" data-week={w.isoWeek}>
                      <td className="px-2 py-1 text-text-secondary">
                        {t("weekN", { n: w.isoWeek })}
                        <span className="ml-1 text-text-muted">{fmtDate(w.days[0].date)}</span>
                      </td>
                      {calendar.people.map((p) => {
                        const c = byPerson.get(p);
                        return (
                          <td key={p} className={`px-2 py-1 tabular-nums ${c?.conflict ? "text-state-amber" : "text-text-primary"}`}>
                            {c ? `${hours(c.hours)} h · ${c.days}d${c.conflict ? " ⚠" : ""}` : <span className="text-text-muted">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-right tabular-nums text-text-primary">{hours(w.hours)} h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {calendar.aggregates.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="evidence-calendar-aggregates">
              <h3 className="font-mono text-meta uppercase tracking-label text-state-amber">{t("aggregatesTitle")}</h3>
              <ul className="flex flex-col gap-1 text-xs">
                {calendar.aggregates.map((a, i) => (
                  <li key={`${a.label}:${a.recordedOn}:${i}`} className="flex flex-wrap items-baseline gap-x-2 text-text-secondary" data-testid="evidence-calendar-aggregate" data-open={a.open ? "true" : "false"}>
                    <span className="font-semibold text-text-primary">{a.label}</span>
                    <span className="font-display text-sm font-bold tabular-nums text-state-amber">{hours(a.sourceHours)} h</span>
                    <span>
                      {a.periodStart
                        ? `${fmtDate(a.periodStart)} – ${fmtDate(a.periodEnd ?? a.periodStart)}`
                        : t("aggregatePeriodUnknownRecorded", { date: fmtDate(a.recordedOn) })}
                    </span>
                    {a.remote === true && <span className="text-text-muted">· {t("remoteEvidenced")}</span>}
                    {a.context && <span className="text-text-muted">· {a.context}</span>}
                    {a.open && <span className="text-state-amber">· {t("aggregateOpen")}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-text-muted">{t("calendarNote")}</p>
        </section>
      </Card>

      {/* ── THE COMPANY ────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-company">
          <h2 className={HEADING}>{t("companyTitle")}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-900 px-3 py-2">
              <dt className="font-mono text-meta uppercase tracking-label text-state-success">{t("known")}</dt>
              <dd className="text-text-secondary">
                {t("knownLine", { people: company.people, places: company.places, personDays: company.personDays, hours: hours(company.statedHours) })}
                {company.multiPlaceRows > 0 && <span className="block text-xs text-text-muted">{t("multiPlaceLine", { count: company.multiPlaceRows })}</span>}
                {company.aggregateRows > 0 && (
                  <span className="block text-xs text-state-amber">{t("aggregateLine", { hours: hours(company.aggregateHours), rows: company.aggregateRows })}</span>
                )}
                {company.activities.length > 0 && <span className="block text-xs text-text-muted">{t("activities")}: {company.activities.join(", ")}</span>}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-900 px-3 py-2" data-testid="evidence-company-unknown">
              <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{t("unknown")}</dt>
              <dd className="text-text-secondary">{company.unknown.map((u) => tx(`unknownItem.${u}`)).join(" · ")}</dd>
            </div>
          </dl>
        </section>
      </Card>

      {/* ── AFTER CONFIRM ──────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-2" data-testid="evidence-impact">
          <p className={EYEBROW}>{t("impactEyebrow")}</p>
          <h2 className={HEADING}>{t("impactTitle")}</h2>
          <ul className="grid gap-1.5 text-sm text-text-secondary sm:grid-cols-2" data-testid="evidence-commit-effect">
            <li>{t("impact.people", { count: commit.createPeople, total: company.people })}</li>
            <li>{t("impact.places", { count: commit.createObjects, total: company.places })}</li>
            <li>{t("impact.records", { records: commit.records, daily: commit.dailyRecords, held: commit.notWritten })}</li>
            <li>{t("impact.aggregates", { period: commit.periodRecords, unknown: commit.undatedDurationRecords })}</li>
            <li>{t("impact.time", { period })}</li>
            <li>{t("impact.cards", { count: company.people })}</li>
            <li>{t("impact.field")}</li>
            <li>{t("impact.calendar")}</li>
            <li className="sm:col-span-2">{t("impact.provenance")}</li>
          </ul>
          <p className="text-xs text-text-muted">{t("impactNote")}</p>
        </section>
      </Card>
    </div>
  );
}
