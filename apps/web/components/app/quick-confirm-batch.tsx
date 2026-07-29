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
 * Batch "confirm all of today" (S3.5 + DESIGN_SOUL §3 exceptions pyramid).
 * Confirmation stays a legally meaningful act, so the single confirm sits
 * behind a summary dialog that lists every entry (worker, date, the exact
 * skills) being confirmed — the manager confirms the visible list, never a
 * blind count.
 *
 * The pyramid, BEFORE the click: entries the server flagged as exceptions
 * (a new person's first records, unusual hours, a skill with no verified
 * history) are marked in the list and are NOT confirmed unless the manager
 * explicitly taps the per-entry acknowledge toggle. The server re-checks the
 * same exceptions on write, so the dialog can never be bypassed. Per-entry
 * results are reported after — block reasons are never swallowed.
 */
export function QuickConfirmBatch({
  entries,
  exceptions,
}: {
  entries: QuickConfirmEntryView[];
  /** entry_id → exception slugs from the REAL batch_review_exceptions RPC. */
  exceptions: Record<string, string[]>;
}) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<
    BatchQuickConfirmState | null,
    FormData
  >(batchQuickConfirm, null);

  if (entries.length === 0) return null;

  const payload = JSON.stringify(
    entries.map((e) => ({ entryId: e.id, skillIds: e.skills.map((s) => s.id) })),
  );
  const done = state?.ok === true;
  const exceptedCount = entries.filter((e) => exceptions[e.id]?.length).length;
  const unackedCount = entries.filter(
    (e) => exceptions[e.id]?.length && !acked.has(e.id),
  ).length;
  const toggleAck = (id: string) =>
    setAcked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const nameById = new Map(entries.map((e) => [e.id, e.workerName]));

  return (
    <div className="flex flex-col gap-2" data-testid="quick-batch">
      {done ? (
        <div className="flex flex-col gap-2">
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
          {/* Per-entry results — block reasons named, never swallowed. */}
          {state.failed.length > 0 ? (
            <ul
              className="flex flex-col gap-1"
              data-testid="quick-batch-outcomes"
            >
              {state.outcomes
                .filter((o) => o.outcome !== "approved")
                .map((o) => (
                  <li
                    key={o.entryId}
                    className="rounded-md border border-ink-600 px-3 py-1.5 text-meta leading-relaxed text-text-secondary"
                  >
                    <span className="font-medium text-text-primary">
                      {nameById.get(o.entryId) ?? o.entryId.slice(0, 8)}
                    </span>{" "}
                    —{" "}
                    {o.outcome === "exception_not_acknowledged"
                      ? t("inbox.quick.outcomeNotAcknowledged")
                      : t("inbox.quick.outcomeBlocked", { code: o.outcome })}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
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
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-ink-500 bg-ink-900 p-4 shadow-card md:max-w-lg md:rounded-card md:border">
            <p className="font-display text-base font-semibold text-text-primary">
              {t("inbox.quick.batchSummaryTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {t("inbox.quick.batchSummaryLead")}
            </p>
            <ul className="mt-3 flex flex-col gap-2" data-testid="quick-batch-summary">
              {entries.map((e) => {
                const flags = exceptions[e.id] ?? [];
                const isAcked = acked.has(e.id);
                return (
                  <li
                    key={e.id}
                    className={`rounded-lg border p-2.5 text-sm ${
                      flags.length > 0 && !isAcked
                        ? "border-state-warning/40 bg-state-warning/5"
                        : "border-ink-600"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-text-primary">
                        {e.workerName}
                      </span>
                      <span className="text-meta text-text-muted">
                        {new Date(e.createdAt).toLocaleDateString(locale)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-meta text-text-secondary">
                      {e.skills.length > 0
                        ? `${t("inbox.quick.willConfirm")} ${e.skills
                            .map((s) => s.name)
                            .join(", ")}`
                        : t("inbox.quick.entryOnlyNote")}
                    </p>
                    {flags.length > 0 ? (
                      <div
                        className="mt-2 flex flex-col gap-1.5"
                        data-testid="quick-batch-exception"
                      >
                        <span className="flex flex-wrap gap-1.5">
                          {flags.map((slug) => (
                            <span
                              key={slug}
                              className="inline-flex items-center rounded-full border border-state-warning/40 bg-state-warning/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning"
                            >
                              {t(`inbox.quick.exception.${slug}`)}
                            </span>
                          ))}
                        </span>
                        {/* Explicit per-entry acknowledge — a deliberate tap,
                            never a pre-checked box (no checkboxes here). */}
                        <Button
                          type="button"
                          variant={isAcked ? "secondary" : "ghost"}
                          aria-pressed={isAcked}
                          onClick={() => toggleAck(e.id)}
                          className="min-h-9 w-fit text-xs"
                          data-testid="quick-batch-ack"
                        >
                          {isAcked
                            ? t("inbox.quick.ackDone")
                            : t("inbox.quick.ackButton")}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {exceptedCount > 0 ? (
              <p
                className="mt-3 rounded-md border border-dashed border-state-warning/40 px-3 py-2 text-meta leading-relaxed text-text-secondary"
                data-testid="quick-batch-excluded-note"
              >
                {t("inbox.quick.excludedNote", { count: unackedCount })}
              </p>
            ) : null}
            <form action={action} className="mt-4 flex items-center gap-2">
              <input type="hidden" name="payload" value={payload} />
              <input
                type="hidden"
                name="acknowledged"
                value={JSON.stringify([...acked])}
              />
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="primary"
                disabled={pending}
                className="min-h-12 flex-1"
                data-testid="quick-batch-confirm"
              >
                {t("inbox.quick.batchConfirm", {
                  count: entries.length - unackedCount,
                })}
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
