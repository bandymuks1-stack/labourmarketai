import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyOrganizationEvidence } from "@/lib/organization-evidence/import-core";
import {
  formatHoursAsStated,
  readPeriodEvidence,
} from "@/lib/organization-evidence/period-provenance";
import { PeriodBand, TimeReality } from "@/components/app/work-world/primitives";

/**
 * DERIVED PERIOD EVIDENCE ON THE CALENDAR — the month view's honest link
 * from a person's confirmed work history to time.
 *
 * A period record is real work with no source days. The calendar cannot put
 * it on a day, and must not. When the SOURCE stated the period (and no rate
 * of its own), the month view shows the record's PeriodBand with THIS
 * month's derived share emphasised, labelled DERIVED and "not source days" —
 * the ONE reading (`readPeriodEvidence`) and the same ribbon the profile
 * renders, never a second allocation. A span a person chose at import
 * ("800 h", "at least 16 month", set to 2025-06 → 2025-11) has NO monthly
 * figure (owner rule 2026-09-23) and is not drawn here at all — its record
 * shows it at month precision. Nothing here is a calendar item: it
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
  if (res.kind === "needs-migration") return null;
  if (res.kind !== "ok") {
    // A FAILED read is not "no period record". Said the way the plan says
    // every other source it could not read (SEP-7: UNKNOWN ≠ ZERO).
    const tUnavailable = await getTranslations("planning.derived");
    return (
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid="planning-source-note-period-error"
      >
        {tUnavailable("unavailable")}
      </p>
    );
  }

  const orgNameByPerson = new Map(
    res.links.flatMap((l) => (l.organizationName ? [[l.id, l.organizationName] as const] : [])),
  );

  const bands = res.records.flatMap((rec) => {
    if (rec.withdrawn) return [];
    // The ONE period reading (owner rule 2026-09-23): a month may carry a
    // share ONLY of a period the SOURCE stated with no rate of its own. A
    // span a person chose at import has no monthly figure to put on this
    // month — it is shown on the record itself, never here as a share.
    const reading = readPeriodEvidence({
      hours: rec.hours,
      periodStart: rec.periodStart,
      periodEnd: rec.periodEnd,
      derived: rec.derived,
      factFields: rec.factFields,
      sourceText: rec.text,
    });
    if (!reading || reading.kind !== "source_period") return [];
    const p = reading.projection;
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
              totalLabel={`${formatHoursAsStated(b.projection.totalHours)} h`}
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
