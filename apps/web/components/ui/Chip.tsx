import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors motion-reduce:transition-none";

/**
 * TOGGLE CHIP — a filter or a choice that is on or off. A real button with
 * `aria-pressed`; the pressed state shows a check mark as well as colour, so
 * it never depends on colour alone.
 */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
  disabled,
  className,
  testId,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        CHIP,
        "font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:cursor-not-allowed disabled:opacity-60",
        pressed
          ? "border-brand-blue bg-brand-blue/10 text-text-primary"
          : "border-ink-500 text-text-secondary hover:border-brand-blue/60 hover:text-text-primary",
        className,
      )}
    >
      {pressed && <Check aria-hidden className="h-4 w-4 shrink-0 text-brand-blue" />}
      {children}
    </button>
  );
}

/**
 * CHIP WITH A REMOVE CONTROL — a chosen value (a skill, a filter, a person)
 * that can be taken away. The label is text; the remove control is its own
 * button with its own accessible name and a 44px hit area.
 */
export function RemovableChip({
  children,
  onRemove,
  removeLabel,
  className,
  testId,
}: {
  children: ReactNode;
  onRemove: () => void;
  /** Full accessible name of the remove button, e.g. "Remove Welding". */
  removeLabel: string;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(CHIP, "border-ink-500 bg-ink-800/60 pr-0 text-text-primary", className)}
    >
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </span>
  );
}
