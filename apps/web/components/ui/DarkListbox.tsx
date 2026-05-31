"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical dark listbox — the single reusable replacement for native
 * `<select>` / styled-native `<Select>` controls that open a white OS picker
 * on mobile and break the dark Industrial Intelligence UI.
 *
 * Drop-in for a controlled select: pass `value` + `onChange(value)` +
 * `options`. For a `<form>`-submitted field, also pass `name` and the
 * component renders a hidden input so FormData is unchanged (no business-logic
 * change). Closes on outside click + Escape; arrow/Enter keyboard nav; the open
 * panel is dark, scrollable, and uses large touch targets + existing tokens.
 */
export type DarkListboxOption = {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
};

export function DarkListbox({
  value,
  onChange,
  options,
  name,
  disabled = false,
  placeholder,
  ariaLabel,
  className,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly DarkListboxOption[];
  name?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const buttonLabel = selected?.label ?? placeholder ?? "";

  // Close on outside click + Escape (mobile-portrait friendly).
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const from =
        activeIndex < 0 ? options.findIndex((o) => o.value === value) : activeIndex;
      setActiveIndex(Math.max(0, Math.min(options.length - 1, from + dir)));
    } else if (e.key === "Enter" || e.key === " ") {
      if (open && activeIndex >= 0) {
        e.preventDefault();
        const o = options[activeIndex];
        if (o && !o.disabled) commit(o.value);
      } else if (!open) {
        e.preventDefault();
        setOpen(true);
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-left text-sm text-text-primary outline-none transition-colors focus:border-brand-blue disabled:opacity-50"
      >
        <span className={cn("truncate", !selected && "text-text-muted")}>
          {buttonLabel}
        </span>
        <span aria-hidden className="shrink-0 text-text-muted">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          id={listboxId}
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border border-ink-500 bg-ink-900 p-1 shadow-card"
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isActive = i === activeIndex;
            return (
              <li key={o.value || `opt-${i}`} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  disabled={o.disabled}
                  onClick={() => !o.disabled && commit(o.value)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2.5 text-left text-sm",
                    isSelected ? "text-brand-blue" : "text-text-primary",
                    isActive && !o.disabled && "bg-ink-700",
                    o.disabled && "cursor-not-allowed text-text-muted",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {isSelected ? (
                    <span aria-hidden className="shrink-0 text-brand-blue">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
