"use client";

import { useState } from "react";

/** A native <details> that mounts its (client-heavy) children only once opened. */
export function ExploreFold({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <section className="mx-auto max-w-container px-6 py-6 sm:px-12">
      <details
        data-testid="explore-steps"
        className="rounded-3xl bg-ink-800"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) setOpened(true);
        }}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-3xl px-6 py-5 font-display text-xl font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
          {summary}
          <span aria-hidden className="text-brand-blue">
            +
          </span>
        </summary>
        <div className="pb-6">{opened ? children : null}</div>
      </details>
    </section>
  );
}
