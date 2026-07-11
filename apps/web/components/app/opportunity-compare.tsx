"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  COMPARE_FACT_KEYS,
  COMPARE_MAX,
  COMPARE_MIN,
  type CompareEntry,
  type CompareFactKey,
} from "@/lib/opportunities/compare-facts";

/**
 * Client-side compare for the worker opportunities board (P2-PR5).
 *
 * PURE CLIENT STATE over cards that are ALREADY loaded and authorized on the
 * board: selecting 2–3 cards opens a side-by-side table of the whitelisted
 * facts only (COMPARE_FACT_KEYS — every value precomputed server-side, gaps
 * shown as the honest localized "not stated"). Nothing is persisted, nothing
 * is fetched, nothing is sent — closing the page forgets the selection.
 * Mobile-first: the table scrolls horizontally INSIDE its own container.
 */

interface CompareContextValue {
  readonly selected: readonly CompareEntry[];
  readonly toggle: (entry: CompareEntry) => void;
  readonly clear: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function OpportunityCompareProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<readonly CompareEntry[]>([]);

  const toggle = useCallback((entry: CompareEntry) => {
    setSelected((prev) => {
      if (prev.some((e) => e.id === entry.id)) {
        return prev.filter((e) => e.id !== entry.id);
      }
      if (prev.length >= COMPARE_MAX) return prev;
      return [...prev, entry];
    });
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const value = useMemo(() => ({ selected, toggle, clear }), [selected, toggle, clear]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error("Compare components must be mounted inside OpportunityCompareProvider");
  }
  return ctx;
}

/** Per-card compare selector — a REAL pressed-state chip (aria-pressed). */
export function CompareToggleChip({
  entry,
  label,
}: {
  entry: CompareEntry;
  label: string;
}) {
  const { selected, toggle } = useCompare();
  const isSelected = selected.some((e) => e.id === entry.id);
  const full = !isSelected && selected.length >= COMPARE_MAX;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => toggle(entry)}
      disabled={full}
      className={`inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
        isSelected
          ? "border-brand-blue bg-brand-blue/10 text-text-primary"
          : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
      }`}
      data-testid={`compare-toggle-${entry.id}`}
      data-selected={isSelected ? "true" : "false"}
    >
      <span aria-hidden className="font-mono text-[11px] text-text-muted">
        {isSelected ? "✓" : "⇄"}
      </span>
      {label}
    </button>
  );
}

/**
 * Sticky bottom selection bar + the compare table. Renders nothing until at
 * least one card is selected; the Compare button unlocks at COMPARE_MIN.
 */
export function CompareBar({
  labels,
  factLabels,
}: {
  labels: {
    /** Label rendered as "{selectedLabel}: {count}". */
    selectedLabel: string;
    open: string;
    close: string;
    clear: string;
    limitNote: string;
    title: string;
  };
  factLabels: Readonly<Record<CompareFactKey, string>>;
}) {
  const { selected, clear } = useCompare();
  const [open, setOpen] = useState(false);
  if (selected.length === 0) {
    return null;
  }
  const canCompare = selected.length >= COMPARE_MIN;
  const showTable = open && canCompare;

  return (
    <>
      {/* In-flow spacer so the fixed bar never covers the last card. */}
      <div aria-hidden className="h-16" data-testid="compare-bar-spacer" />
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600 bg-ink-900/95 backdrop-blur"
        data-testid="compare-bar"
      >
        {showTable ? (
          <div
            role="dialog"
            aria-modal="false"
            aria-label={labels.title}
            className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 pt-3"
            data-testid="compare-table-panel"
          >
            <h2 className="font-display text-sm font-semibold text-text-primary">
              {labels.title}
            </h2>
            {/* Horizontal scroll INSIDE this container — never page-level. */}
            <div className="max-h-[55vh] overflow-y-auto overflow-x-auto rounded-md border border-ink-600">
              <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-600">
                    <th scope="col" className="sr-only">
                      {labels.title}
                    </th>
                    {selected.map((e) => (
                      <th
                        key={e.id}
                        scope="col"
                        className="min-w-[9rem] px-3 py-2 align-top font-display text-xs font-bold text-text-primary"
                      >
                        {e.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_FACT_KEYS.map((key) => (
                    <tr key={key} className="border-b border-ink-700 last:border-b-0">
                      <th
                        scope="row"
                        className="min-w-[7rem] px-3 py-2 align-top font-mono text-[10px] uppercase tracking-label text-text-muted"
                      >
                        {factLabels[key]}
                      </th>
                      {selected.map((e) => (
                        <td
                          key={e.id}
                          className="min-w-[9rem] px-3 py-2 align-top text-text-secondary"
                          data-fact={key}
                        >
                          {e.facts[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <span className="text-xs text-text-secondary" data-testid="compare-count">
            {labels.selectedLabel}: {selected.length}
            {!canCompare ? (
              <span className="text-text-muted"> · {labels.limitNote}</span>
            ) : null}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={!canCompare}
              aria-expanded={showTable}
              className="inline-flex min-h-[2.75rem] items-center rounded-md bg-brand-blue px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-40"
              data-testid="compare-open"
            >
              {showTable ? labels.close : labels.open}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                clear();
              }}
              className="inline-flex min-h-[2.75rem] items-center rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
              data-testid="compare-clear"
            >
              {labels.clear}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
