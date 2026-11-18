import { getFormatter, getTranslations } from "next-intl/server";

import type { DemandHistory } from "@/lib/demand/demand-history";

/**
 * One need's history (function register 4.30): when it was created, every
 * proposal and answer with who acted and when, and how the need ended. The
 * close shows its outcome only; its time and actor are not stored on the need.
 */
export async function DemandHistoryList({
  history,
  nameFor,
}: {
  readonly history: DemandHistory;
  /** The candidate's label as their card shows it, by worker id. */
  readonly nameFor: (workerId: string) => string;
}) {
  const t = await getTranslations("scouting.history");
  const format = await getFormatter();
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-1/50 p-4"
      data-testid="demand-history"
      data-decided={history.decided ? "true" : "false"}
    >
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
      {history.decided ? (
        <p className="text-sm text-text-primary" data-testid="demand-history-decision">
          {t("decision", { names: history.hired.map(nameFor).join(", ") })}
        </p>
      ) : null}
      <ol className="flex flex-col gap-2">
        {history.entries.map((entry, i) => {
          if (entry.kind === "created") {
            return (
              <li key={`created-${i}`} className="flex flex-wrap gap-x-3 text-sm" data-testid="demand-history-created">
                <time dateTime={entry.at} className="font-mono text-meta text-text-muted">
                  {when(entry.at)}
                </time>
                <span className="text-text-secondary">{t("created")}</span>
              </li>
            );
          }
          if (entry.kind === "closed") {
            return (
              <li
                key={`closed-${i}`}
                className="flex flex-wrap gap-x-3 text-sm"
                data-testid="demand-history-closed"
                data-outcome={entry.outcome ?? "unknown"}
              >
                <span className="text-text-secondary">
                  {entry.outcome === "completed"
                    ? t("closedFilled")
                    : entry.outcome === "withdrawn"
                      ? t("closedWithdrawn")
                      : t("closed")}
                </span>
              </li>
            );
          }
          return (
            <li
              key={`booking-${i}`}
              className="flex flex-wrap gap-x-3 text-sm"
              data-testid={`demand-history-${entry.type}-${entry.workerId}`}
              data-actor={entry.actor}
            >
              <time dateTime={entry.at} className="font-mono text-meta text-text-muted">
                {when(entry.at)}
              </time>
              <span className="text-text-secondary">
                {t(`event.${entry.type}`, { name: nameFor(entry.workerId) })}
              </span>
              <span className="text-meta text-text-muted">{t(`actor.${entry.actor}`)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
