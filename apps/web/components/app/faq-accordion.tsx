"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Keyboard-accessible accordion (no JS library — React state only). One
 *  panel open at a time. Smooth 200ms height via the grid-rows 0fr→1fr
 *  technique, which also collapses cleanly under reduced-motion. */
export function FAQAccordion({
  items,
  expandAria,
}: {
  items: { q: string; a: string }[];
  expandAria: string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <div className="divide-y divide-ink-600/60 border-y border-ink-600/60">
      {items.map((it, i) => {
        const isOpen = open === i;
        const btnId = `${base}-b${i}`;
        const panelId = `${base}-p${i}`;
        return (
          <div key={it.q}>
            <h3 className="m-0">
              <button
                type="button"
                id={btnId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={isOpen ? undefined : `${expandAria}: ${it.q}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left"
              >
                <span className="font-display text-base font-semibold text-text-primary">
                  {it.q}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 font-mono text-lg text-brand-blue transition-transform duration-200",
                    isOpen && "rotate-45",
                  )}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              inert={!isOpen}
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="pb-5 text-sm leading-relaxed text-text-secondary">
                  {it.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
