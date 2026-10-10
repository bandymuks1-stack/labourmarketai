"use client";

import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { Explain } from "@/components/app/premium/grammar";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { restoreJournalEntry, softDeleteJournalEntry } from "@/lib/journal/actions";
import { reprocessJournalEntrySkills } from "@/lib/journal/skill-pipeline-actions";
import type { JournalSkillPipelineResult } from "@/lib/journal/skill-pipeline";
import { JournalEntrySkillLinks } from "@/components/app/journal-entry-skill-links";
import type { EntrySkillSource } from "@/lib/journal/entry-skill-source";
import type { EntryPendingCandidate } from "@/lib/journal/entry-pending-candidates";
import { recordEvent } from "@/lib/telemetry/task";
import {
  WorkSpineNode,
  type EvidenceStanding,
} from "@/components/app/work-world/primitives";

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
  correctionSlot,
  standing = "UNKNOWN",
  standingSolid = false,
  chainSlot,
  needsAttention = false,
}: {
  entryId: string;
  canDelete: boolean;
  children: React.ReactNode;
  /** Work-world grammar: the entry's honest evidence standing, chosen by the
   *  page from its verification state (`evidenceStandingOfVerification`).
   *  It colours the spine node only — the row adds no authority of its own.
   *  Absent → an UNKNOWN (dashed) node, never a guessed one. */
  standing?: EvidenceStanding;
  /** Solid node = a real decision row exists behind the entry. */
  standingSolid?: boolean;
  /** The entry's EvidenceChain (recorded -> photo -> manager's record -> in
   *  your history), built by the page from the same verification state that
   *  drives `standing`. Shown between the entry and its status zone. */
  chainSlot?: React.ReactNode;
  /** Edit-in-place control (journal compact UX v1): the page passes the
   *  drawer-based edit launcher here so editing opens in a compact drawer
   *  over the list — no navigation, scroll/day position preserved. Absent →
   *  the `?editing=` link below stays the fallback path. */
  editSlot?: React.ReactNode;
  /** The worker's correction control on an entry an employer asked to
   *  change (decision `changes_requested`). The entry is reviewed, so it is
   *  never edited in place or deleted: the control submits a CORRECTION that
   *  supersedes it visibly (`correction_of`), the original stays. Absent → only
   *  the "already reviewed" note shows, as before. */
  correctionSlot?: React.ReactNode;
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
    /** PENDING candidates of this saved entry, decidable on the card
     *  (`lib/journal/entry-pending-candidates`). */
    candidates?: EntryPendingCandidate[];
  };
  /** Status zone (decision timeline + date) shown at the BOTTOM of the card —
   *  secondary to the entry text + understood signals, so the worker scans
   *  "what I wrote → what the system understood → what I can fix" first. */
  statusSlot?: React.ReactNode;
  /** Something in the details asks the person for a decision (an employer
   *  asked for a correction, a dispute is open): the details open by default
   *  so a required action is never hidden. */
  needsAttention?: boolean;
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
      <WorkSpineNode state="WITHDRAWN">
      <div
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
      </div>
      </WorkSpineNode>
    );
  }

  // The entry is ONE node on the day's work spine (work-world grammar): the
  // diamond carries its evidence standing; the card beneath is unchanged.
  return (
    <WorkSpineNode state={standing} solid={standingSolid}>
    <div className="card-border flex flex-col gap-3 p-4" data-testid={`journal-entry-card-${entryId}`}>
      {/* Sections: entry text + "Sistema suprato" come from `children`. */}
      {children}
      {/* MAIN action in view — edit, or the correction an employer asked for. */}
      <div className="flex flex-wrap items-center gap-2">
        {canDelete ? (
          (editSlot ?? (
            <Link
              href={`/${locale}/dashboard/journal?editing=${entryId}#journal-composer`}
              onClick={() => recordEvent("journal_edit_clicked")}
              className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue active:border-brand-blue"
              data-testid={`journal-entry-edit-${entryId}`}
            >
              {t("entry.edit")} →
            </Link>
          ))
        ) : (
          <>
            {correctionSlot}
            <span className="inline-flex min-h-[2.75rem] items-center font-mono text-meta uppercase tracking-label text-text-muted">
              {t("entry.deleteBlocked")}
            </span>
          </>
        )}
      </div>
      {/* THE CALM CARD (owner 2026-10-10: no text walls). In view: what was
          done, where, how long, its evidence standing with the next step, and
          the main action. Skills, the evidence chain, the decision timeline
          and the secondary actions live behind ONE disclosure per entry —
          open by default when something inside asks for a decision. Nothing
          removed; every control keeps its test id. */}
      <Explain
        summary={t("entry.more")}
        defaultOpen={needsAttention}
        testId={`journal-entry-more-${entryId}`}
        className="border-t border-border/40 pt-1"
      >
        <div className="flex flex-col gap-3 text-support text-text-primary">
          {skillLinks && (
            <JournalEntrySkillLinks
              entryId={entryId}
              availableSkills={skillLinks.availableSkills}
              linkedSkillIds={skillLinks.linkedSkillIds}
              skillSources={skillLinks.skillSources}
              detected={skillLinks.detected}
              candidates={skillLinks.candidates}
            />
          )}
          {chainSlot ? (
            <div className="border-t border-border/40 pt-3" data-testid={`journal-entry-chain-${entryId}`}>
              {chainSlot}
            </div>
          ) : null}
          {statusSlot && (
            <div
              className="flex flex-col gap-1 border-t border-border/40 pt-2"
              data-testid={`journal-entry-status-${entryId}`}
            >
              {statusSlot}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
            {canDelete ? (
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
            ) : null}
            {/* P0 Track B: idempotent re-run of the canonical recognition
                pipeline for THIS entry (recovery path; safe to repeat). */}
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
        </div>
      </Explain>
      <div className="flex flex-wrap items-center justify-between gap-2">
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
    </div>
    </WorkSpineNode>
  );
}
