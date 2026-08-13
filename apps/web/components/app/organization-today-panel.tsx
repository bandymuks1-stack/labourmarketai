import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import type { OrganizationToday } from "@/lib/planning/organization-today";

/**
 * "Today in your organization" (V8 employer daily loop, GAP 2). Server-
 * rendered, read-only: the facts arrive PRE-DERIVED from existing minimised
 * reads (lib/planning/organization-today.ts) — this component adds no read of
 * its own and cannot widen one.
 *
 * HONESTY: every line is a measurement, labelled by what it measures. There
 * is no shift/attendance data, so the panel never claims "who is working" —
 * roster is the active link count, absence is the recorded approved schedule,
 * and the basis line says a missing absence record is not proof of presence.
 * A fact that cannot be read renders its explicit "cannot read" state, never
 * a zero.
 */
export async function OrganizationTodayPanel({
  state,
}: {
  state: OrganizationToday;
}) {
  if (!state.applied) return null;
  const t = await getTranslations("workforcePlanning.organizationToday");

  return (
    <section
      className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 p-4"
      data-testid="organization-today-panel"
    >
      <h2 className="font-display text-card-title font-semibold text-text-primary">
        {t("title")}
      </h2>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label={t("roster")} value={state.roster} t={t} testId="roster" />
        <Fact
          label={t("pendingDecisions")}
          value={state.pendingAbsenceDecisions}
          t={t}
          testId="pending-decisions"
        />
        <Fact
          label={t("journalToday")}
          value={state.journalEntriesToday}
          t={t}
          testId="journal-today"
        />
        <Fact
          label={t("awaitingReview")}
          value={state.awaitingReview}
          t={t}
          testId="awaiting-review"
        />
      </dl>

      <Band
        heading={t("absentToday")}
        empty={t("noneRecordedToday")}
        testId="organization-today-absent-today"
      >
        {state.absentToday === null ? (
          <p className="text-meta text-text-muted">{t("notReadable")}</p>
        ) : state.absentToday.length === 0 ? null : (
          <ul className="flex flex-col gap-0.5">
            {state.absentToday.map((r) => (
              <li key={r.workerId} className="text-support text-text-primary">
                {r.name}
              </li>
            ))}
          </ul>
        )}
      </Band>

      <Band
        heading={t("absentNext")}
        empty={t("noneRecordedNext")}
        testId="organization-today-absent-next"
      >
        {state.absentNext7 === null ? (
          <p className="text-meta text-text-muted">{t("notReadable")}</p>
        ) : state.absentNext7.length === 0 ? null : (
          <ul className="flex flex-col gap-0.5">
            {state.absentNext7.map((r, i) => (
              <li
                key={`${r.workerId}-${r.startDate}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 text-support"
              >
                <span className="text-text-primary">{r.name}</span>
                <span className="font-mono text-meta text-text-muted">
                  {r.startDate}
                  {r.endDate && r.endDate !== r.startDate ? ` – ${r.endDate}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Band>

      <p className="text-meta text-text-muted">{t("basis")}</p>
    </section>
  );
}

/** One measured figure — or its explicit "cannot read right now" state. */
function Fact({
  label,
  value,
  t,
  testId,
}: {
  label: string;
  value: number | null;
  t: Awaited<ReturnType<typeof getTranslations>>;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid={`organization-today-${testId}`}
    >
      <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums text-text-primary">
        {value === null ? (
          <span className="text-sm font-normal text-text-muted">
            {t("notReadable")}
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Band({
  heading,
  empty,
  testId,
  children,
}: {
  heading: string;
  empty: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <h3 className="text-support font-semibold text-text-secondary">{heading}</h3>
      {children ?? <p className="text-meta text-text-muted">{empty}</p>}
    </div>
  );
}
