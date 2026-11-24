import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";
import type { BusinessHistory, HistoryBucketTotals } from "@/lib/organization-evidence/business-history";
import {
  businessHistoryHeader,
  type BusinessHistoryIdentity,
} from "@/lib/organization-evidence/business-history-header";

/**
 * THE BUSINESS HISTORY, AT A GLANCE — one continuous history read in periods
 * (owner model 2026-09-30). Totals, the stated periods (each with what it rests
 * on and what it does NOT claim), the records no period statement places, and
 * the work by year. Every figure is a count of canonical records; nothing here
 * is a second store, and no legal identity is asserted beyond the statement.
 */

function spanText(t: HistoryBucketTotals, locale: string): string | null {
  if (!t.from) return null;
  const o: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const a = formatUtcDate(t.from, locale, o);
  const b = t.to ? formatUtcDate(t.to, locale, o) : null;
  return b && b !== a ? `${a} – ${b}` : a;
}

export async function BusinessHistoryOverview({
  business,
  organizationId,
  organizationName,
  identity,
  clients = [],
  locale,
}: {
  readonly business: BusinessHistory | null;
  readonly organizationId: string;
  readonly organizationName: string;
  /** Legal identity for the own-vs-earlier split; absent = the display name only. */
  readonly identity?: BusinessHistoryIdentity;
  /** The clients this organization's OWN records name (`client` parties,
   *  decision 0033: its direct counterparty only). */
  readonly clients?: readonly { readonly name: string | null }[];
  readonly locale: string;
}) {
  const t = await getTranslations("companyWorkHistory.business");
  if (business === null) {
    return (
      <p className="text-meta text-text-muted" data-testid="business-history-unavailable">
        {t("unavailable")}
      </p>
    );
  }
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const { totals } = business;
  const maxYearHours = Math.max(1, ...business.years.map((y) => y.hours));
  const orgQuery = `?org=${organizationId}`;
  // P0-B: work done under an earlier legal entity is that entity's and its
  // people's history — the header never presents it as this organization's
  // own. When any record sits outside an own period, the header reads the
  // periods apart and the all-period total is labelled as records HELD.
  const header = businessHistoryHeader(
    business,
    identity ?? {
      legalName: null,
      displayName: organizationName,
      ownStatementIds: [],
    },
  );

  // ONE short statement of the structure, never a legal line per card: the
  // earlier legal entities in order, and what the statements claim only when
  // they claim more than "not the same entity" (decision 0032).
  const earlier = header.rows
    .map((r, i) => ({
      r,
      start: business.periods[i]?.statement.periodStart ?? "9999",
    }))
    .filter(({ r }) => r.ownership !== "own" && r.totals.records > 0)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(({ r }) => r);
  const entityNames = [...new Set(earlier.map((r) => r.legalEntityLabel ?? r.label))];
  const asserted = [...new Set(earlier.map((r) => r.legalEntityRelation))].filter((x) => x !== "not_asserted");
  const structure =
    entityNames.length > 0
      ? [
          // The relation is read from the records' own client party, never
          // assumed: one named direct client → "subcontractor → client".
          clients.length === 1 && clients[0]!.name
            ? t("structureForClient", { names: entityNames.join(t("structureLater")), client: clients[0]!.name })
            : t("structure", { names: entityNames.join(t("structureLater")) }),
          ...asserted.map((x) => t(`relation.${x}`)),
        ].join(" ")
      : null;

  const figures = (b: HistoryBucketTotals) =>
    t("figures", {
      records: n.format(b.records),
      hours: n.format(b.hours),
      people: n.format(b.people),
      places: n.format(b.places),
    });

  /* Periods — one card per legal entity, only when periods are stated.
  Without any, the work is simply this organization's own history:
  no "not placed" line, no invitation to state a period (owner P0
  2026-11-24). What a statement rests on is ONE localized label; the
  statement's internal reference and narrative never render. */
  const periodsBlock =
    business.periods.length > 0 ? (
      <div className="flex flex-col gap-3" data-testid="business-history-periods">
        <h3 className="font-display text-base font-semibold text-text-primary">{t("periodsTitle")}</h3>
        <ol className="flex flex-col gap-3">
          {business.periods.map(({ statement: p, bases, totals: pt }) => (
            <li
              key={p.id}
              className="flex flex-col gap-1.5 rounded-2xl border border-text-primary/10 p-4"
              data-testid="business-history-period"
              data-period-records={pt.records}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-lg font-semibold text-text-primary">
                  {p.legalEntityLabel ?? p.periodLabel}
                </p>
                <p className="text-meta text-text-muted">
                  {p.periodStart || p.periodEnd
                    ? t("bounds", {
                        from: p.periodStart ? (formatUtcDate(p.periodStart, locale) ?? "") : t("notDocumented"),
                        to: p.periodEnd ? (formatUtcDate(p.periodEnd, locale) ?? "") : t("notDocumented"),
                      })
                    : t("boundsNotDocumented")}
                </p>
              </div>
              <p className="text-sm text-text-primary" data-testid="business-history-period-figures">
                {pt.records > 0 ? figures(pt) : t("periodNoRecords")}
                {pt.records > 0 && spanText(pt, locale) ? ` · ${spanText(pt, locale)}` : ""}
              </p>
              <p className="text-meta text-text-muted" data-testid="business-history-period-basis">
                {(bases ?? [p.basis]).map((b) => t(`basis.${b}`)).join(" · ")}
              </p>
            </li>
          ))}
        </ol>
        {business.notPlaced.records > 0 ? (
          <p
            className="text-sm text-text-secondary"
            data-testid="business-history-not-placed"
            data-records={business.notPlaced.records}
          >
            {t("notPlaced", {
              figures: figures(business.notPlaced),
              span: spanText(business.notPlaced, locale) ?? t("spanUnknown"),
            })}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <section
      className="flex flex-col gap-6 rounded-[26px] p-5 shadow-[inset_0_0_0_1px_rgb(var(--c-text-primary)/0.10)] md:p-8"
      data-testid="business-history-overview"
      data-records={totals.records}
      data-hours={totals.hours}
      data-periods={business.periods.length}
      data-header-split={header.split ? "true" : "false"}
    >
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-text-muted">{t("eyebrow")}</span>
        <h2 className="font-display text-[clamp(1.55rem,2.6vw,2.15rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-text-primary">
          {header.split ? t("titleHeld", { name: organizationName }) : t("title", { name: organizationName })}
        </h2>
        <p className="max-w-[60ch] text-sm leading-relaxed text-text-secondary">
          {header.split ? (structure ?? t("subtitleHeld", { name: organizationName })) : t("subtitle")}
        </p>
      </header>

      {/* P0-B: whose work — the periods, each with its own figures, before any total. */}
      {header.split ? periodsBlock : null}

      {/* Totals — every record held, each counted once. In a split header
          they are labelled as held across all periods, never as own work. */}
      {header.split ? (
        <p className="-mb-3 text-meta text-text-muted" data-testid="business-history-totals-held">
          {t("totalsHeld", { name: organizationName })}
        </p>
      ) : null}
      <dl
        className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6"
        data-testid="business-history-totals"
      >
        {(
          [
            ["records", n.format(totals.records)],
            ["hours", n.format(totals.hours)],
            ["people", n.format(totals.people)],
            ["places", n.format(totals.places)],
            ["span", spanText(totals, locale) ?? t("spanUnknown")],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 border-t border-text-primary/10 pt-3">
            <dt className="text-meta text-text-muted">{t(`totals.${k}`)}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>

      {header.split ? null : periodsBlock}

      {/* The work by year — every record by its own date, never split. */}
      {business.years.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="business-history-years">
          <h3 className="font-display text-base font-semibold text-text-primary">{t("yearsTitle")}</h3>
          <ol className="flex flex-col">
            {business.years.map((y) => (
              <li
                key={y.year}
                className="grid grid-cols-[3.5rem_1fr] items-center gap-x-4 gap-y-1 border-t border-text-primary/10 py-2.5 first:border-t-0 sm:grid-cols-[3.5rem_1fr_16rem]"
                data-testid="business-history-year"
                data-year={y.year}
              >
                <span className="font-display text-base font-semibold tabular-nums text-text-primary">{y.year}</span>
                <span className="relative h-[3px] overflow-hidden rounded-full bg-text-primary/10" aria-hidden>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-brand-orange/80"
                    style={{
                      width: `${Math.max(2, (y.hours / maxYearHours) * 100)}%`,
                    }}
                  />
                </span>
                <span className="text-meta text-text-muted max-sm:col-span-2">{figures(y)}</span>
              </li>
            ))}
          </ol>
          {business.undated > 0 ? (
            <p className="text-meta text-text-muted">{t("undated", { count: business.undated })}</p>
          ) : null}
        </div>
      ) : null}

      {/* Doors into the same records, seen by people, projects and places. */}
      <nav className="flex flex-wrap gap-2" aria-label={t("doorsLabel")} data-testid="business-history-doors">
        <Link
          href={`/dashboard/company/people${orgQuery}` as "/dashboard"}
          className="inline-flex min-h-11 items-center rounded-full border border-text-primary/20 px-4 text-sm font-semibold text-text-primary hover:border-brand-blue"
          data-testid="business-history-door-people"
        >
          {t("doors.people")} →
        </Link>
        <Link
          href={"/dashboard/projects" as "/dashboard"}
          className="inline-flex min-h-11 items-center rounded-full border border-text-primary/20 px-4 text-sm font-semibold text-text-primary hover:border-brand-blue"
          data-testid="business-history-door-projects"
        >
          {t("doors.projects")} →
        </Link>
        <a
          href="#company-work-history-places"
          className="inline-flex min-h-11 items-center rounded-full border border-text-primary/20 px-4 text-sm font-semibold text-text-primary hover:border-brand-blue"
          data-testid="business-history-door-places"
        >
          {t("doors.places")} ↓
        </a>
      </nav>
    </section>
  );
}
