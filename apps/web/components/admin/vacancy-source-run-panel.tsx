"use client";

/**
 * VACANCY SOURCE RUN PANEL — the operator's two buttons and one honest
 * result readout.
 *
 * A dry run is always offered (it writes nothing anywhere — as safe as
 * reading). The import button is rendered DISABLED while the runtime switch
 * is closed, with the reason next to it — an operator must see that the
 * lever exists and that it is the owner's, not be shown a button that
 * silently fails. Pressing it when enabled still cannot bypass governance:
 * the runner refuses and this panel renders that refusal verbatim.
 *
 * The result readout prints the importer's exact-sum counters, never a
 * summary invented here — the whole point of the accounting chain is that
 * the number the operator reads IS the number the pipeline measured.
 */
import { useState, useTransition } from "react";
import {
  runVacancyDryRunAction,
  runVacancyPersistAction,
  type VacancyRunActionResult,
} from "@/lib/vacancy-runner/vacancy-admin-actions";

interface RunPanelSource {
  readonly providerKey: string;
  readonly channels: readonly string[];
  readonly operational: boolean;
}

/** Labels come from the SERVER page as props — this client component ships no
 *  message namespace of its own (the client-messages allowlist stays closed,
 *  and the admin tree adds nothing to every dashboard user's payload). */
export interface VacancyRunPanelLabels {
  readonly runTitle: string;
  readonly runDry: string;
  readonly runImport: string;
  readonly importDisabledReason: string;
  readonly running: string;
  readonly resultTitle: string;
  readonly refused: string;
  readonly statusLabel: string;
  readonly mSeen: string;
  readonly mAccepted: string;
  readonly mRejected: string;
  readonly mDuplicate: string;
  readonly mWaiting: string;
  readonly mInserted: string;
  readonly mUpdated: string;
  readonly mUnchanged: string;
  readonly errorsLabel: string;
}

export function VacancySourceRunPanel({
  sources,
  labels,
}: {
  readonly sources: readonly RunPanelSource[];
  readonly labels: VacancyRunPanelLabels;
}) {
  const t = (key: keyof VacancyRunPanelLabels) => labels[key];
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<VacancyRunActionResult | null>(null);
  const [ranLabel, setRanLabel] = useState<string>("");

  const run = (
    providerKey: string,
    channel: string,
    mode: "dry_run" | "persist",
  ) => {
    startTransition(async () => {
      setRanLabel(`${providerKey} · ${channel} · ${mode}`);
      const action =
        mode === "dry_run" ? runVacancyDryRunAction : runVacancyPersistAction;
      setResult(await action(providerKey, channel));
    });
  };

  return (
    <div className="space-y-4 rounded-md border border-ink-500 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
        {t("runTitle")}
      </h2>

      {sources.map((source) => (
        <div
          key={source.providerKey}
          className="flex flex-wrap items-center gap-2"
          data-testid={`vacancy-run-${source.providerKey}`}
        >
          <span className="min-w-40 text-sm font-medium">
            {source.providerKey}
          </span>
          {source.channels.map((channel) => (
            <span key={channel} className="flex items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(source.providerKey, channel, "dry_run")}
                className="rounded border border-ink-500 px-3 py-1.5 text-xs hover:bg-ink-700 disabled:opacity-50"
              >
                {t("runDry")} · {channel}
              </button>
              <button
                type="button"
                disabled={pending || !source.operational}
                title={
                  source.operational ? undefined : t("importDisabledReason")
                }
                onClick={() => run(source.providerKey, channel, "persist")}
                className="rounded border border-brand-blue/50 px-3 py-1.5 text-xs text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40"
              >
                {t("runImport")} · {channel}
              </button>
            </span>
          ))}
        </div>
      ))}

      {pending ? (
        <p className="text-sm text-text-muted">{t("running")}</p>
      ) : null}

      {result ? (
        <div
          className="space-y-2 rounded border border-ink-500/60 bg-ink-800/40 p-3 text-sm"
          data-testid="vacancy-run-result"
        >
          <p className="font-medium">
            {t("resultTitle")}: {ranLabel}
          </p>
          {result.kind === "refused" ? (
            <p className="text-status-warning">
              {t("refused")}: {result.reason}
            </p>
          ) : (
            <>
              <p>
                {t("statusLabel")}:{" "}
                <span className="font-medium">{result.session.status}</span>
                {result.session.blockedReason
                  ? ` (${result.session.blockedReason})`
                  : null}
              </p>
              {result.session.metrics ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 tabular-nums sm:grid-cols-4">
                  <Metric
                    label={t("mSeen")}
                    value={result.session.metrics.itemsSeen}
                  />
                  <Metric
                    label={t("mAccepted")}
                    value={result.session.metrics.itemsAccepted}
                  />
                  <Metric
                    label={t("mRejected")}
                    value={
                      result.session.metrics.itemsRejectedByParser +
                      result.session.metrics.itemsRejectedByValidation
                    }
                  />
                  <Metric
                    label={t("mDuplicate")}
                    value={result.session.metrics.itemsDuplicate}
                  />
                  <Metric
                    label={t("mWaiting")}
                    value={result.session.metrics.validAfterActivation}
                  />
                  <Metric
                    label={t("mInserted")}
                    value={result.session.persisted.inserted}
                  />
                  <Metric
                    label={t("mUpdated")}
                    value={result.session.persisted.updated}
                  />
                  <Metric
                    label={t("mUnchanged")}
                    value={result.session.persisted.unchanged}
                  />
                </dl>
              ) : null}
              {result.session.errors.length > 0 ? (
                <p className="text-status-warning">
                  {t("errorsLabel")}: {result.session.errors.join(", ")}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
