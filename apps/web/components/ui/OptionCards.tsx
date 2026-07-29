"use client";

import { cn } from "@/lib/utils";

/**
 * Mobile-first single-select control for a SMALL finite set (2–7 options).
 *
 * Replaces clumsy native <select> dropdowns: every option is a tap target shown
 * inline, so the user picks in one tap without a native modal stealing the page
 * context (owner mobile review, Product Logic + Mobile UX Correction Sprint v1).
 *
 * Built on native <input type="radio"> so it works two ways with no extra wiring:
 *   - Uncontrolled + `name` → the value is submitted in FormData (server-action
 *     forms keep working exactly like the <select> they replace).
 *   - Controlled `value` + `onChange` → behaves like a controlled input for
 *     client-state forms.
 *
 * Native radios also give free keyboard + screen-reader semantics (arrow keys,
 * radiogroup role).
 */
export interface OptionCardItem {
  readonly value: string;
  readonly label: string;
  /** Optional one-line helper shown under the label. */
  readonly hint?: string;
}

export function OptionCards({
  name,
  options,
  value,
  defaultValue,
  onChange,
  ariaLabel,
  columns = 2,
  testId,
  disabled,
}: {
  readonly name: string;
  readonly options: readonly OptionCardItem[];
  /** Controlled selected value. Omit for an uncontrolled (FormData) field. */
  readonly value?: string;
  /** Uncontrolled initial value (FormData mode). */
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly ariaLabel?: string;
  /** Grid columns on >= sm. 1 = stacked list. Default 2. */
  readonly columns?: 1 | 2 | 3;
  readonly testId?: string;
  readonly disabled?: boolean;
}) {
  const controlled = value !== undefined;
  const gridCols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid gap-2", gridCols)}
      data-testid={testId}
    >
      {options.map((opt) => {
        const selected = controlled ? value === opt.value : undefined;
        return (
          <label
            key={opt.value}
            className={cn(
              "group relative flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2.5 text-sm transition-colors",
              "border-border-default bg-surface-1 text-text-secondary",
              "hover:border-brand-blue/60",
              "has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue/10 has-[:checked]:text-text-primary",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-blue/50",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              {...(controlled
                ? { checked: selected }
                : { defaultChecked: defaultValue === opt.value })}
              onChange={() => onChange?.(opt.value)}
              disabled={disabled}
              className="sr-only"
              data-testid={testId ? `${testId}-${opt.value}` : undefined}
            />
            <span className="flex items-center justify-between gap-2 font-medium">
              {opt.label}
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full border border-border-default group-has-[:checked]:border-brand-blue group-has-[:checked]:bg-brand-blue"
              />
            </span>
            {opt.hint ? (
              <span className="text-meta leading-snug text-text-muted">
                {opt.hint}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
