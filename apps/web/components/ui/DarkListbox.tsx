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
 *
 * ── SEARCHABLE (owner direction 2026-09-27, onboarding step 2)
 * A long list is not navigable by scrolling. Measured on production
 * onboarding: "Kur dabar gyveni?" offers every ISO country (249 — the
 * global-access rule, and correctly so), and the only way to reach Vokietija
 * was to scroll past ~230 others. `searchable` adds ONE filter input inside
 * the panel this component already owns — not a second select component, not
 * a second list of countries.
 *
 * The MATCH RULE stays with the caller (`match`), because what counts as
 * finding a thing is domain knowledge: a country answers to its localized
 * name, its ISO code and its documented aliases
 * (`lib/location/country-options.ts`), and a generic listbox must not hold a
 * second, weaker copy of that. The default is a plain case-insensitive
 * substring on the label.
 */
export type DarkListboxOption = {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
};

/** Case- and diacritic-insensitive fold for the default filter. A Lithuanian
 *  person types "plyteliu", not "plytelių", and a filter that ignores that
 *  finds nothing and reads as broken. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Default match: folded substring on the visible label. A domain with its own
 *  rule (countries) passes `match` instead. */
function defaultMatch(option: DarkListboxOption, query: string): boolean {
  return fold(option.label).includes(fold(query));
}

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
  searchable = false,
  searchPlaceholder,
  searchEmptyLabel,
  match = defaultMatch,
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
  /** Show a filter input inside the open panel (long lists). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Shown when the filter matches nothing — never an empty panel. */
  searchEmptyLabel?: string;
  /** Domain match rule for the filter; defaults to a label substring. */
  match?: (option: DarkListboxOption, query: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const buttonLabel = selected?.label ?? placeholder ?? "";
  // What the panel actually lists. Only a searchable listbox filters, so every
  // existing consumer keeps the exact list it passed in.
  const q = query.trim();
  const visible =
    searchable && q.length > 0 ? options.filter((o) => match(o, q)) : options;

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

  // A fresh open starts from the whole list, and the filter is reachable
  // without a second click: the person types straight away (the owner's
  // production complaint was having to scroll at all).
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setActiveIndex(-1);
    if (searchable) searchRef.current?.focus();
  }, [open, searchable]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
  }

  /** Arrow/Enter over the VISIBLE rows — shared by the button and the filter
   *  input, so keyboard use survives the focus moving into the search field. */
  function onNavKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const from =
        activeIndex < 0
          ? visible.findIndex((o) => o.value === value)
          : activeIndex;
      setActiveIndex(Math.max(0, Math.min(visible.length - 1, from + dir)));
    } else if (e.key === "Enter" || e.key === " ") {
      // A space is a character while typing a filter ("United Arab…"), never a
      // commit — only Enter commits from inside the search field.
      if (searchable && open && e.key === " ") return;
      if (open) {
        // Enter on a filtered list takes the one row the person is looking at:
        // the arrowed-to row, or — having typed "Vok" and seen one answer —
        // the first match, so the choice costs no extra keystroke.
        const target =
          activeIndex >= 0
            ? visible[activeIndex]
            : q.length > 0
              ? visible[0]
              : undefined;
        if (target && !target.disabled) {
          e.preventDefault();
          commit(target.value);
        }
      } else {
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
        onKeyDown={onNavKeyDown}
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
        // `left-0 right-0` keeps the panel exactly as wide as the field, so on
        // a phone it can never reach past the screen edge; the list scrolls
        // inside it instead of growing the page.
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-ink-500 bg-ink-900 p-1 shadow-card">
          {searchable && (
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={onNavKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder ?? ariaLabel}
              data-testid={testId ? `${testId}-search` : undefined}
              className="mb-1 min-h-11 w-full rounded-sm border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
            />
          )}
          {searchable && visible.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-text-muted">
              {searchEmptyLabel ?? ""}
            </p>
          ) : null}
          <ul
            role="listbox"
            id={listboxId}
            aria-label={ariaLabel}
            className="max-h-60 overflow-auto"
          >
            {visible.map((o, i) => {
              const isSelected = o.value === value;
              const isActive = i === activeIndex;
              return (
                <li
                  key={o.value || `opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                >
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
        </div>
      )}
    </div>
  );
}
