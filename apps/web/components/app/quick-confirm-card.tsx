"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  quickConfirmEntry,
  type QuickConfirmState,
} from "@/lib/journal/quick-confirm-actions";
import {
  reviewJournalEntry,
  type ReviewActionState,
} from "@/lib/journal/review-actions";
import { isTerminalStaleOutcome } from "@/lib/learning/learning-shared";

export type QuickConfirmEntryView = {
  id: string;
  workerName: string;
  createdAt: string;
  originalText: string;
  recognizedNames: string[];
  /** Declared-unverified skills the tap will verify — listed EXPLICITLY on
   *  the card (no checkboxes, nothing hidden, nothing pre-checked). */
  skills: { id: string; name: string }[];
};

/**
 * One reviewable entry as a one-tap card (S3.5). Clarity before speed: the
 * card shows WHO, WHEN, the entry text, the recognized works and the exact
 * skills the tap confirms — one glance, one tap. The confirmation stays a
 * legally meaningful manager decision: nothing fires automatically and the
 * reject path (short reason) sits right next to the confirm.
 */
export function QuickConfirmCard({ entry }: { entry: QuickConfirmEntryView }) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [rejecting, setRejecting] = useState(false);
  const [confirmState, confirmAction, confirmPending] = useActionState<
    QuickConfirmState | null,
    FormData
  >(quickConfirmEntry, null);
  const [rejectState, rejectAction, rejectPending] = useActionState<
    ReviewActionState | null,
    FormData
  >(reviewJournalEntry, null);

  const pending = confirmPending || rejectPending;
  const confirmed = confirmState?.ok === true;
  const rejected = rejectState?.ok === true;

  const failureCode = !confirmState?.ok
    ? confirmState?.code
    : !rejectState?.ok
      ? rejectState?.code
      : undefined;

  /**
   * TERMINAL STALE (owner-hold v5 P2-3). The worker edited or removed the entry
   * after this card rendered, so it can never be confirmed or rejected. This is
   * NOT a generic error and NOT retryable: the card collapses to a calm
   * explanatory state and every action button is removed, which is what stops
   * the repeated failing submissions. Genuine temporary failures keep the
   * buttons and the retry path untouched (see errorText below).
   */
  const staleOutcome =
    !confirmState?.ok && !rejectState?.ok && isTerminalStaleOutcome(failureCode)
      ? failureCode
      : null;

  const errorText = (() => {
    const code = failureCode;
    if (confirmState?.ok || rejectState?.ok || !code || staleOutcome) return null;
    switch (code) {
      case "review_not_enabled":
        return t("inbox.result.reviewNotEnabled");
      case "not_authorized":
      case "no_reviewer_engagement":
        return t("inbox.result.notAuthorized");
      case "skill_not_owned":
        return t("inbox.result.skillNotOwned");
      default:
        return t("inbox.result.error");
    }
  })();

  if (confirmed) {
    return (
      <li
        className="verified-pop card-border flex items-center gap-2 border-state-success/40 bg-state-success/10 p-4 text-sm text-state-success"
        data-testid={`quick-confirmed-${entry.id}`}
        role="status"
      >
        ✓ {t("inbox.quick.confirmedCard", { name: entry.workerName })}
        {confirmState.verifiedSkills > 0
          ? ` · ${t("inbox.result.skillsVerified", { count: confirmState.verifiedSkills })}`
          : null}
      </li>
    );
  }
  // Terminal stale — rendered BEFORE the action markup, so the confirm/reject
  // buttons are gone from the tree entirely (not merely disabled).
  if (staleOutcome) {
    return (
      <li
        className="card-border flex flex-col gap-1 p-4 text-sm text-text-muted"
        data-testid={`quick-stale-${entry.id}`}
        data-stale-outcome={staleOutcome}
        role="status"
      >
        <span className="text-text-secondary">
          {staleOutcome === "entry_deleted"
            ? t("inbox.result.entryDeleted")
            : t("inbox.result.entrySuperseded")}
        </span>
        <span className="text-xs">{t("inbox.result.staleTerminalHint")}</span>
      </li>
    );
  }
  if (rejected) {
    return (
      <li
        className="card-border flex items-center gap-2 p-4 text-sm text-text-muted"
        data-testid={`quick-rejected-${entry.id}`}
        role="status"
      >
        {t("inbox.quick.rejectedCard", { name: entry.workerName })}
      </li>
    );
  }

  return (
    <li
      className="card-border flex flex-col gap-3 p-4"
      data-testid={`quick-confirm-card-${entry.id}`}
    >
      {/* WHO + WHEN — one glance. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-base font-semibold text-text-primary">
          {entry.workerName}
        </p>
        <p className="shrink-0 text-xs text-text-muted">
          {new Date(entry.createdAt).toLocaleDateString(locale)}
        </p>
      </div>

      {/* WHAT — the entry text + recognized works. */}
      <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-text-secondary">
        {entry.originalText}
      </p>
      {entry.recognizedNames.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.recognizedNames.map((name) => (
            <span
              key={name}
              className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 text-[11px] text-brand-blue"
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}

      {/* EXACTLY what the tap confirms — explicit list, never pre-checked
          checkboxes. With no unverified skills the tap confirms the entry. */}
      {entry.skills.length > 0 ? (
        <div
          className="flex flex-col gap-1.5"
          data-testid={`quick-will-confirm-${entry.id}`}
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("inbox.quick.willConfirm")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {entry.skills.map((s) => (
              <span
                key={s.id}
                className="rounded-full border border-state-success/40 bg-state-success/10 px-2 py-0.5 text-[11px] text-state-success"
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-text-muted">
          {t("inbox.quick.entryOnlyNote")}
        </p>
      )}

      {!rejecting ? (
        <div className="flex items-center gap-2">
          <form action={confirmAction} className="flex-1">
            <input type="hidden" name="entry_id" value={entry.id} />
            <input type="hidden" name="locale" value={locale} />
            {entry.skills.map((s) => (
              <input key={s.id} type="hidden" name="skill_id" value={s.id} />
            ))}
            <Button
              type="submit"
              variant="primary"
              disabled={pending}
              className="min-h-12 w-full"
              data-testid={`quick-confirm-tap-${entry.id}`}
            >
              {entry.skills.length > 0
                ? t("inbox.quick.confirmTapSkills", {
                    count: entry.skills.length,
                  })
                : t("inbox.quick.confirmTap")}
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="min-h-12 shrink-0"
            data-testid={`quick-reject-open-${entry.id}`}
          >
            {t("inbox.reject")}
          </Button>
        </div>
      ) : (
        <form action={rejectAction} className="flex flex-col gap-2">
          <input type="hidden" name="entry_id" value={entry.id} />
          <input type="hidden" name="decision" value="rejected" />
          <input type="hidden" name="locale" value={locale} />
          <Input
            name="note"
            placeholder={t("inbox.rejectReason")}
            required
            autoFocus
            data-testid={`quick-reject-note-${entry.id}`}
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={pending}
              data-testid={`quick-reject-submit-${entry.id}`}
            >
              {t("inbox.reject")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(false)}
            >
              {t("inbox.cancel")}
            </Button>
          </div>
        </form>
      )}

      {errorText ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-xs text-state-warning"
          role="status"
        >
          {errorText}
        </p>
      ) : null}
    </li>
  );
}
