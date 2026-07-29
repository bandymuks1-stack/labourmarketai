"use client";

import { InlineConfirm } from "@/components/ui/InlineConfirm";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { restoreJournalEntry, softDeleteJournalEntry } from "@/lib/journal/actions";
import { reprocessJournalEntrySkills } from "@/lib/journal/skill-pipeline-actions";
import type { JournalSkillPipelineResult } from "@/lib/journal/skill-pipeline";
import { JournalEntrySkillLinks } from "@/components/app/journal-entry-skill-links";
import type { EntrySkillSource } from "@/lib/journal/entry-skill-source";
import { recordEvent } from "@/lib/telemetry/task";

/**
 * One row in the journal entries list. The Delete + Edit controls are only
 * visible when the entry has no external confirmations (`canEdit=false`
 * mirrors `canDelete=false`) — keeps the surface honest about the §3
 * append-only doctrine, and the RPC back-end re-enforces the same rule.
 *
 * Edit hands off to the composer in "edit mode" via the `?editing=<id>`
 * query parameter (URL-based so the back button + tab restore work).
 */
export function JournalEntryRow({
  entryId,
  canDelete,
  children,
  skillLinks,
  statusSlot,
  editSlot,
}: {
  entryId: string;
  canDelete: boolean;
  children: React.ReactNode;
  /** Edit-in-place control (journal compact UX v1): the page passes the
   *  drawer-based edit launcher here so editing opens in a compact drawer
   *  over the list — no navigation, scroll/day position preserved. Absent →
   *  the `?editing=` link below stays the fallback path. */
  editSlot?: React.ReactNode;
  /** Journal Entry ↔ Skill links v1 — present only when the worker owns the
   *  entry and the durable relation is available. Omitted → no link UI. */
  skillLinks?: {
    availableSkills: { id: string; name: string }[];
    linkedSkillIds: string[];
    /** Per-entry honest source for each linked skill id (stale-skill review). */
    skillSources?: Record<string, EntrySkillSource>;
    /** Render-time detected signals from THIS entry's text (display-only
     *  suggestions computed by the server page — no DB write). */
    detected?: { skills: { id: string; name: string }[]; labels: string[] };
  };
  /** Status zone (decision timeline + date) shown at the BOTTOM of the card —
   *  secondary to the entry text + understood signals, so the worker scans
   *  "what I wrote → what the system understood → what I can fix" first. */
  statusSlot?: React.ReactNode;
}) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Local "removed" state: the row swaps to an inline placeholder with a real
  // undo, instead of silently vanishing (destructive-action contract v1:
  // immediate visible result + working restore path).
  const [deleted, setDeleted] = useState(false);
  // P0 Track B: idempotent per-entry re-run of the canonical skill pipeline
  // ("Atnaujinti atpažinimą") — result rendered inline with real counts.
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] =
    useState<JournalSkillPipelineResult | null>(null);
  const [reprocessError, setReprocessError] = useState(false);

  function onReprocess() {
    setReprocessError(false);
    setReprocessResult(null);
    setReprocessing(true);
    recordEvent("journal_reprocess_clicked");
    void reprocessJournalEntrySkills(entryId)
      .then((res) => {
        if (res.ok) setReprocessResult(res.result);
        else setReprocessError(true);
      })
      .catch(() => setReprocessError(true))
      .finally(() => setReprocessing(false));
  }

  function onDelete() {
    // W2: confirmation happens inline, in place, before this runs. No blocking
    // dialog — see components/ui/InlineConfirm.
    recordEvent("journal_delete_clicked");
    setError(null);
    startTransition(async () => {
      const result = await softDeleteJournalEntry(entryId, locale);
      if (!result.ok) {
        setError(result.message);
        recordEvent("journal_save_error_code", { result_kind: result.code });
      } else {
        setDeleted(true);
        recordEvent("journal_save_success", { result_kind: "soft_delete" });
      }
    });
  }

  function onRestore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreJournalEntry(entryId, locale);
      if (!result.ok) {
        setError(result.message);
        recordEvent("journal_save_error_code", { result_kind: result.code });
      } else {
        setDeleted(false);
        recordEvent("journal_save_success", { result_kind: "restore" });
      }
    });
  }

  if (deleted) {
    return (
      <li
        className="card-border flex flex-wrap items-center justify-between gap-2 p-4"
        data-testid={`journal-entry-deleted-${entryId}`}
      >
        <span className="text-sm text-text-secondary">{t("entry.deletedNotice")}</span>
        <button
          type="button"
          onClick={onRestore}
          disabled={pending}
          aria-busy={pending || undefined}
          className="inline-flex min-h-[2.75rem] items-center rounded-md border border-ink-500 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
          data-testid={`journal-entry-restore-${entryId}`}
        >
          {pending ? t("entry.restoring") : t("entry.restore")}
        </button>
        {error && (
          <span
            role="alert"
            className="w-full text-meta text-state-danger"
            data-testid={`journal-entry-restore-error-${entryId}`}
          >
            {error}
          </span>
        )}
      </li>
    );
  }

  return (
    <li className="card-border flex flex-col gap-3 p-4">
      {/* Sections: entry text + "Sistema suprato" come from `children`. */}
      {children}
      {/* Linked skill signals + collapsed "Ankstesni ryšiai" (its own block). */}
      {skillLinks && (
        <JournalEntrySkillLinks
          entryId={entryId}
          availableSkills={skillLinks.availableSkills}
          linkedSkillIds={skillLinks.linkedSkillIds}
          skillSources={skillLinks.skillSources}
          detected={skillLinks.detected}
        />
      )}
      {/* Status zone — secondary, below the signals. */}
      {statusSlot && (
        <div
          className="flex flex-col gap-1 border-t border-border/40 pt-2"
          data-testid={`journal-entry-status-${entryId}`}
        >
          {statusSlot}
        </div>
      )}
      {/* Actions — the entry card holds interactive children (skill-link +
          delete buttons), so the whole card can't be one link. Instead the
          MAIN action (open/edit the entry) is a clear, mobile-safe (≥44px)
          tappable control, with delete distinct beside it. Neither is hidden. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {canDelete ? (
            <>
              {editSlot ?? (
                <Link
                  href={`/${locale}/dashboard/journal?editing=${entryId}#journal-composer`}
                  onClick={() => recordEvent("journal_edit_clicked")}
                  className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue active:border-brand-blue"
                  data-testid={`journal-entry-edit-${entryId}`}
                >
                  {t("entry.edit")} →
                </Link>
              )}
              <InlineConfirm
                label={pending ? t("entry.deleting") : t("entry.delete")}
                question={t("entry.deleteConfirm")}
                confirmLabel={t("entry.delete")}
                cancelLabel={t("compactEdit.cancel")}
                tier="important_write"
                disabled={pending}
                onConfirm={onDelete}
                className="inline-flex min-h-[2.75rem] items-center rounded-md px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:text-state-danger disabled:opacity-50 disabled:cursor-not-allowed"
                testId={`journal-entry-delete-${entryId}`}
              />
            </>
          ) : (
            <span className="inline-flex min-h-[2.75rem] items-center font-mono text-meta uppercase tracking-label text-text-muted">
              {t("entry.deleteBlocked")}
            </span>
          )}
          {/* P0 Track B: unobtrusive idempotent re-run of the canonical
              recognition pipeline for THIS entry (recovery path after a
              failed save-time run; safe to repeat). */}
          <button
            type="button"
            onClick={onReprocess}
            disabled={reprocessing}
            aria-busy={reprocessing || undefined}
            className="inline-flex min-h-[2.75rem] items-center rounded-md px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`journal-entry-reprocess-${entryId}`}
          >
            {t("reprocessEntry")}
          </button>
        </div>
        {error && (
          <span
            role="alert"
            className="text-meta text-state-danger"
            data-testid={`journal-entry-delete-error-${entryId}`}
          >
            {error}
          </span>
        )}
        {reprocessResult !== null &&
          (reprocessResult.status === "failed" ? (
            <span
              className="w-full text-meta text-state-warning"
              data-testid={`journal-entry-reprocess-failed-${entryId}`}
            >
              {t("pipelineFailed", { trace: reprocessResult.trace })}
            </span>
          ) : (
            <span
              className="w-full text-meta text-text-secondary"
              data-testid={`journal-entry-reprocess-result-${entryId}`}
            >
              {t("pipelineLine", {
                detected: reprocessResult.detected,
                added: reprocessResult.added,
                strengthened: reprocessResult.strengthened,
                review: reprocessResult.reviewNeeded,
              })}{" "}
              {reprocessResult.cvUpdated
                ? t("pipelineCvUpdated")
                : t("pipelineCvUnchanged")}
            </span>
          ))}
        {reprocessError && (
          <span
            role="alert"
            className="w-full text-meta text-state-danger"
            data-testid={`journal-entry-reprocess-error-${entryId}`}
          >
            {t("saveError")}
          </span>
        )}
      </div>
    </li>
  );
}
