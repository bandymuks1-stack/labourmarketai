"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { softDeleteJournalEntry } from "@/lib/journal/actions";
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
}: {
  entryId: string;
  canDelete: boolean;
  children: React.ReactNode;
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

  function onDelete() {
    recordEvent("journal_delete_clicked");
    const confirmed = window.confirm(t("entry.deleteConfirm"));
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await softDeleteJournalEntry(entryId, locale);
      if (!result.ok) {
        setError(result.message);
        recordEvent("journal_save_error_code", { result_kind: result.code });
      } else {
        recordEvent("journal_save_success", { result_kind: "soft_delete" });
      }
    });
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
              <Link
                href={`/${locale}/dashboard/journal?editing=${entryId}#journal-composer`}
                onClick={() => recordEvent("journal_edit_clicked")}
                className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue active:border-brand-blue"
                data-testid={`journal-entry-edit-${entryId}`}
              >
                {t("entry.edit")} →
              </Link>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                aria-busy={pending || undefined}
                className="inline-flex min-h-[2.75rem] items-center rounded-md px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:text-state-danger disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`journal-entry-delete-${entryId}`}
              >
                {pending ? t("entry.deleting") : t("entry.delete")}
              </button>
            </>
          ) : (
            <span className="inline-flex min-h-[2.75rem] items-center font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("entry.deleteBlocked")}
            </span>
          )}
        </div>
        {error && (
          <span
            role="alert"
            className="text-[11px] text-state-danger"
            data-testid={`journal-entry-delete-error-${entryId}`}
          >
            {error}
          </span>
        )}
      </div>
    </li>
  );
}
