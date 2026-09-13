import { JournalWorkTimeCheckAck } from "@/components/app/journal-work-time-check-ack";
import { Link } from "@/lib/i18n/navigation";
import type { WorkTimeCheck } from "@/lib/journal/work-time-plausibility";
import { splitChecks } from "@/lib/journal/work-in-numbers-view";

import { fmtHours, type Translate } from "./format";

/**
 * Plausibility checks (owner §13) — warn, never corrupt: every figure around
 * them is exactly what was recorded. An open check offers the two honest
 * moves (open the records, or stand by the record with a reason through
 * the ONE acknowledgement action); an acknowledged check stays listed with
 * its reason. The person's own surface only — the organization view never
 * composes this.
 */
export function ChecksList({
  checks,
  locale,
  t,
  unitName,
  dayLabel,
}: {
  checks: readonly WorkTimeCheck[];
  locale: string;
  /** Bound to `journal.intelligence`. */
  t: Translate;
  unitName: (slug: string) => string | null;
  dayLabel: (iso: string | null) => string | null;
}) {
  if (checks.length === 0) return null;
  const { open: openChecks, acked: ackedChecks } = splitChecks(checks);
  const checkSentence = (c: WorkTimeCheck) =>
    t(`checks.${c.code}`, {
      hours: fmtHours(c.hours, locale),
      day: dayLabel(c.day) ?? c.day,
      entries: c.entryIds.length,
      title: c.title ?? t("checks.untitled"),
      ignored: c.ignored
        ? `${fmtHours(c.ignored.value, locale)} ${unitName(c.ignored.unit) ?? c.ignored.unit}`
        : "",
    }) +
    // which ledger doubled the day — the organization's records on top of
    // the journal's lines are named, so the person knows what to compare
    (c.organizationHours > 0
      ? ` ${t("checks.organizationHours", { hours: fmtHours(c.organizationHours, locale) })}`
      : "");
  return (
    <div className="flex flex-col gap-2" data-testid="wi-checks" data-open-checks={openChecks.length}>
      <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {t("checks.title")}
      </h3>
      <p className="text-meta leading-relaxed text-text-muted">{t("checks.hint")}</p>
      <ul className="flex flex-col gap-1.5">
        {openChecks.map((c) => (
          <li
            key={c.key}
            className="flex flex-col gap-1.5 rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2"
            data-testid={`wi-check-${c.code}`}
            data-check-key={c.key}
            data-check-day={c.day}
          >
            <span className="text-support leading-relaxed text-text-primary">{checkSentence(c)}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/dashboard/journal?date=${c.day}#journal-entries` as "/dashboard"}
                className="inline-flex min-h-11 items-center text-meta font-medium text-brand-blue hover:underline"
                data-testid={`wi-check-open-${c.code}`}
              >
                {t("checks.openRecords", { entries: c.entryIds.length })} →
              </Link>
              <JournalWorkTimeCheckAck
                entryId={c.entryIds[0]!}
                code={c.code}
                day={c.day}
                checkKey={c.key}
              />
            </span>
          </li>
        ))}
        {ackedChecks.map((c) => (
          <li
            key={c.key}
            className="flex flex-col gap-0.5 rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2"
            data-testid={`wi-check-acked-${c.code}`}
            data-check-key={c.key}
          >
            <span className="text-meta leading-relaxed text-text-muted">{checkSentence(c)}</span>
            <span className="text-meta text-text-secondary">
              {t("checks.acknowledged", { reason: c.acknowledged!.reason })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
