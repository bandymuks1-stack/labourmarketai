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
import type { QuickConfirmScope } from "@/lib/journal/quick-confirm-model";
import { isTerminalStaleOutcome } from "@/lib/learning/learning-shared";
import { formatUtcDate } from "@/lib/time/display";

export type QuickConfirmEntryView = {
  id: string;
  workerName: string;
  createdAt: string;
  /** The day the work happened (`resolveWorkDay`). */
  workDay?: string;
  /** The stored work time (`reviewerHoursOf`), never a re-parse of the text. */
  hours?: { value: number; unit: string; certain: boolean } | null;
  originalText: string;
  recognizedNames: string[];
  /** The skills the tap will verify — listed EXPLICITLY on the card (no
   *  checkboxes, nothing hidden, nothing pre-checked). Scoped to the entry's
   *  own linked skills when it has links (quick-confirm-model.ts). */
  skills: { id: string; name: string }[];
  /** Which rule produced `skills` — `skills_unavailable` is the named read
   *  failure: the card says so instead of claiming "no unconfirmed skills". */
  confirmScope: QuickConfirmScope;
  /** The organization the entry belongs to, shown when the queue spans several, so no
   *  card is approved without saying whose hours it is. Absent: one organization. */
  organization?: string;
  /** The project the entry was recorded for, shown when the queue holds entries of more
   *  than one project (or of none), so a report is read against its project. */
  project?: string;
};

/** What a successful tap reports upward — the queue keeps it as a receipt
 *  after the server re-render removes the confirmed entry from the list. */
export type QuickConfirmReceipt = {
  id: string;
  workerName: string;
  originalText: string;
  verifiedSkills: number;
  decision: "approved" | "rejected";
};

/**
 * One reviewable entry as a one-tap card (S3.5). Clarity before speed: the
 * card shows WHO, WHEN, the entry text, the recognized works and the exact
 * skills the tap confirms — one glance, one tap. The confirmation stays a
 * legally meaningful manager decision: nothing fires automatically and the
 * reject path (short reason) sits right next to the confirm.
 */
export function QuickConfirmCard({
  entry,
  onConfirmed,
}: {
  entry: QuickConfirmEntryView;
  /** Called when a decision is stored (see QuickConfirmReceipt). */
  onConfirmed?: (receipt: QuickConfirmReceipt) => void;
}) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [rejecting, setRejecting] = useState(false);
  /** Which action the manager submitted last — the discriminator for reading
   *  the right `useActionState` result (both persist independently). */
  const [lastAction, setLastAction] = useState<"confirm" | "reject" | null>(null);
  // Reported as soon as the action answers, not from an effect after the result renders.
  // The action revalidates the route, and its result and the refreshed queue commit
  // together: this card is already gone in that commit, so an effect here never runs and
  // the person gets no answer (production walk 42414193078: stored, no receipt).
  const report = (decision: QuickConfirmReceipt["decision"], verifiedSkills: number) =>
    onConfirmed?.({
      id: entry.id,
      workerName: entry.workerName,
      originalText: entry.originalText,
      verifiedSkills,
      decision,
    });
  const [confirmState, confirmAction, confirmPending] = useActionState<
    QuickConfirmState | null,
    FormData
  >(async (previous, formData) => {
    const result = await quickConfirmEntry(previous, formData);
    if (result.ok) report("approved", result.verifiedSkills);
    return result;
  }, null);
  const [rejectState, rejectAction, rejectPending] = useActionState<
    ReviewActionState | null,
    FormData
  >(async (previous, formData) => {
    const result = await reviewJournalEntry(previous, formData);
    if (result.ok) report("rejected", 0);
    return result;
  }, null);

  const pending = confirmPending || rejectPending;
  const confirmed = confirmState?.ok === true;
  const rejected = rejectState?.ok === true;

  // Report the failure of the action the manager MOST RECENTLY submitted.
  // `useActionState` keeps both results independently and neither is ever
  // cleared, so no fixed precedence works: after a retryable confirm failure a
  // later Reject would keep surfacing the stale confirm reason, and a terminal
  // reject outcome would never be recognized (Codex rev13). Tracking the last
  // submitted action is the only correct discriminator.
  const activeState = lastAction === "confirm" ? confirmState : lastAction === "reject" ? rejectState : null;
  const failureCode = activeState && !activeState.ok ? activeState.code : undefined;

  /**
   * TERMINAL STALE (owner-hold v5 P2-3). The worker edited or removed the entry
   * after this card rendered, so it can never be confirmed or rejected. This is
   * NOT a generic error and NOT retryable: the card collapses to a calm
   * explanatory state and every action button is removed, which is what stops
   * the repeated failing submissions. Genuine temporary failures keep the
   * buttons and the retry path untouched (see errorText below).
   */
  const staleOutcome = isTerminalStaleOutcome(failureCode) ? failureCode : null;

  const errorText = (() => {
    const code = failureCode;
    // Success is already handled by the terminal branches above, and a stale
    // outcome renders its own terminal card — neither reaches the error line.
    if (!code || staleOutcome) return null;
    switch (code) {
      case "review_not_enabled":
        return t("inbox.result.reviewNotEnabled");
      case "not_authorized":
        return t("inbox.result.notAuthorized");
      // R-4: seen by membership, refused on confirm — the owner grants the
      // reviewer engagement on the People page.
      case "no_reviewer_engagement":
        return t("inbox.result.noReviewerEngagement");
      case "self_review_not_allowed":
        return t("inbox.result.selfReviewNotAllowed");
      case "review_authority_not_established":
        return t("inbox.result.reviewAuthorityNotEstablished");
      case "already_accepted":
        return t("inbox.result.alreadyAccepted");
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
      data-confirm-scope={entry.confirmScope}
    >
      {entry.organization ? (
        <p className="text-meta font-medium text-text-secondary" data-testid={`quick-organization-${entry.id}`}>
          {entry.organization}
        </p>
      ) : null}
      {entry.project ? (
        <p className="text-meta font-medium text-text-secondary" data-testid={`quick-project-${entry.id}`}>
          {entry.project}
        </p>
      ) : null}
      {/* WHO + WHEN — one glance. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-base font-semibold text-text-primary">
          {entry.workerName}
        </p>
        <p className="shrink-0 text-xs text-text-muted">
          {formatUtcDate(entry.workDay ?? entry.createdAt, locale)}
        </p>
      </div>

      {entry.hours ? (
        <p className="text-sm font-semibold text-text-primary" data-testid={`quick-hours-${entry.id}`}>
          {t("inbox.hoursLabel")}: {entry.hours.value} {entry.hours.unit}
          {entry.hours.certain ? null : (
            <span className="ml-1 text-xs font-normal text-state-warning">({t("inbox.hoursUnclear")})</span>
          )}
        </p>
      ) : null}

      {/* WHAT — the entry text + recognized works. */}
      <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-text-secondary">
        {entry.originalText}
      </p>
      {entry.recognizedNames.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.recognizedNames.map((name) => (
            <span
              key={name}
              className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 text-meta text-brand-blue"
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
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("inbox.quick.willConfirm")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {entry.skills.map((s) => (
              <span
                key={s.id}
                className="rounded-full border border-state-success/40 bg-state-success/10 px-2 py-0.5 text-meta text-state-success"
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      ) : entry.confirmScope === "skills_unavailable" ? (
        <p
          className="text-meta text-state-warning"
          data-testid={`quick-skills-unavailable-${entry.id}`}
        >
          {t("inbox.quick.skillsUnavailable")}
        </p>
      ) : (
        <p className="text-meta text-text-muted">
          {t("inbox.quick.entryOnlyNote")}
        </p>
      )}

      {!rejecting ? (
        <div className="flex items-center gap-2">
          <form
            action={confirmAction}
            onSubmit={() => setLastAction("confirm")}
            className="flex-1"
          >
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
        <form
          action={rejectAction}
          onSubmit={() => setLastAction("reject")}
          className="flex flex-col gap-2"
        >
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
