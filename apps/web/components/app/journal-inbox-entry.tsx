"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  reviewJournalEntry,
  type ReviewActionState,
} from "@/lib/journal/review-actions";

export type InboxEntry = {
  id: string;
  originalText: string;
  workerName: string;
  createdAt: string;
  metrics: { label: string; value: string }[];
  skills: string[];
};

/**
 * One reviewable entry in the manager inbox (slice
 * manager-review-evidence-result-v1). The manager records a real evidence
 * result — approve / reject / request changes — through the gated
 * `reviewJournalEntry` action (→ migration 0034 RPC). Reject and request-changes
 * reveal a note field. No fake approve/reject: the RPC re-checks manager scope +
 * journal_review_enabled and persists the decision.
 */
export function JournalInboxEntry({ entry }: { entry: InboxEntry }) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [mode, setMode] = useState<"idle" | "rejected" | "changes_requested">(
    "idle",
  );
  const [state, formAction, isPending] = useActionState<
    ReviewActionState | null,
    FormData
  >(reviewJournalEntry, null);

  const resultMessage: { text: string; ok: boolean } | null = (() => {
    if (!state) return null;
    if (state.ok) {
      const key =
        state.decision === "approved"
          ? "result.approved"
          : state.decision === "rejected"
            ? "result.rejected"
            : "result.changesRequested";
      return { text: t(`inbox.${key}`), ok: true };
    }
    switch (state.code) {
      case "review_not_enabled":
        return { text: t("inbox.result.reviewNotEnabled"), ok: false };
      case "not_authorized":
        return { text: t("inbox.result.notAuthorized"), ok: false };
      case "no_reviewer_engagement":
        return { text: t("inbox.result.notAuthorized"), ok: false };
      case "needs_migration":
        return { text: t("inbox.result.needsMigration"), ok: false };
      default:
        return { text: t("inbox.result.error"), ok: false };
    }
  })();

  const reviewed = state?.ok === true;

  return (
    <li className="card-border flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-text-primary">
            {entry.workerName}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {new Date(entry.createdAt).toLocaleDateString(locale)}
          </p>
        </div>
      </div>

      <p className="text-sm text-text-primary">{entry.originalText}</p>

      {entry.metrics.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
          {entry.metrics.map((m) => (
            <span key={m.label}>
              <span className="uppercase tracking-label">{m.label}:</span> {m.value}
            </span>
          ))}
        </div>
      )}

      {entry.skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("inbox.skills")}
          </span>
          {entry.skills.map((s) => (
            <span
              key={s}
              className="rounded-full border border-ink-500 px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {!reviewed && mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* Approve — single click, no note. */}
          <form action={formAction}>
            <input type="hidden" name="entry_id" value={entry.id} />
            <input type="hidden" name="decision" value="approved" />
            <input type="hidden" name="locale" value={locale} />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={isPending}
              data-testid={`journal-review-approve-${entry.id}`}
            >
              {t("inbox.approve")}
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setMode("changes_requested")}
            data-testid={`journal-review-request-changes-${entry.id}`}
          >
            {t("inbox.requestChanges")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setMode("rejected")}
            data-testid={`journal-review-reject-${entry.id}`}
          >
            {t("inbox.reject")}
          </Button>
        </div>
      ) : null}

      {!reviewed && mode !== "idle" ? (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="entry_id" value={entry.id} />
          <input type="hidden" name="decision" value={mode} />
          <input type="hidden" name="locale" value={locale} />
          <Input
            name="note"
            placeholder={
              mode === "rejected"
                ? t("inbox.rejectReason")
                : t("inbox.changesNote")
            }
            required
            data-testid={`journal-review-note-${entry.id}`}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
              {mode === "rejected" ? t("inbox.reject") : t("inbox.requestChanges")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode("idle")}
            >
              {t("inbox.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {resultMessage ? (
        <p
          className={
            resultMessage.ok
              ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-xs text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-xs text-state-warning"
          }
          role="status"
          data-testid={`journal-review-result-${entry.id}`}
        >
          {resultMessage.text}
        </p>
      ) : null}
    </li>
  );
}
