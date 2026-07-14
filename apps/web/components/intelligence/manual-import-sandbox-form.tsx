"use client";

import { useActionState } from "react";

import type {
  ObservationPreviewV1,
  SandboxActionState,
  SandboxIssueTalliesV1,
} from "@/lib/intelligence/manual-import-sandbox";
import { INTEL_CHIP_CLASS } from "./badge-styles";

/**
 * Manual Import SANDBOX form + results (client shell). All computation
 * happens server-side in the pure dry-run engine; this component only
 * submits the owner-supplied local file and renders the returned run.
 *
 * Honesty contract:
 *  - the "NO DATA WAS IMPORTED" banner renders on EVERY completed run,
 *    success or failure — there is no code path that hides it;
 *  - failure diagnostics are the deterministic reason codes verbatim
 *    (developer diagnostics) — no stack traces exist to show;
 *  - all labels arrive pre-translated from the server page.
 */

export interface SandboxLabels {
  readonly [key: string]: string;
}

const TALLY_KEYS: readonly (keyof SandboxIssueTalliesV1)[] = [
  "missingFields",
  "unsupportedSchema",
  "unknownCountries",
  "unknownLanguages",
  "salaryFormat",
  "duplicateHashes",
  "sourceNotActive",
  "unknownMetrics",
  "metricPolicy",
  "dateIssues",
  "hashMismatches",
];

const CHIP = INTEL_CHIP_CLASS;

function PreviewCard({
  preview,
  labels,
}: {
  preview: ObservationPreviewV1;
  labels: SandboxLabels;
}) {
  const unknown = labels["value.unknown"];
  const rows: readonly (readonly [string, string])[] = [
    [labels["preview.hash"], preview.contentHash],
    [labels["preview.source"], preview.sourceKey ?? unknown],
    [labels["preview.timestamp"], preview.capturedAtIso ?? unknown],
    [labels["preview.country"], preview.country ?? unknown],
    [labels["preview.language"], preview.language ?? unknown],
    [
      labels["preview.salaryBasis"],
      preview.salaryBasis === null
        ? labels["preview.notSalaryMetric"]
        : labels[`salaryBasis.${preview.salaryBasis}`],
    ],
    [labels["preview.confidence"], labels[`confidence.${preview.confidence}`]],
    [labels["preview.provenance"], preview.provenanceRef],
  ];
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
      data-testid="sandbox-observation-preview"
      data-valid={preview.valid}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels["preview.row"]} {preview.rowNumber}
        </span>
        <span
          className={`${CHIP} ${
            preview.valid
              ? "border-state-success/40 bg-state-success/10 text-state-success"
              : "border-state-danger/40 bg-state-danger/10 text-state-danger"
          }`}
        >
          {preview.valid ? labels["preview.valid"] : labels["preview.invalid"]}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-text-secondary sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col">
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {label}
            </dt>
            <dd className="break-all font-mono text-[11px]">{value}</dd>
          </div>
        ))}
      </dl>
      {preview.failureCodes.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels["preview.reasonCodes"]}
          </span>
          <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-state-danger">
            {preview.failureCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function ManualImportSandboxForm({
  action,
  labels,
}: {
  action: (
    state: SandboxActionState,
    formData: FormData,
  ) => Promise<SandboxActionState>;
  labels: SandboxLabels;
}) {
  const [state, formAction, pending] = useActionState<
    SandboxActionState,
    FormData
  >(action, { kind: "idle" });

  const run = state.kind === "ran" ? state.run : null;

  return (
    <div className="flex flex-col gap-4" data-testid="sandbox-workspace">
      {/* ── The ONE explicit validation-session form ─────────────────── */}
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4"
        data-testid="sandbox-form"
      >
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels["form.file"]}
          </span>
          <input
            type="file"
            name="file"
            required
            accept=".csv,.json,.ndjson,.jsonl,text/csv,application/json"
            className="text-xs text-text-primary file:mr-3 file:rounded-md file:border file:border-ink-500 file:bg-ink-800/60 file:px-3 file:py-1.5 file:text-xs file:text-text-primary"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {labels["form.format"]}
            </span>
            <select
              name="format"
              className="rounded-md border border-ink-500 bg-ink-800/60 px-2 py-1.5 text-xs text-text-primary"
              defaultValue="csv"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="ndjson">NDJSON</option>
            </select>
          </label>
          <fieldset className="flex flex-col gap-1 text-xs text-text-secondary">
            <legend className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {labels["form.mode"]}
            </legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" value="preview" defaultChecked />
              {labels["form.modePreview"]}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" value="validate_only" />
              {labels["form.modeValidateOnly"]}
            </label>
          </fieldset>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md border border-brand-blue/50 bg-brand-blue/10 px-4 py-2 text-xs font-medium text-brand-blue hover:bg-brand-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
          data-testid="sandbox-run-button"
        >
          {pending ? labels["form.running"] : labels["form.run"]}
        </button>
        <p className="text-[11px] text-text-muted">{labels["form.note"]}</p>
      </form>

      {state.kind === "refused" ? (
        <p
          role="alert"
          className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 font-mono text-xs text-state-danger"
          data-testid="sandbox-refused"
        >
          {labels["refused.title"]}: {state.reasonCode}
        </p>
      ) : null}

      {run ? (
        <div role="status" className="flex flex-col gap-4" data-testid="sandbox-results">
          {/* ── The unconditional no-import banner ───────────────────── */}
          <p
            className="rounded-md border border-state-amber/50 bg-state-amber/10 px-4 py-3 text-center font-mono text-sm font-bold uppercase tracking-label text-state-amber"
            data-testid="sandbox-no-data-imported"
          >
            {labels["noDataImported"]}
          </p>

          {!run.parse.ok ? (
            <p
              className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 font-mono text-xs text-state-danger"
              data-testid="sandbox-parse-failure"
            >
              {labels["parse.failed"]}: {run.parse.reasonCode}
              {run.parse.rowNumber !== null
                ? ` (${labels["parse.row"]} ${run.parse.rowNumber})`
                : ""}
            </p>
          ) : (
            <>
              {/* ── Validation preview counts ─────────────────────────── */}
              <dl
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                data-testid="sandbox-counts"
              >
                {(
                  [
                    ["counts.detected", run.rowsDetected],
                    ["counts.valid", run.validRows],
                    ["counts.invalid", run.invalidRows],
                    ["counts.validAfterActivation", run.validAfterActivation],
                  ] as const
                ).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex flex-col rounded-md border border-ink-500 bg-ink-800/30 p-3"
                  >
                    <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {labels[key]}
                    </dt>
                    <dd className="text-lg font-semibold text-text-primary">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div
                className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-800/30 p-3"
                data-testid="sandbox-tallies"
              >
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {labels["tallies.title"]}
                </span>
                <ul className="grid grid-cols-1 gap-1 text-xs text-text-secondary sm:grid-cols-3">
                  {TALLY_KEYS.map((key) => (
                    <li key={key} className="flex justify-between gap-2">
                      <span>{labels[`tallies.${key}`]}</span>
                      <span className="font-mono text-text-primary">
                        {run.tallies[key]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {run.previews.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
                    {labels["preview.title"]}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {run.previews.map((preview) => (
                      <PreviewCard
                        key={preview.rowNumber}
                        preview={preview}
                        labels={labels}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {run.sessionPreview && run.reportPreview ? (
                <section
                  className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
                  data-testid="sandbox-report-preview"
                >
                  <h3 className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
                    {labels["report.title"]}
                  </h3>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-text-secondary sm:grid-cols-2">
                    {(
                      [
                        ["report.status", labels[`report.finalStatus.${run.reportPreview.finalStatus}`]],
                        ["report.duplicates", String(run.reportPreview.duplicates)],
                        ["report.errors", String(run.reportPreview.errorCount)],
                        ["report.warnings", run.reportPreview.warningCodes.join(", ") || labels["value.none"]],
                        ["report.privacy", run.reportPreview.privacyIssueCodes.join(", ") || labels["value.none"]],
                        ["report.rollbackRef", `${run.reportPreview.rollbackRef} (${labels["report.simulated"]})`],
                      ] as const
                    ).map(([key, value]) => (
                      <div key={key} className="flex min-w-0 flex-col">
                        <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                          {labels[key]}
                        </dt>
                        <dd className="break-all font-mono text-[11px]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {run.reportPreview.skipped.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {labels["report.skipped"]}
                      </span>
                      <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-text-secondary">
                        {run.reportPreview.skipped.map((entry) => (
                          <li key={entry.code}>
                            {entry.code} × {entry.count}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
