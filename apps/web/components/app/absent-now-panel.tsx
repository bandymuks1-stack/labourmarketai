import { getTranslations } from "next-intl/server";

import type { WorkerUnavailability } from "@/lib/planning/employer-availability";

/**
 * "Who is absent NOW" — the manager's morning question, answered on the
 * absences surface itself (V8 employer daily loop, GAP 3).
 *
 * Server-rendered and read-only: the lists arrive pre-derived from the SAME
 * minimised availability read the planning zone uses (no reason, no type —
 * WHO and WHEN only, the W12 owner decision), composed with the canonical
 * overlap predicate. This component adds no read of its own and cannot widen
 * one.
 *
 * Honesty: an empty list renders as an explicit "nobody" sentence, and the
 * unavailable state (absence schedule not applied here) says so — neither is
 * silently hidden, because "no one is absent" and "I cannot know" are
 * different answers to a staffing question.
 */
export async function AbsentNowPanel({
  state,
}: {
  state:
    | {
        kind: "ok";
        today: readonly WorkerUnavailability[];
        week: readonly WorkerUnavailability[];
        managedWorkerCount: number;
      }
    | { kind: "unavailable" };
}) {
  const t = await getTranslations("absences.absentNow");

  return (
    <section
      className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 p-4"
      data-testid="absent-now-panel"
    >
      <h2 className="font-display text-card-title font-semibold text-text-primary">
        {t("title")}
      </h2>

      {state.kind === "unavailable" ? (
        <p className="text-support text-text-muted" data-testid="absent-now-unavailable">
          {t("unavailable")}
        </p>
      ) : (
        <>
          <Band
            heading={t("today", { count: state.today.length })}
            empty={t("noneToday")}
            rows={state.today}
            testId="absent-today"
          />
          <Band
            heading={t("week", { count: state.week.length })}
            empty={t("noneWeek")}
            rows={state.week}
            testId="absent-week"
          />
          <p className="text-meta text-text-muted">
            {t("coverage", { count: state.managedWorkerCount })}
          </p>
        </>
      )}
    </section>
  );
}

function Band({
  heading,
  empty,
  rows,
  testId,
}: {
  heading: string;
  empty: string;
  rows: readonly WorkerUnavailability[];
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <h3 className="text-support font-semibold text-text-secondary">{heading}</h3>
      {rows.length === 0 ? (
        <p className="text-meta text-text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {rows.map((u) => (
            <li
              key={`${u.workerId}-${u.item.id}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3 text-support"
            >
              <span className="text-text-primary">
                {/* An unreadable name is stated, never replaced by an id. */}
                {u.workerName ?? "—"}
              </span>
              <span className="font-mono text-meta text-text-muted">
                {u.item.startDate}
                {u.item.endDate && u.item.endDate !== u.item.startDate
                  ? ` – ${u.item.endDate}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
