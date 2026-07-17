"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setShortlistAction } from "@/lib/scouting/scouting-actions";
import type { ShortlistStatus } from "@/lib/scouting/scouting";
import { SHORTLIST_NOTE_MAX } from "@/lib/scouting/shortlist-note";

/**
 * Shortlist controls for one scouted worker. Calls the owner-scoped server
 * action; reflects the saved status. No fake state — the button shows what the
 * server accepted (or surfaces a precise error).
 *
 * Extension B (Canonical Ideas Integration v1): the EXISTING demand_shortlist
 * `note` column becomes usable — an optional internal note on any decision,
 * and a REQUIRED short reason when marking `not_fit` (server-enforced too).
 * The note is internal to the company: demand_shortlist RLS never lets a
 * worker read these rows. The inline editor keeps the card compact — one
 * disclosure, no modal, no new route.
 */
export function ScoutingShortlistButtons({
  locale,
  requestId,
  workerId,
  current,
  currentNote,
  labels,
}: {
  locale: string;
  requestId: string;
  workerId: string;
  current: ShortlistStatus | null;
  currentNote: string | null;
  labels: {
    readonly statuses: Record<ShortlistStatus, string>;
    readonly error: string;
    readonly note: {
      readonly label: string;
      readonly internalHint: string;
      readonly add: string;
      readonly edit: string;
      readonly placeholder: string;
      readonly reasonTitle: string;
      readonly reasonPlaceholder: string;
      readonly reasonRequired: string;
      readonly save: string;
      readonly cancel: string;
    };
  };
}) {
  const [status, setStatus] = useState<ShortlistStatus | null>(current);
  const [note, setNote] = useState<string | null>(currentNote);
  const [error, setError] = useState<string | null>(null);
  /** Which inline editor is open: a plain note edit, or the required
   *  not_fit-reason step (blocks the status until a reason is typed). */
  const [editor, setEditor] = useState<"note" | "reason" | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const order: ShortlistStatus[] = ["saved", "interested", "reviewed", "not_fit"];

  function submit(next: ShortlistStatus, noteToWrite: string | null | undefined) {
    setError(null);
    startTransition(async () => {
      const res = await setShortlistAction(locale, requestId, workerId, next, noteToWrite);
      if (res.kind === "ok") {
        setStatus(res.status);
        setNote(res.note);
        setEditor(null);
        setDraft("");
      } else if (res.kind === "reason-required") {
        // Server judgement — keep the reason editor open and say why.
        setEditor("reason");
        setError(labels.note.reasonRequired);
      } else {
        setError(labels.error);
      }
    });
  }

  function choose(next: ShortlistStatus) {
    if (next === "not_fit" && note === null) {
      // The decision needs its reason first — open the inline reason step
      // instead of firing a write the server would refuse anyway.
      setEditor("reason");
      setDraft("");
      setError(null);
      return;
    }
    submit(next, undefined);
  }

  const editorOpen = editor !== null;
  const reasonMode = editor === "reason";

  return (
    <div className="flex flex-col gap-1.5" data-testid={`scout-shortlist-${workerId}`}>
      <div className="flex flex-wrap gap-1.5">
        {order.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => choose(s)}
              aria-pressed={active}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                active
                  ? "border-brand-blue bg-brand-blue/15 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary",
              )}
            >
              {labels.statuses[s]}
            </button>
          );
        })}
      </div>

      {/* Stored internal note (extension B) — shown on the card with the
          honest company-only hint; edit reuses the same inline editor. */}
      {note !== null && !editorOpen ? (
        <div
          className="flex flex-col gap-0.5 rounded-md border border-ink-500/70 bg-ink-800/60 px-2.5 py-1.5"
          data-testid={`scout-shortlist-note-${workerId}`}
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.note.label} · {labels.note.internalHint}
          </span>
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-text-secondary">
            {note}
          </p>
        </div>
      ) : null}

      {!editorOpen ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditor("note");
            setDraft(note ?? "");
            setError(null);
          }}
          className="w-fit text-[11px] font-medium text-brand-blue hover:text-brand-cyan disabled:opacity-50"
          data-testid={`scout-shortlist-note-toggle-${workerId}`}
        >
          {note === null ? labels.note.add : labels.note.edit}
        </button>
      ) : (
        <div
          className="flex flex-col gap-1.5 rounded-md border border-ink-500 bg-ink-800/60 p-2.5"
          data-testid={`scout-shortlist-editor-${workerId}`}
          data-mode={editor}
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {reasonMode ? labels.note.reasonTitle : labels.note.label} ·{" "}
            {labels.note.internalHint}
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={SHORTLIST_NOTE_MAX}
            rows={3}
            placeholder={reasonMode ? labels.note.reasonPlaceholder : labels.note.placeholder}
            className="w-full rounded-md border border-ink-500 bg-ink-900 px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
            data-testid={`scout-shortlist-note-input-${workerId}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || (reasonMode && draft.trim() === "")}
              onClick={() =>
                reasonMode
                  ? submit("not_fit", draft)
                  : submit(status ?? "saved", draft.trim() === "" ? null : draft)
              }
              className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
              data-testid={`scout-shortlist-note-save-${workerId}`}
            >
              {labels.note.save}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditor(null);
                setDraft("");
                setError(null);
              }}
              className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
            >
              {labels.note.cancel}
            </button>
            {reasonMode && draft.trim() === "" ? (
              <span className="text-[11px] text-state-amber">
                {labels.note.reasonRequired}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {error ? (
        <p className="text-[11px] text-state-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
