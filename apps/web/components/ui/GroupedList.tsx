import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ListGroup = {
  readonly id: string;
  readonly title: ReactNode;
  /** A real count from the data, or omit it. Never an estimate. */
  readonly count?: number;
  /** One short line under the title, e.g. the company a team belongs to. */
  readonly note?: ReactNode;
  /** `ListRow` elements. */
  readonly rows: ReactNode;
  /** Shown instead of the rows when the group is empty. */
  readonly empty?: ReactNode;
};

/**
 * ONE STRUCTURE VIEW — records grouped under headings: people by team, teams
 * by company, needs by project.
 *
 * Deliberately simple: a heading per group with its count, then a list of
 * shared `ListRow`s. It draws no tree lines and no org chart; a structure is
 * read as "these belong to that". Groups are native `<details>` when
 * `collapsible`, so they open and close with the keyboard and without
 * JavaScript. An empty group says so in words instead of disappearing.
 */
export function GroupedList({
  label,
  groups,
  collapsible = false,
  headingLevel = "h3",
  testId,
  className,
}: {
  /** Accessible name of the whole structure. */
  label: string;
  groups: readonly ListGroup[];
  collapsible?: boolean;
  headingLevel?: "h2" | "h3" | "h4";
  testId?: string;
  className?: string;
}) {
  const Heading = headingLevel;
  const head = (g: ListGroup) => (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <Heading className="truncate font-display text-base font-semibold text-text-primary">
        {g.title}
      </Heading>
      {typeof g.count === "number" && (
        <span className="shrink-0 font-mono text-xs text-text-muted">{g.count}</span>
      )}
      {g.note && <span className="truncate text-xs text-text-muted">{g.note}</span>}
    </span>
  );
  const body = (g: ListGroup) =>
    g.count === 0 && g.empty ? (
      <p className="px-3 py-3 text-sm text-text-muted">{g.empty}</p>
    ) : (
      <ul className="rounded-xl border border-ink-600 bg-ink-900/40">{g.rows}</ul>
    );
  return (
    <section aria-label={label} data-testid={testId} className={cn("flex min-w-0 flex-col gap-4", className)}>
      {groups.map((g) =>
        collapsible ? (
          <details key={g.id} open className="group flex flex-col gap-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1 [&::-webkit-details-marker]:hidden">
              {head(g)}
            </summary>
            <div className="mt-2">{body(g)}</div>
          </details>
        ) : (
          <div key={g.id} className="flex flex-col gap-2">
            <div className="flex min-h-11 items-center gap-2 px-1">{head(g)}</div>
            {body(g)}
          </div>
        ),
      )}
    </section>
  );
}
