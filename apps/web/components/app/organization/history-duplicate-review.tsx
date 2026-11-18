import { getTranslations } from "next-intl/server";

import { loadDuplicateReview } from "@/lib/organization-evidence/duplicate-review";
import { formatUtcDate } from "@/lib/time/display";
import { HistoryDuplicateDecision } from "./history-duplicate-decision";

/**
 * POSSIBLE DUPLICATES — the organization reviews them; nothing is changed
 * automatically (owner decision 2026-10-21). Each group puts the records side
 * by side; a record marked as a duplicate is withdrawn (append-only event,
 * nothing deleted) and stays listed with its undo.
 */
export async function HistoryDuplicateReview({ locale }: { locale: string }) {
  const t = await getTranslations("historyDuplicates");
  const load = await loadDuplicateReview(locale);
  if (load.kind === "hidden") return null;
  if (load.kind === "unavailable") {
    return (
      <p className="text-sm text-text-muted" data-testid="history-duplicates" data-state="unavailable">
        {t("unavailable")}
      </p>
    );
  }
  const errorLabels = { error: t("error"), notAllowed: t("notAllowed"), notSameWork: t("notSameWork") };
  const awaiting = load.groups.filter((g) => g.liveCount > 1).length;
  const day = (iso: string) => formatUtcDate(iso, locale, { day: "numeric", month: "short", year: "numeric" }) ?? iso;
  return (
    <div className="flex flex-col gap-4" data-testid="history-duplicates" data-state="ready" data-awaiting={awaiting}>
      <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      {load.truncated ? <p className="text-meta text-state-warning">{t("truncated")}</p> : null}
      {load.groups.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="history-duplicates-none">
          {t("none")}
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-text-primary" data-testid="history-duplicates-summary">
            {t("summary", { groups: awaiting })}
          </p>
          <ul className="flex flex-col gap-3">
            {load.groups.map((g) => {
              const live = g.records.filter((r) => !r.withdrawn);
              return (
                <li
                  key={g.key}
                  className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
                  data-testid="history-duplicate-group"
                  data-live={g.liveCount}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                    <span className="font-semibold">{g.personName ?? t("unnamedPerson")}</span>
                    <span className="text-text-muted">·</span>
                    <span>{day(g.activityDate)}</span>
                    <span className="text-text-muted">·</span>
                    <span>{load.objectNames.get(g.workObjectId) ?? t("unnamedObject")}</span>
                    {g.sameHours ? (
                      <span className="rounded-full border border-state-amber/40 px-2 py-0.5 text-meta text-state-amber">{t("sameHours")}</span>
                    ) : g.liveCount > 1 ? (
                      <span className="rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-secondary">{t("differentHours")}</span>
                    ) : null}
                    {g.sameText ? (
                      <span className="rounded-full border border-state-amber/40 px-2 py-0.5 text-meta text-state-amber">{t("sameText")}</span>
                    ) : null}
                  </div>
                  <ol className="flex flex-col gap-2">
                    {g.records.map((r, i) => {
                      const kept = live.find((x) => x.id !== r.id);
                      return (
                        <li
                          key={r.id}
                          className="flex flex-col gap-1 rounded border border-ink-700 p-2 text-sm"
                          data-testid="history-duplicate-record"
                          data-withdrawn={r.withdrawn ? "true" : "false"}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-meta text-text-muted">{t("recordN", { n: i + 1 })}</span>
                            <span className="font-semibold text-text-primary">
                              {r.hours === null ? t("noHours") : t("hours", { hours: r.hours })}
                            </span>
                            <span className="text-meta text-text-secondary">{r.withdrawn ? t("marked") : t("counted")}</span>
                          </div>
                          {r.text.trim() ? <p className="text-text-secondary">{r.text}</p> : null}
                          <p className="text-meta text-text-muted">
                            {t("source", { file: r.sourceFilename ?? t("noSource"), date: day(r.importedAt) })}
                          </p>
                          <div>
                            {r.withdrawn ? (
                              <HistoryDuplicateDecision recordId={r.id} kind="reinstate" label={t("reinstate")} errorLabels={errorLabels} />
                            ) : g.liveCount > 1 && kept ? (
                              <HistoryDuplicateDecision
                                recordId={r.id}
                                keptRecordId={kept.id}
                                kind="mark"
                                label={t("mark", { n: g.records.findIndex((x) => x.id === kept.id) + 1 })}
                                errorLabels={errorLabels}
                              />
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
