"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  confirmTimesheetImportAction,
  previewTimesheetImportAction,
  type TimesheetConfirmActionState,
  type TimesheetPreviewActionState,
} from "@/lib/timesheet-import/import-confirm-actions";
import type { TimesheetImportPreview } from "@/lib/timesheet-import/import-preview";
import type {
  HoursPageObject,
  HoursPageWorker,
} from "@/lib/work-hours/hours-page-data";

/**
 * TIMESHEET IMPORT REVIEW — upload, interpretation preview, human correction,
 * explicit confirm.
 *
 * The center of gravity is the CORRECTION TABLE. The parser and resolver
 * never guess: a worker that matched two people arrives with an empty select
 * and its candidates listed first; an ambiguous split cell arrives flagged
 * for review; a sheet that never states its month arrives with the month
 * input empty and required. Nothing reaches the database until the operator
 * presses Confirm, and duplicates need a second, explicit override on top.
 *
 * Two server actions, mirroring the quick-entry pattern beside this file:
 * preview (reads only) and confirm (one atomic bulk write).
 */

const PREVIEW_INITIAL: TimesheetPreviewActionState = { status: "idle" };
const CONFIRM_INITIAL: TimesheetConfirmActionState = { status: "idle" };

type EditableRow = {
  readonly key: number;
  include: boolean;
  workerId: string;
  workObjectId: string;
  date: string;
  hours: string;
  note: string;
  readonly workerLabel: string;
  readonly objectLabel: string | null;
  readonly dayOfMonth: number | null;
  readonly sheetDate: string | null;
  readonly workerCandidates: readonly { id: string; name: string }[];
  readonly objectCandidates: readonly { id: string; name: string }[];
  readonly needsReview: boolean;
  readonly duplicate: boolean;
  readonly sourceCell: string;
};

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function rowsFromPreview(preview: TimesheetImportPreview): EditableRow[] {
  return preview.rows.map((row) => ({
    key: row.index,
    include: true,
    workerId: row.worker.kind === "resolved" ? row.worker.id : "",
    workObjectId:
      row.object !== null && row.object.kind === "resolved" ? row.object.id : "",
    date: row.workDate ?? "",
    hours: String(row.hours),
    note: row.note ?? "",
    workerLabel: row.workerLabel,
    objectLabel: row.objectLabel,
    dayOfMonth: row.dayOfMonth,
    sheetDate: row.workDate,
    workerCandidates:
      row.worker.kind === "ambiguous" ? row.worker.candidates : [],
    objectCandidates:
      row.object !== null && row.object.kind === "ambiguous"
        ? row.object.candidates
        : [],
    needsReview: row.confidence === "low",
    duplicate: row.duplicate,
    sourceCell: row.sourceCell,
  }));
}

export function TimesheetImportReview({
  workers,
  objects,
}: {
  workers: readonly HoursPageWorker[];
  objects: readonly HoursPageObject[];
}) {
  const t = useTranslations("workHours.import");
  const router = useRouter();

  const [previewState, previewAction, previewPending] = useActionState(
    previewTimesheetImportAction,
    PREVIEW_INITIAL,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmTimesheetImportAction,
    CONFIRM_INITIAL,
  );

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [month, setMonth] = useState("");
  const [overrideDuplicates, setOverrideDuplicates] = useState(false);
  /** key order of the last confirmed payload, so server row indexes map back. */
  const submittedKeys = useRef<readonly number[]>([]);

  const preview =
    previewState.status === "preview" ? previewState.preview : null;

  useEffect(() => {
    if (preview === null) return;
    setRows(rowsFromPreview(preview));
    setMonth(
      preview.month !== null
        ? `${preview.month.year}-${pad2(preview.month.month)}`
        : "",
    );
    setOverrideDuplicates(false);
  }, [preview]);

  useEffect(() => {
    if (confirmState.status !== "written") return;
    router.refresh();
  }, [confirmState, router]);

  const monthNeeded = preview !== null && preview.month === null;

  const effectiveDate = (row: EditableRow): string => {
    if (row.date !== "") return row.date;
    if (month !== "" && row.dayOfMonth !== null) {
      return `${month}-${pad2(row.dayOfMonth)}`;
    }
    return "";
  };

  const included = rows.filter((row) => row.include);
  const readyRows = included.filter(
    (row) =>
      row.workerId !== "" &&
      row.workObjectId !== "" &&
      DATE_RX.test(effectiveDate(row)) &&
      row.hours.trim() !== "",
  );
  const canConfirm =
    included.length > 0 && readyRows.length === included.length && !confirmPending;

  const serverProblemsByKey = useMemo(() => {
    const map = new Map<number, string>();
    if (confirmState.status === "invalid-rows") {
      for (const p of confirmState.problems) {
        const key = submittedKeys.current[p.index];
        if (key !== undefined) map.set(key, p.field);
      }
    }
    if (confirmState.status === "duplicates") {
      for (const index of confirmState.indexes) {
        const key = submittedKeys.current[index];
        if (key !== undefined) map.set(key, "duplicate");
      }
    }
    return map;
  }, [confirmState]);

  const duplicateCount =
    rows.filter((r) => r.include && r.duplicate).length +
    (confirmState.status === "duplicates" ? confirmState.indexes.length : 0);

  const patch = (key: number, change: Partial<EditableRow>): void => {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  };

  const confirmPayload = (): string => {
    submittedKeys.current = included.map((row) => row.key);
    return JSON.stringify(
      included.map((row) => ({
        workerId: row.workerId,
        workObjectId: row.workObjectId,
        workDate: effectiveDate(row),
        hours: row.hours.trim(),
        note: row.note.trim() === "" ? null : row.note.trim(),
      })),
    );
  };

  const previewError = (): string | null => {
    if (previewState.status === "refused") {
      return t(`refused.${previewState.reasonCode}`);
    }
    if (previewState.status === "empty") return t("emptyFile");
    if (previewState.status === "no-company") return t("noCompany");
    if (previewState.status === "error") return t("errors.generic");
    return null;
  };

  const confirmMessage = (): { tone: "error" | "warn"; text: string } | null => {
    switch (confirmState.status) {
      case "invalid-rows":
        return {
          tone: "error",
          text: t("errors.invalidRows", { count: confirmState.problems.length }),
        };
      case "duplicates":
        return {
          tone: "warn",
          text: t("errors.duplicatesFound", { count: confirmState.indexes.length }),
        };
      case "no-rows":
        return { tone: "error", text: t("errors.noRows") };
      case "too-many-rows":
        return { tone: "error", text: t("errors.tooManyRows") };
      case "needs-migration":
        return { tone: "error", text: t("errors.needsMigration") };
      case "not-authorized":
        return { tone: "error", text: t("errors.notAuthorized") };
      case "error":
        return { tone: "error", text: t("errors.generic") };
      default:
        return null;
    }
  };
  const confirmMsg = confirmMessage();

  return (
    <section className="flex w-full flex-col gap-5" data-testid="timesheet-import">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      <form action={previewAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("fileLabel")}</span>
          <input
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="min-h-12 rounded-md border border-border-subtle bg-surface-1 p-2 text-sm"
            data-testid="timesheet-import-file"
          />
          <span className="text-xs text-text-secondary">{t("fileHint")}</span>
        </label>
        <button
          type="submit"
          disabled={previewPending}
          className="min-h-12 self-start rounded-md border border-border-subtle px-4 text-base font-semibold disabled:opacity-60"
          data-testid="timesheet-import-preview"
        >
          {previewPending ? t("parsing") : t("parse")}
        </button>
      </form>

      {previewError() !== null ? (
        <p
          className="text-sm text-state-danger"
          role="alert"
          data-testid="timesheet-import-refused"
        >
          {previewError()}
        </p>
      ) : null}

      {confirmState.status === "written" ? (
        <p
          className="rounded-md border border-state-success/50 p-3 text-sm text-state-success"
          role="status"
          data-testid="timesheet-import-receipt"
        >
          {t("receipt", { count: confirmState.written })}
        </p>
      ) : preview !== null ? (
        <div className="flex flex-col gap-4" data-testid="timesheet-import-table">
          <p className="text-sm text-text-secondary" data-testid="timesheet-import-summary">
            {t("summary", {
              rows: preview.rows.length,
              sheet: preview.sheetName,
            })}{" "}
            {t("notPersistedNotice")}
          </p>

          {preview.skipped.length > 0 ? (
            <div
              className="rounded-md border border-dashed border-state-warning/50 px-3 py-2 text-sm"
              data-testid="timesheet-import-skipped"
            >
              <p className="font-medium">{t("skippedTitle")}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text-secondary">
                {preview.skipped.map((cell) => (
                  <li key={cell.sourceCell}>
                    {cell.sourceCell} · {t(`skippedReasons.${cell.reason}`)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {monthNeeded ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("monthLabel")}</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
                className="min-h-12 max-w-56 rounded-md border border-border-subtle bg-surface-1 px-3 text-base"
                data-testid="timesheet-import-month"
              />
              <span className="text-xs text-text-secondary">{t("monthHint")}</span>
            </label>
          ) : null}

          {duplicateCount > 0 ? (
            <p
              className="rounded-md border border-dashed border-state-warning/50 px-3 py-2 text-sm"
              role="status"
              data-testid="timesheet-import-duplicates"
            >
              {t("duplicateWarning", { count: duplicateCount })}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
                  <th className="px-2 py-2">{t("columns.include")}</th>
                  <th className="px-2 py-2">{t("columns.worker")}</th>
                  <th className="px-2 py-2">{t("columns.object")}</th>
                  <th className="px-2 py-2">{t("columns.date")}</th>
                  <th className="px-2 py-2">{t("columns.hours")}</th>
                  <th className="px-2 py-2">{t("columns.note")}</th>
                  <th className="px-2 py-2">{t("columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const problem = serverProblemsByKey.get(row.key);
                  const needsAttention =
                    row.include &&
                    (row.workerId === "" ||
                      row.workObjectId === "" ||
                      !DATE_RX.test(effectiveDate(row)));
                  return (
                    <tr
                      key={row.key}
                      className="border-b border-border-subtle align-top"
                      data-testid="timesheet-import-row"
                    >
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) => patch(row.key, { include: e.target.checked })}
                          aria-label={t("columns.include")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-text-secondary">
                            {row.workerLabel}
                          </span>
                          <select
                            value={row.workerId}
                            onChange={(e) => patch(row.key, { workerId: e.target.value })}
                            className="min-h-10 rounded-md border border-border-subtle bg-surface-1 px-2"
                            data-testid="timesheet-import-worker"
                          >
                            <option value="">{t("chooseWorker")}</option>
                            {row.workerCandidates.length > 0 ? (
                              <optgroup label={t("suggestions")}>
                                {row.workerCandidates.map((c) => (
                                  <option key={`c-${c.id}`} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            <optgroup label={t("allWorkers")}>
                              {workers.map((w) => (
                                <option key={w.workerId} value={w.workerId}>
                                  {w.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1">
                          {row.objectLabel !== null ? (
                            <span className="text-xs text-text-secondary">
                              {row.objectLabel}
                            </span>
                          ) : null}
                          <select
                            value={row.workObjectId}
                            onChange={(e) =>
                              patch(row.key, { workObjectId: e.target.value })
                            }
                            className="min-h-10 rounded-md border border-border-subtle bg-surface-1 px-2"
                            data-testid="timesheet-import-object"
                          >
                            <option value="">{t("chooseObject")}</option>
                            {row.objectCandidates.length > 0 ? (
                              <optgroup label={t("suggestions")}>
                                {row.objectCandidates.map((c) => (
                                  <option key={`c-${c.id}`} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            <optgroup label={t("allObjects")}>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={effectiveDate(row)}
                          onChange={(e) => patch(row.key, { date: e.target.value })}
                          className="min-h-10 rounded-md border border-border-subtle bg-surface-1 px-2"
                          data-testid="timesheet-import-date"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.hours}
                          onChange={(e) => patch(row.key, { hours: e.target.value })}
                          inputMode="decimal"
                          className="min-h-10 w-20 rounded-md border border-border-subtle bg-surface-1 px-2"
                          data-testid="timesheet-import-hours"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.note}
                          onChange={(e) => patch(row.key, { note: e.target.value })}
                          className="min-h-10 w-32 rounded-md border border-border-subtle bg-surface-1 px-2"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1 text-xs">
                          {row.needsReview ? (
                            <span
                              className="text-state-warning"
                              data-testid="timesheet-import-needs-review"
                            >
                              {t("needsReview")}
                            </span>
                          ) : null}
                          {row.duplicate || problem === "duplicate" ? (
                            <span className="text-state-warning">
                              {t("duplicateBadge")}
                            </span>
                          ) : null}
                          {problem !== undefined && problem !== "duplicate" ? (
                            <span className="text-state-danger">
                              {t(`rowProblems.${problem}`)}
                            </span>
                          ) : null}
                          {needsAttention && problem === undefined ? (
                            <span className="text-state-warning">
                              {t("incomplete")}
                            </span>
                          ) : null}
                          <span className="text-text-secondary">{row.sourceCell}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {confirmMsg !== null ? (
            <p
              className={
                confirmMsg.tone === "error"
                  ? "text-sm text-state-danger"
                  : "rounded-md border border-dashed border-state-warning/50 px-3 py-2 text-sm"
              }
              role={confirmMsg.tone === "error" ? "alert" : "status"}
              data-testid="timesheet-import-confirm-message"
            >
              {confirmMsg.text}
            </p>
          ) : null}

          <form action={confirmAction} className="flex flex-col gap-3">
            <input type="hidden" name="rows" value={confirmPayload()} />
            {duplicateCount > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overrideDuplicates}
                  onChange={(e) => setOverrideDuplicates(e.target.checked)}
                  data-testid="timesheet-import-override"
                />
                {t("overrideLabel")}
              </label>
            ) : null}
            {overrideDuplicates ? (
              <input type="hidden" name="override_duplicates" value="1" />
            ) : null}
            <button
              type="submit"
              disabled={!canConfirm}
              className="min-h-12 self-start rounded-md bg-accent px-4 text-base font-semibold text-white disabled:opacity-60"
              data-testid="timesheet-import-confirm"
            >
              {confirmPending
                ? t("confirming")
                : t("confirm", { count: included.length })}
            </button>
            {!canConfirm && included.length > 0 && !confirmPending ? (
              <span className="text-xs text-text-secondary">
                {t("confirmBlockedHint")}
              </span>
            ) : null}
          </form>
        </div>
      ) : null}
    </section>
  );
}
