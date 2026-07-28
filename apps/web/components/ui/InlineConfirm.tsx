"use client";

import { useEffect, useRef, useState } from "react";

/**
 * InlineConfirm — the ONE confirmation mechanism (W2).
 *
 * Single Workspace spec §6.2: confirmation is inline, two-step, and tiered.
 * It is never a blocking dialog, never `window.confirm`, and never a second
 * modal system. The affordance replaces the trigger in place, so the user
 * stays exactly where they were and can always back out.
 *
 * Tiers mirror the conversation action registry's `ConfirmationTier`, so the
 * conversation layer and the module screens agree on what "confirm" means:
 *
 *   reversible_write     → confirm once; the caller offers undo
 *   important_write      → confirm once, consequence named
 *   strong_irreversible  → confirm once, consequence named FIRST and the
 *                          confirm button carries the danger treatment
 *
 * Accessibility: the confirm step is announced (`role="status"`), focus moves
 * to the confirm button so keyboard users are never stranded, Escape cancels,
 * and focus returns to the trigger on cancel. Nothing is trapped, because
 * nothing is modal.
 */

export type ConfirmTier = "reversible_write" | "important_write" | "strong_irreversible";

export interface InlineConfirmProps {
  /** Button label in the resting state, e.g. "Delete". */
  readonly label: string;
  /** What the user is confirming, in words. Stated BEFORE the act. */
  readonly question: string;
  /** Confirm-step button label, e.g. "Yes, delete". */
  readonly confirmLabel: string;
  /** Cancel-step button label. */
  readonly cancelLabel: string;
  readonly tier?: ConfirmTier;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  /** Class for the resting trigger, so callers keep their existing visuals. */
  readonly className?: string;
  readonly testId?: string;
}

/**
 * The same mechanism, controlled by the caller instead of by its own trigger.
 * Used where the confirmation is raised by an EVENT rather than a click —
 * closing an editor with unsaved changes, for example. Same markup, same
 * semantics, same module: one confirmation architecture, two entry points.
 */
export function InlineConfirmBar({
  question,
  confirmLabel,
  cancelLabel,
  tier = "important_write",
  onConfirm,
  onCancel,
  testId,
}: {
  readonly question: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly tier?: ConfirmTier;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testId?: string;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  const danger = tier === "strong_irreversible";
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-surface-2 px-3 py-2"
      data-testid={testId}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <span className="text-xs text-text-secondary">{question}</span>
      <span className="ml-auto flex items-center gap-2">
        <button
          ref={confirmRef}
          type="button"
          className={
            danger
              ? "rounded-md bg-state-danger px-2 py-1 text-xs font-semibold text-white"
              : "rounded-md bg-brand-cyan px-2 py-1 text-xs font-semibold text-ink-900"
          }
          onClick={onConfirm}
          data-testid={testId ? `${testId}-yes` : undefined}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
          onClick={onCancel}
          data-testid={testId ? `${testId}-no` : undefined}
        >
          {cancelLabel}
        </button>
      </span>
    </div>
  );
}

export function InlineConfirm({
  label,
  question,
  confirmLabel,
  cancelLabel,
  tier = "important_write",
  onConfirm,
  disabled = false,
  className,
  testId,
}: InlineConfirmProps) {
  const [armed, setArmed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  function cancel() {
    setArmed(false);
    triggerRef.current?.focus();
  }

  if (!armed) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setArmed(true)}
        data-testid={testId}
      >
        {label}
      </button>
    );
  }

  const danger = tier === "strong_irreversible";

  return (
    <span
      role="status"
      className="inline-flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-surface-2 px-2 py-1"
      data-testid={testId ? `${testId}-armed` : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <span className="text-xs text-text-secondary">{question}</span>
      <button
        ref={confirmRef}
        type="button"
        className={
          danger
            ? "rounded-md bg-state-danger px-2 py-1 text-xs font-semibold text-white"
            : "rounded-md bg-brand-cyan px-2 py-1 text-xs font-semibold text-ink-900"
        }
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        data-testid={testId ? `${testId}-yes` : undefined}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        onClick={cancel}
        data-testid={testId ? `${testId}-no` : undefined}
      >
        {cancelLabel}
      </button>
    </span>
  );
}
