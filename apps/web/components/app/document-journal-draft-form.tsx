"use client";

/**
 * Document → journal draft REVIEW FORM (value train 2, C2b).
 *
 * The human-in-the-loop step of the import chain: the worker sees what the
 * system read from their document, EDITS it, chooses the engagement, and
 * explicitly confirms — only then does the text become canonical Work
 * Journal history, via the EXISTING `createJournalEntry` server action
 * (which re-verifies the source document under the caller's RLS and stamps
 * the provenance rows server-side, C2a). Nothing here invents a second save
 * path, second composer, or second store.
 *
 * Labels arrive as props from the server parent (the WorkerWorkLogFlow
 * precedent), so this client component reads no i18n namespace itself.
 */
import { useRef, useState, useTransition } from "react";
import {
  createJournalEntry,
  type CreateJournalEntryResult,
} from "@/lib/journal/actions";
import type { WorkLogEngagement } from "@/lib/conversation/worklog-engagements";

export type DocumentJournalDraftFormLabels = {
  notesLabel: string;
  engagementLabel: string;
  save: string;
  saving: string;
  saved: string;
  savedLink: string;
  error: string;
};

export function DocumentJournalDraftForm({
  locale,
  documentFileId,
  initialText,
  engagements,
  defaultEngagementId,
  labels,
}: {
  locale: string;
  documentFileId: string;
  initialText: string;
  engagements: readonly WorkLogEngagement[];
  defaultEngagementId: string | null;
  labels: DocumentJournalDraftFormLabels;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateJournalEntryResult | null>(null);

  if (result?.ok) {
    return (
      <div
        role="status"
        className="rounded-md border border-state-success/50 bg-state-success/10 px-3 py-2 text-sm text-text-primary"
        data-testid="doc-journal-draft-saved"
      >
        <p>{labels.saved}</p>
        <a
          href={`/${locale}/dashboard/journal`}
          className="font-mono text-meta uppercase tracking-label text-brand-blue underline-offset-2 hover:underline"
        >
          {labels.savedLink}
        </a>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!formRef.current || pending) return;
        const fd = new FormData(formRef.current);
        startTransition(async () => {
          try {
            setResult(await createJournalEntry(fd));
          } catch {
            setResult({
              ok: false,
              code: "entry_insert_failed",
              message: labels.error,
            });
          }
        });
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input
        type="hidden"
        name="source_document_file_id"
        value={documentFileId}
      />
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {labels.notesLabel}
        <textarea
          name="notes"
          required
          defaultValue={initialText}
          rows={10}
          className="w-full rounded-md border border-ink-500 bg-ink-800/40 p-2 text-sm text-text-primary"
          data-testid="doc-journal-draft-notes"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {labels.engagementLabel}
        <select
          name="engagement_context_id"
          required
          defaultValue={defaultEngagementId ?? ""}
          className="w-full max-w-md rounded-md border border-ink-500 bg-ink-800/40 p-2 text-sm text-text-primary"
          data-testid="doc-journal-draft-engagement"
        >
          {defaultEngagementId === null ? <option value="" /> : null}
          {engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      {result && !result.ok ? (
        <p
          role="alert"
          className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          data-testid="doc-journal-draft-error"
        >
          {result.message || labels.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-60"
        data-testid="doc-journal-draft-save"
      >
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
