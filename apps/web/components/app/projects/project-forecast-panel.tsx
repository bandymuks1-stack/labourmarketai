import { getTranslations } from "next-intl/server";

import type { ProjectForecastRead } from "@/lib/forecast/forecast-read";
import { formatUtcDate } from "@/lib/time/display";

/**
 * THE PROJECT FORECAST — beside the project course, for the project's manager
 * only (lib/forecast/forecast-read.ts decides who). SEP-1: every line here is
 * a FORECAST read from recorded facts under stated assumptions, and the panel
 * says so in words; it never borrows the course's "done" shapes, and green is
 * not used (green means a second party confirmed someone's work).
 *
 * SEP-7: a figure the engine could not read is "unknown", never zero and
 * never "on track". Too little evidence is its own honest state.
 *
 * Team-level only, like the course: no names, no per-person figures.
 */
export async function ProjectForecastPanel({
  read,
  locale,
}: {
  readonly read: ProjectForecastRead;
  readonly locale: string;
}) {
  if (read.state === "not_manager") return null;
  const t = await getTranslations("projectForecast");

  const shell = (state: string, body: React.ReactNode) => (
    <section
      aria-label={t("title")}
      data-testid="project-forecast"
      data-state={state}
      className="rounded-card border border-ink-600/70 bg-ink-800/50 p-4 sm:p-5"
    >
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
      {body}
    </section>
  );

  if (read.state === "unavailable") {
    return shell(
      "unavailable",
      <p role="status" className="mt-2 text-support text-text-secondary">
        {t("unavailable")}
      </p>,
    );
  }

  const f = read.forecast;
  const day = (iso: string | null) => (iso ? (formatUtcDate(iso, locale, { year: "numeric", month: "short", day: "numeric" }) ?? iso) : null);
  const note = (
    <p className="mt-1 text-meta leading-relaxed text-text-muted" data-testid="project-forecast-note">
      {t("notFact", { date: day(f.asOf) ?? f.asOf })}
    </p>
  );

  if (f.status !== "ok") {
    return shell(
      f.status,
      <>
        {note}
        <p role="status" className="mt-2 text-support text-text-secondary">
          {f.status === "not_applicable" ? t("notApplicable") : t("insufficient")}
        </p>
      </>,
    );
  }

  const completion = f.completion.date
    ? (day(f.completion.date) ?? t("unknown"))
    : f.completion.beyondHorizon
      ? t("beyondHorizon")
      : t("unknown");
  const left =
    f.remaining.remaining !== null && f.remaining.total !== null && f.remaining.unit
      ? t(f.remaining.unit === "tasks" ? "leftTasks" : "leftStages", { left: f.remaining.remaining, total: f.remaining.total })
      : t("unknown");
  const people =
    f.workforce.workersNeeded !== null && f.workforce.activePeople !== null
      ? t("peopleValue", { needed: f.workforce.workersNeeded, active: f.workforce.activePeople })
      : t("unknown");

  const rows: { key: string; label: string; value: string }[] = [
    { key: "completion", label: t("completionLabel"), value: completion },
    { key: "deadline", label: t("deadlineLabel"), value: t(`risk.${f.deadline.risk}`) },
    { key: "left", label: t("leftLabel"), value: left },
    { key: "people", label: t("peopleLabel"), value: people },
    { key: "quality", label: t("qualityLabel"), value: t(`quality.${f.quality.risk}`) },
  ];

  return shell(
    "ok",
    <>
      {note}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col" data-testid={`project-forecast-${r.key}`}>
            <dt className="text-meta text-text-muted">{r.label}</dt>
            <dd className="text-support font-semibold text-text-primary">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-meta text-text-muted" data-testid="project-forecast-confidence">
        {t("confidenceLabel")}: {t(`confidence.${f.confidence}`)}
      </p>
      {f.actions.length > 0 && (
        <div className="mt-3">
          <h3 className="text-meta font-semibold text-text-secondary">{t("actionsTitle")}</h3>
          <ul className="mt-1 list-disc pl-5 text-meta text-text-secondary" data-testid="project-forecast-actions">
            {f.actions.map((a) => (
              <li key={a.key}>{t(`action.${a.key}`)}</li>
            ))}
          </ul>
        </div>
      )}
      {f.assumptions.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-meta text-text-muted">{t("assumptionsTitle")}</summary>
          <ul className="mt-1 list-disc pl-5 text-meta text-text-muted" data-testid="project-forecast-assumptions">
            {f.assumptions.map((a) => (
              <li key={a.key}>{t(`assumption.${a.key}`)}</li>
            ))}
          </ul>
        </details>
      )}
    </>,
  );
}
