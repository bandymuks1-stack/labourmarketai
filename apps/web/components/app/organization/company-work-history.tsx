import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { SemanticIcon } from "@/components/app/semantic-icon";
import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";
import { formatHoursAsStated, recordWhen } from "@/lib/organization-evidence/period-provenance";
import {
  loadCompanyWorkHistory,
  type CompanyWorkHistoryLoad,
} from "@/lib/organization-evidence/company-work-history-read";
import { isPeriodRecord, type PlaceGroup } from "@/lib/organization-evidence/company-work-history";

/**
 * THE COMPANY'S IMPORTED WORK HISTORY — seen from the place (2026-10-01).
 *
 * A committed historical import used to be visible only as a flat record list
 * inside one import session. This is the same records, folded into what a
 * person thinks in: where the work was, when, who worked there, what was done,
 * how many hours. Read-only; one read (`loadCompanyWorkHistory`), RLS-scoped,
 * ACTIVE-organization only.
 *
 * It says exactly what the import carried and what it did not (customer,
 * address and project are shown as not in the source — never filled in), and
 * it never presents the work as work done through LabourMarket.ai or as
 * independently verified: it is the company's own timesheet.
 */

const nf = (n: number) => formatHoursAsStated(Math.round(n * 100) / 100);

function Provenance({ t, name }: { t: Awaited<ReturnType<typeof getTranslations>>; name: string }) {
  return (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta leading-relaxed text-text-muted"
      data-testid="company-work-history-provenance"
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 font-mono uppercase tracking-label text-text-secondary">
        <SemanticIcon concept="historical" label={t("badge")} className="h-3 w-3" />
        {t("badge")}
      </span>
      <span>{t("provenance", { name })}</span>
    </p>
  );
}

function Stat({ concept, value, label }: { concept: "object" | "person" | "time" | "calendar"; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-ink-600 bg-ink-800/40 px-4 py-3">
      <SemanticIcon concept={concept} label={label} className="h-5 w-5 text-brand-cyan" />
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-xl font-bold leading-tight text-text-primary">{value}</span>
        <span className="text-meta text-text-muted">{label}</span>
      </div>
    </div>
  );
}

function span(first: string | null, last: string | null, locale: string): string | null {
  if (!first) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const a = formatUtcDate(first, locale, opts);
  const b = last ? formatUtcDate(last, locale, opts) : null;
  return b && b !== a ? `${a} – ${b}` : a;
}

export async function CompanyWorkHistory({ locale }: { locale: string }) {
  const load = await loadCompanyWorkHistory(locale);
  if (load.kind === "hidden") return null;
  const t = await getTranslations("companyWorkHistory");

  if (load.kind === "unavailable") {
    return (
      <p className="text-meta leading-relaxed text-text-muted" data-testid="company-work-history-unavailable">
        {t("unavailable")}
      </p>
    );
  }

  const { history, organizationName, elsewhere, attributedCount } = load;

  if (history.totalRecords === 0) {
    return (
      <section className="flex flex-col gap-2" data-testid="company-work-history" data-state="empty">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
        <Card variant="empty" compact>
          <p className="text-sm text-text-secondary">{t("empty", { name: organizationName })}</p>
          {elsewhere.map((e) => (
            <p
              key={e.id}
              className="mt-2 text-sm text-text-primary"
              data-testid="company-work-history-elsewhere"
              data-count={e.count}
            >
              {t("elsewhere", { name: e.name, count: e.count })}
            </p>
          ))}
        </Card>
      </section>
    );
  }

  const placed = history.places.filter((p) => p.kind !== "none");
  const none = history.places.find((p) => p.kind === "none");
  const maxHours = Math.max(1, ...placed.map((p) => p.dayHours));
  const periodLabel = span(history.firstDate, history.lastDate, locale);

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="company-work-history"
      data-state="ready"
      data-records={history.totalRecords}
      data-places={placed.length}
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("subtitle", { name: organizationName })}</p>
        <Provenance t={t} name={organizationName} />
        {attributedCount > 0 ? (
          <p className="text-meta leading-relaxed text-text-muted" data-testid="company-work-history-attributed">
            {t("attributedNote", { count: attributedCount })}
          </p>
        ) : null}
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat concept="object" value={String(placed.length)} label={t("stats.places")} />
        <Stat concept="person" value={String(history.peopleCount)} label={t("stats.people")} />
        <Stat concept="time" value={`${nf(history.dayHours)} h`} label={t("stats.dayHours")} />
        <Stat concept="calendar" value={periodLabel ?? "—"} label={t("stats.period")} />
      </div>

      <ul className="grid gap-3 md:grid-cols-2" data-testid="company-work-history-places">
        {placed.map((p) => (
          <li key={p.key}>
            <PlaceTile p={p} t={t} locale={locale} maxHours={maxHours} />
          </li>
        ))}
      </ul>

      {none ? (
        <p className="text-sm text-text-muted" data-testid="company-work-history-noplace">
          {t("noPlace", { count: none.records.length, hours: nf(none.dayHours) })}
        </p>
      ) : null}
      {history.periodHours > 0 ? (
        <p className="text-sm text-text-muted" data-testid="company-work-history-period">
          {t("periodAside", { hours: nf(history.periodHours) })}
        </p>
      ) : null}

      <Card compact data-testid="company-work-history-scope">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("scope.title")}</p>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{t("scope.carried")}</p>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {t("scope.missing")}
        </p>
      </Card>
    </section>
  );
}

export function placeHref(key: string): string {
  return `/dashboard/company/history?place=${encodeURIComponent(key)}#company-place-detail`;
}

function PlaceTile({
  p,
  t,
  locale,
  maxHours,
}: {
  p: PlaceGroup;
  t: Awaited<ReturnType<typeof getTranslations>>;
  locale: string;
  maxHours: number;
}) {
  const hours = p.dayHours;
  const when = span(p.firstDate, p.lastDate, locale);
  const latest = p.records.find((r) => r.text);
  return (
    <Link
      href={placeHref(p.key) as "/dashboard"}
      data-testid="company-work-history-place"
      data-place={p.key}
      className="group flex h-full flex-col gap-3 rounded-card border border-ink-600 bg-ink-800/40 p-4 transition-colors hover:border-brand-blue"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <SemanticIcon concept="object" label={t("place")} className="h-5 w-5 shrink-0 text-brand-cyan" />
          <span className="truncate font-display text-lg font-semibold text-text-primary">{p.name}</span>
        </span>
        <span className="shrink-0 font-mono text-sm text-text-primary">{nf(hours)} h</span>
      </span>
      <span
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700"
        role="img"
        aria-label={t("hoursShare", { hours: nf(hours) })}
      >
        <span
          className="block h-full rounded-full bg-brand-cyan/70"
          style={{ width: `${Math.max(4, Math.round((hours / maxHours) * 100))}%` }}
        />
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-text-muted">
        {when ? <span>{when}</span> : null}
        <span>{t("people", { count: p.people.length })}</span>
        <span>{t("entries", { count: p.records.length })}</span>
        {p.periodHours > 0 ? (
          <span data-testid="company-work-history-place-period">
            {t("periodShort", { hours: nf(p.periodHours) })}
          </span>
        ) : null}
      </span>
      {latest ? (
        <span className="line-clamp-2 text-sm leading-relaxed text-text-secondary">{latest.text}</span>
      ) : null}
      <span className="mt-auto text-meta font-semibold text-brand-blue">{t("open")} →</span>
    </Link>
  );
}

/** Detail of ONE place: who, when, what was done, hours — the same records,
 *  newest first, grouped by month, every one carrying its provenance. */
export async function CompanyPlaceHistory({
  locale,
  placeKey,
  load: preloaded,
}: {
  locale: string;
  placeKey: string;
  load?: CompanyWorkHistoryLoad;
}) {
  const load = preloaded ?? (await loadCompanyWorkHistory(locale));
  if (load.kind === "hidden") return null;
  const t = await getTranslations("companyWorkHistory");
  if (load.kind === "unavailable") {
    return <p className="text-sm text-text-muted">{t("unavailable")}</p>;
  }
  const place = load.history.places.find((p) => p.key === placeKey);
  if (!place) {
    return (
      <Card variant="empty" compact data-testid="company-place-missing">
        <p className="text-sm text-text-secondary">{t("placeMissing")}</p>
      </Card>
    );
  }

  const byMonth = new Map<string, typeof place.records>();
  for (const r of place.records) {
    const m = (r.activityDate ?? r.periodStart ?? "").slice(0, 7) || "—";
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  const when = span(place.firstDate, place.lastDate, locale);

  return (
    <div className="flex flex-col gap-5" data-testid="company-place" data-place={place.key}>
      <header className="flex flex-col gap-2">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("place")}</p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {place.name ?? t("noPlaceName")}
        </h1>
        <Provenance t={t} name={load.organizationName} />
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        <Stat concept="time" value={`${nf(place.dayHours)} h`} label={t("stats.dayHours")} />
        <Stat concept="person" value={String(place.people.length)} label={t("stats.people")} />
        <Stat concept="calendar" value={when ?? "—"} label={t("stats.period")} />
      </div>
      {place.periodHours > 0 ? (
        <p className="text-sm text-text-muted" data-testid="company-place-period">
          {t("periodAside", { hours: nf(place.periodHours) })}
        </p>
      ) : null}

      <Card compact data-testid="company-place-facts">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {(
            [
              ["customer", false],
              ["address", place.scope.hasAddress],
              ["project", place.scope.hasProject],
            ] as const
          ).map(([k, present]) => (
            <div key={k} className="flex flex-col">
              <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{t(`facts.${k}`)}</dt>
              <dd className="text-text-secondary">{k === "address" && place.scope.addressText ? place.scope.addressText : present ? t("facts.linked") : t("facts.notInSource")}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="flex flex-col gap-2" aria-label={t("whoWorked")} data-testid="company-place-people">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("whoWorked")}</h2>
        <ul className="flex flex-wrap gap-2">
          {place.people.map((pp) => {
            const wid = load.linkedWorkers[pp.id];
            const chip = (
              <span className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800/40 px-3 py-1 text-sm text-text-primary">
                <SemanticIcon concept="person" label={t("stats.people")} className="h-3.5 w-3.5 text-brand-cyan" />
                {pp.name ?? "—"}
                <span className="font-mono text-meta text-text-muted">
                  {nf(pp.dayHours)} h
                  {pp.periodHours > 0 ? ` + ${t("periodShort", { hours: nf(pp.periodHours) })}` : ""}
                </span>
              </span>
            );
            return (
              <li key={pp.id}>
                {wid ? (
                  <Link href={`/dashboard/people/${wid}` as "/dashboard"} data-testid="company-place-person-link">
                    {chip}
                  </Link>
                ) : (
                  chip
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-4" aria-label={t("timeline")} data-testid="company-place-timeline">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("timeline")}</h2>
        {[...byMonth.entries()].map(([month, recs]) => (
          <div key={month} className="flex flex-col gap-2">
            <h3 className="font-display text-lg font-semibold text-text-primary">
              {formatUtcDate(`${month}-01`, locale, { month: "long", year: "numeric" }) ?? month}
              <span className="ml-3 font-mono text-meta font-normal text-text-muted">
                {nf(recs.filter((r) => !isPeriodRecord(r)).reduce((s, r) => s + (r.hours ?? 0), 0))} h
              </span>
            </h3>
            <ul className="flex flex-col gap-2">
              {recs.map((r) => (
                <li
                  key={r.id}
                  data-testid="company-place-entry"
                  className="grid gap-x-4 gap-y-1 rounded-card border border-ink-600 bg-ink-800/40 px-4 py-3 sm:grid-cols-[8rem_1fr_auto]"
                >
                  <span className="font-mono text-meta text-text-muted">{recordWhen(r, locale) ?? "—"}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-text-primary">{r.personName ?? "—"}</span>
                    {r.text ? (
                      <span className="text-sm leading-relaxed text-text-secondary">{r.text}</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-sm text-text-primary">
                    {r.hours !== null ? `${formatHoursAsStated(r.hours)} h` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
