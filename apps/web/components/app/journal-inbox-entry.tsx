"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  reviewJournalEntry,
  confirmEntrySkills,
  type ReviewActionState,
  type ConfirmSkillsState,
} from "@/lib/journal/review-actions";

export type InboxSkill = { id: string; name: string; verified: boolean };

export type InboxEntry = {
  id: string;
  originalText: string;
  workerName: string;
  createdAt: string;
  metrics: { label: string; value: string }[];
  skills: InboxSkill[];
};

/**
 * One reviewable entry in the manager inbox. The manager reviews a worker's
 * journal entry and either:
 *   - CONFIRMS the declared skills it proves → those skills become verified via
 *     the SECURITY DEFINER `confirm_entry_and_verify_skills` RPC (the keystone
 *     verified-proof path; the only path that can flip worker_skills), or
 *   - rejects / requests changes (evidence-only, no verification) via
 *     `review_journal_entry`.
 * No fake state: every write is re-checked server-side (manager scope +
 * journal_review_enabled).
 */
export function JournalInboxEntry({ entry }: { entry: InboxEntry }) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [mode, setMode] = useState<
    "idle" | "confirm" | "rejected" | "changes_requested"
  >("idle");
  const [reviewState, reviewAction, reviewPending] = useActionState<
    ReviewActionState | null,
    FormData
  >(reviewJournalEntry, null);
  const [confirmState, confirmAction, confirmPending] = useActionState<
    ConfirmSkillsState | null,
    FormData
  >(confirmEntrySkills, null);

  const declaredUnverified = entry.skills.filter((s) => !s.verified);
  const alreadyVerified = entry.skills.filter((s) => s.verified);

  const resultMessage: { text: string; ok: boolean } | null = (() => {
    if (confirmState) {
      if (confirmState.ok) {
        return { text: t("inbox.result.skillsVerified", { count: confirmState.verified }), ok: true };
      }
      switch (confirmState.code) {
        case "review_not_enabled":
          return { text: t("inbox.result.reviewNotEnabled"), ok: false };
        case "not_authorized":
        case "no_reviewer_engagement":
          return { text: t("inbox.result.notAuthorized"), ok: false };
        case "skill_not_owned":
          return { text: t("inbox.result.skillNotOwned"), ok: false };
        case "no_skills":
          return { text: t("inbox.result.noSkillsSelected"), ok: false };
        default:
          return { text: t("inbox.result.error"), ok: false };
      }
    }
    if (reviewState) {
      if (reviewState.ok) {
        const key =
          reviewState.decision === "rejected" ? "result.rejected" : "result.changesRequested";
        return { text: t(`inbox.${key}`), ok: true };
      }
      switch (reviewState.code) {
        case "review_not_enabled":
          return { text: t("inbox.result.reviewNotEnabled"), ok: false };
        case "not_authorized":
        case "no_reviewer_engagement":
          return { text: t("inbox.result.notAuthorized"), ok: false };
        case "needs_migration":
          return { text: t("inbox.result.needsMigration"), ok: false };
        default:
          return { text: t("inbox.result.error"), ok: false };
      }
    }
    return null;
  })();

  const done = confirmState?.ok === true || reviewState?.ok === true;
  const isPending = reviewPending || confirmPending;

  return (
    <li className="card-border flex flex-col gap-3 p-4" data-testid={`inbox-entry-${entry.id}`}>
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

      {/* Skills already verified on this worker (context for the reviewer). */}
      {alreadyVerified.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("inbox.alreadyVerified")}
          </span>
          {alreadyVerified.map((s) => (
            <span
              key={s.id}
              className="rounded-full border border-state-success/40 bg-state-success/10 px-2 py-0.5 text-[11px] text-state-success"
            >
              ✓ {s.name}
            </span>
          ))}
        </div>
      )}

      {!done && mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => setMode("confirm")}
            data-testid={`journal-confirm-skills-${entry.id}`}
          >
            {t("inbox.confirmSkills")}
          </Button>
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

      {/* Confirm-skills: pick which declared skills this entry proves → verify. */}
      {!done && mode === "confirm" ? (
        declaredUnverified.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-muted">{t("inbox.noSkillsToConfirm")}</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              {t("inbox.cancel")}
            </Button>
          </div>
        ) : (
          <form action={confirmAction} className="flex flex-col gap-2">
            <input type="hidden" name="entry_id" value={entry.id} />
            <input type="hidden" name="locale" value={locale} />
            <p className="text-xs text-text-secondary">{t("inbox.confirmSkillsHint")}</p>
            <div className="flex flex-col gap-1">
              {declaredUnverified.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    name="skill_id"
                    value={s.id}
                    defaultChecked
                    data-testid={`confirm-skill-${entry.id}-${s.id}`}
                  />
                  {s.name}
                </label>
              ))}
            </div>
            <Input name="note" placeholder={t("inbox.confirmNote")} />
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={isPending}
                data-testid={`journal-confirm-submit-${entry.id}`}
              >
                {t("inbox.confirmSubmit")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
                {t("inbox.cancel")}
              </Button>
            </div>
          </form>
        )
      ) : null}

      {!done && (mode === "rejected" || mode === "changes_requested") ? (
        <form action={reviewAction} className="flex flex-col gap-2">
          <input type="hidden" name="entry_id" value={entry.id} />
          <input type="hidden" name="decision" value={mode} />
          <input type="hidden" name="locale" value={locale} />
          <Input
            name="note"
            placeholder={mode === "rejected" ? t("inbox.rejectReason") : t("inbox.changesNote")}
            required
            data-testid={`journal-review-note-${entry.id}`}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
              {mode === "rejected" ? t("inbox.reject") : t("inbox.requestChanges")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              {t("inbox.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {resultMessage ? (
        <p
          className={
            resultMessage.ok
              ? "verified-pop rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-xs text-state-success"
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
