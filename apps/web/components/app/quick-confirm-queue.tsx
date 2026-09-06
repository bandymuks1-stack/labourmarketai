"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/app/empty-state";
import {
  QuickConfirmCard,
  type QuickConfirmEntryView,
  type QuickConfirmReceipt,
} from "@/components/app/quick-confirm-card";
import { QuickConfirmBatch } from "@/components/app/quick-confirm-batch";
import { receiptTitle } from "@/lib/journal/quick-confirm-model";

/**
 * The quick-confirm queue with a RECEIPT the manager can actually see.
 *
 * Measured on production (window 6 walk, walk-living-evidence-loop): the tap
 * succeeded, `quickConfirmEntry` revalidated the route, the server re-render
 * emptied the queue and the page swapped the list for the empty state — so
 * the confirmed card (and its "Patvirtinta — …" line) never reached the
 * screen. The manager saw only "Nėra laukiančių įrašų" and had no proof the
 * tap did anything.
 *
 * This component stays mounted across that re-render (same element, same
 * position), so the receipts it collects from the cards survive the queue
 * emptying. Pure presentation: the cards still do the writes through the
 * gated chain; a receipt is created ONLY from a card's successful action
 * state, never assumed.
 */
export function QuickConfirmQueue({
  entries,
  todays,
  exceptions,
}: {
  entries: QuickConfirmEntryView[];
  /** Today's entries (UTC day) — the batch candidates, computed by the page. */
  todays: QuickConfirmEntryView[];
  exceptions: Record<string, string[]>;
}) {
  const t = useTranslations("journal");
  const [receipts, setReceipts] = useState<QuickConfirmReceipt[]>([]);
  const onConfirmed = useCallback((r: QuickConfirmReceipt) => {
    setReceipts((prev) => (prev.some((p) => p.id === r.id) ? prev : [...prev, r]));
  }, []);

  // A confirmed entry is shown as its receipt, not as a card (the server
  // re-render removes it from `entries` a moment later anyway).
  const receiptIds = new Set(receipts.map((r) => r.id));
  const visible = entries.filter((e) => !receiptIds.has(e.id));
  const visibleToday = todays.filter((e) => !receiptIds.has(e.id));

  return (
    <div className="flex flex-col gap-3" data-testid="quick-queue">
      {receipts.length > 0 ? (
        <ul className="flex flex-col gap-2" data-testid="quick-receipts">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="verified-pop card-border flex flex-col gap-0.5 border-state-success/40 bg-state-success/10 p-4 text-sm text-state-success"
              data-testid={`quick-receipt-${r.id}`}
              role="status"
            >
              <span>
                ✓ {t("inbox.quick.receipt", { title: receiptTitle(r.originalText) })}
                {r.verifiedSkills > 0
                  ? ` · ${t("inbox.quick.receiptSkills", { count: r.verifiedSkills })}`
                  : null}
              </span>
              <span className="text-meta text-text-muted">{r.workerName}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The batch stays mounted so its own result survives the re-render. */}
      <QuickConfirmBatch entries={visibleToday} exceptions={exceptions} />

      {visible.length === 0 ? (
        <EmptyState
          testId="quick-empty-state"
          title={t("inbox.emptyTitle")}
          why={t("inbox.empty")}
          next={t("inbox.emptyNext")}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((e) => (
            <QuickConfirmCard key={e.id} entry={e} onConfirmed={onConfirmed} />
          ))}
        </ul>
      )}
    </div>
  );
}
