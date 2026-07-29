"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DarkListbox } from "@/components/ui/DarkListbox";
import { createJournalEntry } from "@/lib/journal/actions";
import {
  SPREADSHEET_MAX_ROWS,
  SPREADSHEET_UNIT_OPTIONS,
  buildSpreadsheetRowPayload,
  emptySpreadsheetRow,
  spreadsheetRowIsEmpty,
  validateSpreadsheetRow,
  type SpreadsheetRowDraft,
  type SpreadsheetRowError,
  type SpreadsheetUnitSlug,
} from "@/lib/journal/spreadsheet-entry-model";
import { recordEvent } from "@/lib/telemetry/task";
import { cn } from "@/lib/utils";
import type { JournalEngagement } from "@/components/app/journal-entry-composer";

/**
 * Spreadsheet entry mode (Journal Proof Engine v1, §1) — fast MULTI-ROW bulk
 * entry over the ONE journal write path: every grid row becomes exactly one
 * `createJournalEntry` call (same create_journal_entry_full RPC as every
 * other mode). No batch RPC, no second journal system.
 *
 * Honesty: rows save independently — failed rows stay editable with the
 * precise server reason; saved rows lock with a visible ✓; the summary
 * reports real counts, never "all done" while a row failed. Empty rows are
 * skipped silently. Max 15 rows per batch (bulk entry, not bulk import).
 *
 * Mobile: the header row disappears and each row renders as a stacked card
 * with per-field labels (grid → cards, same fields, same save path).
 */

type RowStatus = "idle" | "saving" | "saved" | "error";

interface RowState {
  draft: SpreadsheetRowDraft;
  status: RowStatus;
  errors: SpreadsheetRowError[];
  serverMessage: string | null;
}

const INITIAL_ROWS = 3;

export function JournalSpreadsheetEntry({
  engagements,
}: {
  engagements: JournalEngagement[];
}) {
  const t = useTranslations("journal.spreadsheet");
  const tUnit = useTranslations("productivityUnits");
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const primaryId =
    engagements.find((e) => e.isPrimary)?.id ?? engagements[0]?.id ?? "";

  const newRow = (): RowState => ({
    draft: emptySpreadsheetRow(today, primaryId),
    status: "idle",
    errors: [],
    serverMessage: null,
  });

  const [rows, setRows] = useState<RowState[]>(() =>
    Array.from({ length: INITIAL_ROWS }, newRow),
  );
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<{
    saved: number;
    failed: number;
  } | null>(null);

  function patchRow(idx: number, patch: Partial<SpreadsheetRowDraft>) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx && r.status !== "saved" && r.status !== "saving"
          ? { ...r, draft: { ...r.draft, ...patch }, errors: [], serverMessage: null, status: "idle" }
          : r,
      ),
    );
  }

  function addRow() {
    setRows((prev) =>
      prev.length >= SPREADSHEET_MAX_ROWS ? prev : [...prev, newRow()],
    );
  }

  function removeRow(idx: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function saveAll() {
    if (saving) return;
    setSummary(null);
    // 1. Validate every non-empty, not-yet-saved row first — invalid rows are
    //    marked and the batch still saves the valid ones (partial progress is
    //    honest progress; nothing is silently skipped except truly empty rows).
    const validated = rows.map((r) => {
      if (r.status === "saved" || spreadsheetRowIsEmpty(r.draft)) return r;
      const errors = validateSpreadsheetRow(r.draft);
      return { ...r, errors, status: errors.length > 0 ? ("error" as const) : ("idle" as const) };
    });
    setRows(validated);
    const savable = validated
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          r.status === "idle" &&
          !spreadsheetRowIsEmpty(r.draft) &&
          r.errors.length === 0,
      );
    if (savable.length === 0) {
      setSummary({
        saved: 0,
        failed: validated.filter((r) => r.status === "error").length,
      });
      return;
    }
    setSaving(true);
    recordEvent("journal_spreadsheet_save_started", { rows: savable.length });
    let saved = 0;
    let failed = validated.filter((r) => r.status === "error").length;
    // Sequential on purpose: the entry hash chains on the worker's previous
    // entry (hash_prev), so parallel saves would race the chain.
    for (const { i } of savable) {
      setRows((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "saving" } : r)),
      );
      let outcome: RowState["status"] = "error";
      let message: string | null = null;
      try {
        const payload = buildSpreadsheetRowPayload(validated[i].draft);
        const fd = new FormData();
        fd.set("locale", locale);
        for (const [k, v] of Object.entries(payload)) fd.set(k, v);
        const result = await createJournalEntry(fd);
        if (result.ok) {
          outcome = "saved";
          saved += 1;
        } else {
          message = result.message;
          failed += 1;
        }
      } catch (e) {
        console.error("[journal-spreadsheet] row save failed:", e);
        message = t("rowUnexpectedError");
        failed += 1;
      }
      setRows((prev) =>
        prev.map((r, idx) =>
          idx === i ? { ...r, status: outcome, serverMessage: message } : r,
        ),
      );
    }
    setSaving(false);
    setSummary({ saved, failed });
    recordEvent("journal_spreadsheet_save_finished", { saved, failed });
  }

  const errorLabel = (code: SpreadsheetRowError): string => t(`errors.${code}`);

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="journal-spreadsheet-entry"
    >
      <p className="text-meta leading-relaxed text-text-muted">{t("hint")}</p>

      {/* Header row — desktop only; mobile rows carry their own labels. */}
      <div className="hidden gap-2 px-1 font-mono text-meta uppercase tracking-label text-text-muted md:grid md:grid-cols-[6.5rem_minmax(10rem,2fr)_4.5rem_6.5rem_4.5rem_minmax(8rem,1.2fr)_minmax(8rem,1fr)_2rem]">
        <span>{t("colDate")}</span>
        <span>{t("colText")}</span>
        <span>{t("colQuantity")}</span>
        <span>{t("colUnit")}</span>
        <span>{t("colHours")}</span>
        <span>{t("colEngagement")}</span>
        <span>{t("colNote")}</span>
        <span aria-hidden />
      </div>

      <ul className="flex flex-col gap-3 md:gap-1.5">
        {rows.map((row, idx) => {
          const locked = row.status === "saved" || row.status === "saving";
          return (
            <li
              key={idx}
              data-testid={`journal-spreadsheet-row-${idx}`}
              className={cn(
                "flex flex-col gap-2 rounded-md border p-3 md:grid md:grid-cols-[6.5rem_minmax(10rem,2fr)_4.5rem_6.5rem_4.5rem_minmax(8rem,1.2fr)_minmax(8rem,1fr)_2rem] md:items-center md:gap-2 md:border-transparent md:p-1",
                row.status === "saved"
                  ? "border-state-success/40 bg-state-success/5"
                  : row.status === "error"
                    ? "border-state-danger/40 bg-state-danger/5 md:border-state-danger/40"
                    : "border-ink-600 bg-ink-800/40 md:bg-transparent",
              )}
            >
              <label className="flex flex-col gap-1">
                <span className="text-meta uppercase tracking-label text-text-muted md:hidden">
                  {t("colDate")}
                </span>
                <Input
                  type="date"
                  value={row.draft.workDate}
                  disabled={locked}
                  onChange={(e) => patchRow(idx, { workDate: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-meta uppercase tracking-label text-text-muted md:hidden">
                  {t("colText")}
                </span>
                <Input
                  type="text"
                  value={row.draft.text}
                  disabled={locked}
                  placeholder={t("textPlaceholder")}
                  maxLength={500}
                  onChange={(e) => patchRow(idx, { text: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-meta uppercase tracking-label text-text-muted md:hidden">
                  {t("colQuantity")}
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={row.draft.quantity}
                  disabled={locked}
                  onChange={(e) => patchRow(idx, { quantity: e.target.value })}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-meta uppercase tracking-label text-text-muted md:hidden">
                  {t("colUnit")}
                </span>
                <DarkListbox
                  value={row.draft.unitSlug}
                  onChange={(v) =>
                    patchRow(idx, { unitSlug: v as SpreadsheetUnitSlug })
                  }
                  options={SPREADSHEET_UNIT_OPTIONS.map((u) => ({
                    value: u,
                    label: tUnit(u),
                  }))}
                  ariaLabel={t("colUnit")}
                />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-meta uppercase tracking-label text-text-muted md:hidden">
                  {t("colHours")}
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={row.draft.hours}
                  disabled={locked}
                  onChange={(e) => patchRow(idx, { hours: e.target.value })}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-meta uppercase tracking-label text-text-muted md:hidden">
                  {t("colEngagement")}
                </span>
                <DarkListbox
                  value={row.draft.engagementId}
                  onChange={(v) => patchRow(idx, { engagementId: v })}
                  options={engagements.map((e) => ({
                    value: e.id,
                    label: e.label,
                  }))}
                  ariaLabel={t("colEngagement")}
                />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-meta uppercase tracking-label text-text-muted md:hidden">
                  {t("colNote")}
                </span>
                <Input
                  type="text"
                  value={row.draft.note}
                  disabled={locked}
                  maxLength={300}
                  onChange={(e) => patchRow(idx, { note: e.target.value })}
                />
              </label>
              <div className="flex items-center justify-end md:justify-center">
                {row.status === "saved" ? (
                  <span
                    className="text-xs font-semibold text-state-success"
                    data-testid={`journal-spreadsheet-row-saved-${idx}`}
                  >
                    ✓
                  </span>
                ) : row.status === "saving" ? (
                  <span className="text-meta text-text-muted" role="status">
                    …
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={rows.length <= 1 || saving}
                    aria-label={t("removeRow")}
                    className="rounded-md border border-ink-500 px-2 py-1 text-xs text-text-secondary transition-colors hover:border-state-danger hover:text-state-danger disabled:opacity-40"
                  >
                    ×
                  </button>
                )}
              </div>
              {(row.errors.length > 0 || row.serverMessage) && (
                <p
                  className="text-meta leading-relaxed text-state-danger md:col-span-8"
                  role="alert"
                  data-testid={`journal-spreadsheet-row-error-${idx}`}
                >
                  {row.serverMessage ??
                    row.errors.map((c) => errorLabel(c)).join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {summary && (
        <p
          role="status"
          data-testid="journal-spreadsheet-summary"
          className={cn(
            "rounded-md border px-3 py-2 text-xs leading-relaxed",
            summary.failed > 0
              ? "border-state-warning/40 bg-state-warning/5 text-text-secondary"
              : "border-state-success/40 bg-state-success/5 text-state-success",
          )}
        >
          {t("savedSummary", { saved: summary.saved, failed: summary.failed })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void saveAll()}
          disabled={saving}
          data-testid="journal-spreadsheet-save"
        >
          {saving ? t("saving") : t("saveAll")}
        </Button>
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= SPREADSHEET_MAX_ROWS || saving}
          data-testid="journal-spreadsheet-add-row"
          className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
        >
          + {t("addRow")}
        </button>
        <span className="text-meta text-text-muted">
          {t("rowCount", { count: rows.length, max: SPREADSHEET_MAX_ROWS })}
        </span>
      </div>
    </div>
  );
}
