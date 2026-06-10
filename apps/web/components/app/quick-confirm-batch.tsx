"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import {
  batchQuickConfirm,
  type BatchQuickConfirmState,
} from "@/lib/journal/quick-confirm-actions";
import type { QuickConfirmEntryView } from "./quick-confirm-card";

/**
 * Batch "confirm all of today" (S3.5). Confirmation stays a legally
 * meaningful act, so the single confirm sits behind a summary dialog that
 * lists every entry (worker, date, the exact skills) being confirmed — the
 * manager confirms the visible list, never a blind count. Per-entry block
 * reasons are reported, not swallowed.
 */
export function QuickConfirmBatch({
  entries,
}: {
  entries: QuickConfirmEntryView[];
}) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    BatchQuickConfirmState | null,
    FormData
  >(batchQuickConfirm, null);

  if (entries.length === 0) return null;

  const payload = JSON.stringify(
    entries.map((e) => ({ entryId: e.id, skillIds: e.skills.map((s) => s.id) })),
  );
  const done = state?.ok === true;

  return (
    <div className="flex flex-col gap-2" data-testid="quick-batch">
      {done ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            state.failed.length === 0
              ? "verified-pop border-state-success bg-state-success/10 text-state-success"
              : "border-state-warning bg-state-warning/10 text-state-warning"
          }`}
          role="status"
          data-testid="quick-batch-result"
        >
          {t("inbox.quick.batchDone", {
            confirmed: state.confirmedEntries,
            skills: state.verifiedSkills,
          })}
          {state.failed.length > 0
            ? ` ${t("inbox.quick.batchFailed", { count: state.failed.length })}`
            : null}
        </p>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          disabled={pending}
          className="min-h-12 w-full"
          data-testid="quick-batch-open"
        >
          {t("inbox.quick.batchButton", { count: entries.length })}
        </Button>
      )}

      {open && !done ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("inbox.quick.batchSummaryTitle")}
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
        >
          <button
            type="button"
            aria-label={t("inbox.cancel")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-900/70 backdrop-blur-sm"
          />
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-ink-500 bg-ink-900 p-4 shadow-card md:max-w-lg md:rounded-2xl md:border">
            <p className="font-display text-base font-semibold text-text-primary">
              {t("inbox.quick.batchSummaryTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {t("inbox.quick.batchSummaryLead")}
            </p>
            <ul className="mt-3 flex flex-col gap-2" data-testid="quick-batch-summary">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-ink-600 p-2.5 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-text-primary">
                      {e.workerName}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {new Date(e.createdAt).toLocaleDateString(locale)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-secondary">
                    {e.skills.length > 0
                      ? `${t("inbox.quick.willConfirm")} ${e.skills
                          .map((s) => s.name)
                          .join(", ")}`
                      : t("inbox.quick.entryOnlyNote")}
                  </p>
                </li>
              ))}
            </ul>
            <form action={action} className="mt-4 flex items-center gap-2">
              <input type="hidden" name="payload" value={payload} />
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="primary"
                disabled={pending}
                className="min-h-12 flex-1"
                data-testid="quick-batch-confirm"
              >
                {t("inbox.quick.batchConfirm", { count: entries.length })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {t("inbox.cancel")}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
