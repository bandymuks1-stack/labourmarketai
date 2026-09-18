import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyOrganizationEvidence } from "@/lib/organization-evidence/import-core";
import { projectPeriodAggregateByMonth } from "@/lib/organization-evidence/period-projection";
import { PeriodBand, TimeReality } from "@/components/app/work-world/primitives";

/**
 * DERIVED PERIOD EVIDENCE ON THE CALENDAR — the month view's honest link
 * from a person's confirmed work history to time.
 *
 * A period record ("800 h, 2025-06-01 → 2025-11-30") is real work with no
 * source days. The calendar cannot put it on a day, and must not: so the
 * month view shows the record's PeriodBand with THIS month's derived share
 * emphasised, labelled DERIVED and "not source days" — the same projection
 * (`projectPeriodAggregateByMonth`) and the same ribbon the profile already
 * renders, never a second allocation. Nothing here is a calendar item: it
 * never enters the day/agenda lists, never counts in a cell, never
 * conflicts with anything.
 *
 * Reads through the canonical subject reader (`listMyOrganizationEvidence`,
 * the caller's OWN confirmed roster links under RLS, bounded) — no new
 * query shape. Renders nothing when the person has no period record that
 * touches the month, when the read is unavailable, or when there is nothing
 * honest to derive. Withdrawn records do not draw.
 */
export async function DerivedPeriodEvidence({
  month,
  locale,
}: {
  /** `YYYY-MM` — the month the calendar is showing. */
  month: string;
  locale: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const res = await listMyOrganizationEvidence(
    { supabase, userId: user.id, locale },
    { limit: 100 },
  );
  if (res.kind !== "ok") return null;

  const orgNameByPerson = new Map(
    res.links.flatMap((l) => (l.organizationName ? [[l.id, l.organizationName] as const] : [])),
  );

  const bands = res.records.flatMap((rec) => {
    if (rec.withdrawn) return [];
    const p = projectPeriodAggregateByMonth({
      hours: rec.hours,
      periodStart: rec.periodStart,
      periodEnd: rec.periodEnd,
    });
    if (!p) return [];
    const share = p.months.find((m) => m.month === month);
    if (!share) return [];
    return [
      {
        id: rec.id,
        organization: orgNameByPerson.get(rec.personId) ?? rec.contextLabel ?? null,
        text: rec.text,
        projection: p,
        share,
      },
    ];
  });
  if (bands.length === 0) return null;

  const t = await getTranslations("planning.derived");
  const tRecords = await getTranslations("evidenceImport.records");

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-brand-cyan/25 bg-brand-cyan/5 px-4 py-3"
      aria-label={t("title")}
      data-testid="planning-derived-period"
      data-month={month}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TimeReality kind="derived" label={t("chip")} />
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("title")}
        </span>
      </div>
      <ul className="flex flex-col gap-4">
        {bands.map((b) => (
          <li
            key={b.id}
            className="flex flex-col gap-1.5"
            data-testid={`planning-derived-period-${b.id}`}
            data-share={b.share.hours.toFixed(2)}
          >
            <p className="text-sm text-text-primary">
              {b.organization ? (
                <span className="font-semibold">{b.organization} · </span>
              ) : null}
              <span className="text-text-secondary">{b.text}</span>
            </p>
            <p
              className="font-mono text-sm font-semibold tabular-nums text-brand-cyan"
              data-testid={`planning-derived-share-${b.id}`}
            >
              {t("thisMonth", { hours: b.share.hours.toFixed(2) })}
            </p>
            <PeriodBand
              totalLabel={`${b.projection.totalHours.toFixed(2)} h`}
              derivedLabel={tRecords("monthlyShare")}
              months={b.projection.months}
              activeMonth={month}
            />
          </li>
        ))}
      </ul>
      <Link
        href={"/dashboard/profile" as "/dashboard"}
        className="self-start text-meta text-text-secondary underline underline-offset-2 hover:text-text-primary"
        data-testid="planning-derived-period-link"
      >
        {t("sourceLink")} →
      </Link>
    </section>
  );
}
