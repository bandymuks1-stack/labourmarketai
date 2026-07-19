"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type {
  JournalDirection,
  JournalEngagement,
  JournalSkill,
} from "@/components/app/journal-entry-composer";
import { JournalEntryCompactEditor } from "@/components/app/journal-entry-compact-editor";
import type { JournalEditingEntry } from "@/lib/journal/edit-entry";
import { recordEvent } from "@/lib/telemetry/task";

/**
 * Edit-in-place launcher for one journal entry (journal compact edit UX, P0).
 *
 * Opens the COMPACT editor in edit mode inside a compact drawer — a bottom
 * sheet on phones, a side panel on wider screens. The compact editor shows
 * ONLY the entry text + one activity-row list (skill + its time together) +
 * one sticky save; the full composer review matrix never renders here
 * (production incident: editing opened a page-length multi-bucket matrix
 * whose "Pridėti" taps looked saved but weren't).
 *
 * Saving still goes through the ONE existing `supersedeJournalEntry` path;
 * its `revalidatePath` refreshes the list in place, and the drawer closes.
 * While the form is DIRTY, closing (backdrop / Escape / ✕ / cancel) asks for
 * confirmation — edits are never silently discarded.
 *
 * The `?editing=<id>` URL flow on the journal page stays untouched (planning
 * deep-links still use it); this launcher is the row's default path.
 * Only unconfirmed entries ever receive this control (same rule as before —
 * the RPC re-enforces it server-side).
 */
export function JournalEntryEditLauncher({
  entry,
  engagements,
  directions,
  workerSkills,
}: {
  entry: JournalEditingEntry;
  engagements: JournalEngagement[];
  directions: JournalDirection[];
  workerSkills: JournalSkill[];
}) {
  const t = useTranslations("journal");
  const [open, setOpen] = useState(false);
  // Dirty flag reported by the compact editor — close paths confirm first.
  const dirtyRef = useRef(false);

  function requestClose(): void {
    if (
      dirtyRef.current &&
      !window.confirm(t("compactEdit.confirmDiscard"))
    ) {
      return;
    }
    dirtyRef.current = false;
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          recordEvent("journal_edit_clicked");
          setOpen(true);
        }}
        className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue active:border-brand-blue"
        data-testid={`journal-entry-edit-${entry.id}`}
      >
        {t("entry.edit")}
      </button>
      {open && (
        <EditEntrySheet
          title={t("editEntryTitle")}
          closeLabel={t("editEntryCancel")}
          onClose={requestClose}
          testId={`journal-edit-sheet-${entry.id}`}
        >
          <JournalEntryCompactEditor
            // Fresh mount per open so the edit always starts from the entry's
            // saved state (same remount rule the page-level edit flow pins).
            key={entry.id}
            entry={entry}
            engagements={engagements}
            directions={directions}
            workerSkills={workerSkills}
            onDirtyChange={(dirty) => {
              dirtyRef.current = dirty;
            }}
            onSaved={() => {
              dirtyRef.current = false;
              setOpen(false);
            }}
            onCancel={requestClose}
          />
        </EditEntrySheet>
      )}
    </>
  );
}

/**
 * Compact responsive drawer: slides up as a bottom sheet on phones and sits
 * as a right-side panel on md+ screens — one principle, two widths. Portal'd
 * to document.body so `position: fixed` anchors to the viewport (same reason
 * as `MobileSheet`), with body scroll locked while open and Escape/backdrop
 * to close. The page underneath is left exactly as it was.
 */
function EditEntrySheet({
  title,
  closeLabel,
  onClose,
  testId,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  // SSR-safe portal: only render once the DOM is available.
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    // Move focus into the drawer so keyboard users land on the edit surface.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onEsc);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      aria-modal="true"
      data-testid={testId}
      className="fixed inset-0 z-50 flex flex-col justify-end md:flex-row md:justify-end"
    >
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative mt-auto flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-ink-500 bg-ink-900 pb-[env(safe-area-inset-bottom)] shadow-card outline-none md:mt-0 md:h-full md:max-h-none md:w-full md:max-w-xl md:rounded-none md:border-l md:border-t-0"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-ink-600 bg-ink-900/95 px-4 py-3 backdrop-blur">
          <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex min-h-[2.25rem] items-center rounded-md border border-ink-500 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3 sm:px-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
