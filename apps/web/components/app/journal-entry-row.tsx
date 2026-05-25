"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { softDeleteJournalEntry } from "@/lib/journal/actions";

/**
 * One row in the journal entries list. The Delete button is only visible
 * when the entry has no external confirmations — `canDelete=false` keeps
 * the surface honest about the §3 append-only doctrine, and the RPC
 * back-end re-enforces the same rule (so a stale client can't bypass it).
 *
 * "Edit" is intentionally out of scope for this row: pre-confirmation
 * edits land via the composer in a follow-up slice, using the
 * `journal_entry_supersede` RPC the same migration ships.
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
    const confirmed = window.confirm(t("entry.deleteConfirm"));
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await softDeleteJournalEntry(entryId, locale);
      if (!result.ok) {
        setError(result.message);
      }
    });
  }

  return (
    <li className="card-border p-4">
      {children}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-state-danger disabled:opacity-50"
            data-testid={`journal-entry-delete-${entryId}`}
          >
            {pending ? t("entry.deleting") : t("entry.delete")}
          </button>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("entry.deleteBlocked")}
          </span>
        )}
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
