"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { softDeleteJournalEntry } from "@/lib/journal/actions";
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
}: {
  entryId: string;
  canDelete: boolean;
  children: React.ReactNode;
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
    <li className="card-border p-4">
      {children}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {canDelete ? (
            <>
              <Link
                href={`/${locale}/dashboard/journal?editing=${entryId}#journal-composer`}
                onClick={() => recordEvent("journal_edit_clicked")}
                className="font-mono text-[10px] uppercase tracking-label text-text-secondary hover:text-brand-blue"
                data-testid={`journal-entry-edit-${entryId}`}
              >
                {t("entry.edit")}
              </Link>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-state-danger disabled:opacity-50"
                data-testid={`journal-entry-delete-${entryId}`}
              >
                {pending ? t("entry.deleting") : t("entry.delete")}
              </button>
            </>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
