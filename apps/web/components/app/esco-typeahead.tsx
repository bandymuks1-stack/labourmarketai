"use client";

import { useEffect, useRef, useState } from "react";

import { ESCO_AUTOCOMPLETE_ENABLED } from "@/lib/config/esco";
import { searchEscoLabelsAction } from "@/lib/taxonomy/esco-autocomplete-actions";
import type { EscoSuggestion } from "@/lib/taxonomy/esco-autocomplete";
import { cn } from "@/lib/utils";

/**
 * Deterministic ESCO typeahead input (Etapas 1D) — dark suggestion list in
 * the DarkListbox visual family (no native datalist / white OS popup).
 *
 * Ships UNWIRED + flag-off: renders nothing while ESCO_AUTOCOMPLETE_ENABLED
 * is false (draft migrations not applied / import not run). The flag-flip
 * slice wires it into the profile / onboarding / journal inputs. A pick is
 * the HUMAN's structured choice — Level 0 self-declared input, never a
 * verification (design doc §1).
 */
export function EscoTypeahead({
  locale,
  conceptType,
  placeholder,
  ariaLabel,
  onPick,
  className,
  name,
  required,
}: {
  readonly locale: string;
  readonly conceptType: "occupation" | "skill";
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly onPick?: (s: EscoSuggestion) => void;
  readonly className?: string;
  /** When set, the input submits its text as this form field — the wiring
   *  mode: typed free text stays valid, a pick fills the canonical label. */
  readonly name?: string;
  readonly required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly EscoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!ESCO_AUTOCOMPLETE_ENABLED) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const seq = ++seqRef.current;
    const t = setTimeout(() => {
      void searchEscoLabelsAction({ query: q, locale, conceptType }).then(
        (r) => {
          if (seqRef.current !== seq) return; // stale response
          setSuggestions(r.suggestions);
          setOpen(r.suggestions.length > 0);
        },
      );
    }, 150);
    return () => clearTimeout(t);
  }, [query, locale, conceptType]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!ESCO_AUTOCOMPLETE_ENABLED) return null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        name={name}
        required={required}
        className="w-full rounded-md border border-border-default bg-surface-1 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-brand-blue"
        data-testid={`esco-typeahead-${conceptType}`}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute inset-x-0 z-30 mt-1 max-h-64 overflow-auto rounded-md border border-ink-500 bg-ink-900/95 p-1 shadow-card"
        >
          {suggestions.map((s) => (
            <li key={s.conceptId}>
              <button
                type="button"
                onClick={() => {
                  onPick?.(s);
                  setQuery(s.label);
                  setOpen(false);
                }}
                className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm text-text-secondary hover:bg-ink-700"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
