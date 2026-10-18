"use client";

/**
 * MY SPACE — the pinned row (owner contract 2026-09-04 §4C).
 *
 * "A simple personal workspace analogous to a computer desktop": the
 * person's OWN shortcuts, always visible above the conversation, each one a
 * reference the chat already understands (`handleChip` vocabulary). It
 * renders nothing when there is nothing pinned — the desktop is never
 * pre-filled. Tapping a pin runs the same handler its chip runs; "manage"
 * opens the unpin chips inside the conversation. No second action system.
 */
export interface MySpacePinView {
  readonly ref: string;
  readonly label: string;
}

export function MySpaceRow({
  pins,
  title,
  manageLabel,
  onPin,
  onManage,
}: {
  pins: readonly MySpacePinView[];
  title: string;
  manageLabel: string;
  onPin: (ref: string) => void;
  onManage: () => void;
}) {
  if (pins.length === 0) return null;
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto border-b border-border-subtle px-3 py-2"
      data-testid="my-space-row"
      role="toolbar"
      aria-label={title}
    >
      <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">{title}</span>
      {pins.map((p) => (
        <button
          key={p.ref}
          type="button"
          onClick={() => onPin(p.ref)}
          className="ua-press min-h-11 shrink-0 rounded-full border border-ink-500 bg-ink-800 px-4 text-support font-medium text-text-primary hover:border-brand-blue hover:text-brand-blue"
          data-testid="my-space-pin"
          data-ref={p.ref}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onManage}
        className="ua-press min-h-11 shrink-0 rounded-full px-3 text-support text-text-muted hover:text-text-primary"
        data-testid="my-space-manage"
      >
        {manageLabel}
      </button>
    </div>
  );
}
