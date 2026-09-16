import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { createUtcFormatter } from "@/lib/time/display";
import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";
import type { ImportProjection, IssueProjection } from "@/lib/organization-evidence/import-projections";
import {
  EvidenceAcknowledgeForm,
  EvidenceLabelResolveForm,
  type Option,
} from "@/components/app/evidence-import-forms";

/**
 * THE RECONSTRUCTION — what the system understood from the source, shown
 * as the product will show it once committed (owner command §39–§40, §57):
 *
 *   UNDERSTOOD   the period, the people, the places, the stated hours;
 *   TO CHECK     only the genuine issues, blocking ones first, each with
 *                the one action that settles it — asked once per label;
 *   PEOPLE       one card per person: rows, days, hours, span, places —
 *                evidence and state, no score of any kind (§14);
 *   PLACES       the real objects, their source spellings, shared days;
 *   CALENDAR     actual work per person per week, flagged days marked;
 *   COMPANY      what this data already lets the system say, and what it
 *                does NOT say (UNKNOWN is listed, never zeroed — SEP-7).
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
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>{children}</span>
  );
}

function Figure({ value, label, testId }: { value: string | number; label: string; testId: string }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className="font-display text-2xl font-bold tabular-nums text-text-primary">{value}</span>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
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
  actions: { readonly resolveLabel: Action; readonly acknowledge: Action };
  errors: Record<string, string>;
}) {
  const t = await getTranslations("evidenceImport.reconstruction");
  // Dynamic keys (`issue.${kind}`) with values: next-intl's typed `t` cannot
  // see the union, so the call is widened once here and nowhere else.
  const tx = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const fmtDate = createUtcFormatter(locale, { day: "numeric", month: "short" });
  const fmtLong = createUtcFormatter(locale, { day: "numeric", month: "long", year: "numeric" });
  const hours = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const { people, places, calendar, issues, company, commit } = projection;
  const period =
    company.firstDate && company.lastDate
      ? `${fmtLong(company.firstDate) ?? company.firstDate} – ${fmtLong(company.lastDate) ?? company.lastDate}`
      : t("periodUnknown");
  const blocking = issues.filter((i) => i.blocking);
  const informational = issues.filter((i) => !i.blocking);

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
        <span className="text-sm font-semibold text-text-primary">
          {tx(`issue.${i.kind}`, { count: i.count, label: i.label ?? "" })}
        </span>
        {i.sample && i.kind !== "ambiguous_place" && i.kind !== "place_from_text" && (
          <span className="text-xs text-text-muted">{i.sample}</span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">{tx(`issueWhy.${i.kind}`)}</p>
      {i.kind === "impossible_hours" && (
        <EvidenceAcknowledgeForm
          action={actions.acknowledge}
          sessionId={sessionId}
          rowIds={i.rowIds}
          problem="hours_exceed_day"
          labels={{ keepAsStated: t("keepAsStated"), hint: t("keepAsStatedHint"), errors }}
        />
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

  return (
    <div className="flex flex-col gap-4" data-testid="evidence-reconstruction">
      {/* ── UNDERSTOOD ─────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-understood">
          <p className={EYEBROW}>{t("understoodEyebrow")}</p>
          <h2 className={HEADING}>{t("understoodTitle")}</h2>
          <p className="text-sm text-text-secondary" data-testid="evidence-understood-period">{period}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure value={company.rows} label={t("figures.rows")} testId="evidence-figure-rows" />
            <Figure value={company.people} label={t("figures.people")} testId="evidence-figure-people" />
            <Figure value={company.places} label={t("figures.places")} testId="evidence-figure-places" />
            <Figure value={`${hours(company.statedHours)} h`} label={t("figures.hours")} testId="evidence-figure-hours" />
          </div>
          {company.flaggedHours > 0 && (
            <p className="text-xs text-state-amber" data-testid="evidence-flagged-hours">
              {t("flaggedHours", { hours: hours(company.flaggedHours) })}
            </p>
          )}
          <p className="text-xs text-text-muted">{t("nothingWritten")}</p>
        </section>
      </Card>

      {/* ── TO CHECK ───────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-issues" data-blocking={blocking.length}>
          <h2 className={HEADING}>
            {blocking.length > 0
              ? t("issuesTitleBlocking", { count: blocking.length })
              : t("issuesTitleClear")}
          </h2>
          {blocking.length === 0 && informational.length === 0 && (
            <p className="text-sm text-text-muted">{t("noIssues")}</p>
          )}
          {blocking.length > 0 && <ul className="flex flex-col gap-2">{blocking.map(issueLine)}</ul>}
          {informational.length > 0 && (
            <details className="rounded-md border border-ink-600" data-testid="evidence-issues-informational">
              <summary className="cursor-pointer px-3 py-2 text-sm text-text-secondary">
                {t("informational", { count: informational.length })}
              </summary>
              <ul className="flex flex-col gap-2 px-3 pb-3">{informational.map(issueLine)}</ul>
            </details>
          )}
        </section>
      </Card>

      {/* ── PEOPLE ─────────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-people">
          <h2 className={HEADING}>{t("peopleTitle", { count: people.length })}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <li
                key={p.label}
                className="flex flex-col gap-1.5 rounded-md border border-ink-500 bg-ink-900 px-3 py-2"
                data-testid="evidence-person-card"
                data-state={p.state}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-text-primary">{p.name ?? p.label}</span>
                  <Chip tone={STATE_CHIP[p.state]}>{tx(`personState.${p.state}`)}</Chip>
                </div>
                <p className="text-xs tabular-nums text-text-secondary">
                  {t("personLine", { rows: p.rows, days: p.days, hours: hours(p.hours) })}
                </p>
                {p.firstDate && p.lastDate && (
                  <p className="text-xs text-text-muted">
                    {fmtDate(p.firstDate)} – {fmtDate(p.lastDate)}
                  </p>
                )}
                {p.places.length > 0 && (
                  <p className="truncate text-xs text-text-muted" title={p.places.join(", ")}>
                    {p.places.slice(0, 3).join(" · ")}
                    {p.places.length > 3 ? ` +${p.places.length - 3}` : ""}
                  </p>
                )}
                {p.flaggedHours > 0 && (
                  <p className="text-xs text-state-amber">{t("personFlagged", { hours: hours(p.flaggedHours) })}</p>
                )}
                {p.state === "new" && <p className="text-xs text-text-muted">{t("personUnlinked")}</p>}
              </li>
            ))}
          </ul>
        </section>
      </Card>

      {/* ── PLACES ─────────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-places">
          <h2 className={HEADING}>{t("placesTitle", { count: places.length })}</h2>
          <ul className="flex flex-col divide-y divide-ink-600">
            {places.map((pl) => (
              <li
                key={`${pl.state}:${pl.name}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
                data-testid="evidence-place-row"
                data-state={pl.state}
              >
                <span className="font-semibold text-text-primary">{pl.name}</span>
                <Chip tone={STATE_CHIP[pl.state]}>{tx(`placeState.${pl.state}`)}</Chip>
                <span className="text-xs tabular-nums text-text-secondary">
                  {t("placeLine", { rows: pl.rows, people: pl.people, hours: hours(pl.statedHours) })}
                </span>
                {pl.sharedRows > 0 && (
                  <span className="text-xs text-text-muted">{t("placeShared", { count: pl.sharedRows })}</span>
                )}
                {pl.origin === "text" && <span className="text-xs text-text-muted">{t("placeFromText")}</span>}
                {pl.spellings.length > 0 && (
                  <span className="text-xs text-text-muted" data-testid="evidence-place-spellings">
                    {t("placeSpellings")}: {pl.spellings.join(", ")}
                  </span>
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
          <p className="text-xs text-text-secondary">
            {t("calendarLine", { weeks: calendar.weeks.length, personDays: calendar.personDays })}
          </p>
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
                  const byPerson = new Map<string, { hours: number; days: number; flagged: boolean }>();
                  for (const d of w.days) {
                    for (const p of d.people) {
                      const cur = byPerson.get(p.label) ?? { hours: 0, days: 0, flagged: false };
                      byPerson.set(p.label, {
                        hours: cur.hours + (p.flagged ? 0 : (p.hours ?? 0)),
                        days: cur.days + 1,
                        flagged: cur.flagged || p.flagged,
                      });
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
                          <td key={p} className={`px-2 py-1 tabular-nums ${c?.flagged ? "text-state-amber" : "text-text-primary"}`}>
                            {c ? `${hours(c.hours)} h · ${c.days}d${c.flagged ? " ⚠" : ""}` : <span className="text-text-muted">—</span>}
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
          <p className="text-xs text-text-muted">{t("calendarNote")}</p>
        </section>
      </Card>

      {/* ── COMPANY ────────────────────────────────────────────────────── */}
      <Card compact>
        <section className="flex flex-col gap-3" data-testid="evidence-company">
          <h2 className={HEADING}>{t("companyTitle")}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-900 px-3 py-2">
              <dt className="font-mono text-meta uppercase tracking-label text-state-success">{t("known")}</dt>
              <dd className="text-text-secondary">
                {t("knownLine", {
                  people: company.people,
                  places: company.places,
                  personDays: company.personDays,
                  hours: hours(company.statedHours),
                })}
                {company.activities.length > 0 && (
                  <span className="block text-xs text-text-muted">
                    {t("activities")}: {company.activities.join(", ")}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-900 px-3 py-2" data-testid="evidence-company-unknown">
              <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{t("unknown")}</dt>
              <dd className="text-text-secondary">
                {company.unknown.map((u) => tx(`unknownItem.${u}`)).join(" · ")}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-text-muted" data-testid="evidence-commit-effect">
            {t("commitEffect", {
              records: commit.records,
              held: commit.notWritten,
              people: commit.createPeople,
              objects: commit.createObjects,
            })}
          </p>
        </section>
      </Card>
    </div>
  );
}
