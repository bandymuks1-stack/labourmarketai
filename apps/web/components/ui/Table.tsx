import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TableColumn = {
  readonly key: string;
  readonly header: ReactNode;
  /** Numbers and amounts align to the end. */
  readonly align?: "start" | "end";
  /** Hide this column below `md`; keep the columns a phone needs. */
  readonly wideOnly?: boolean;
};

export type TableRow = {
  readonly id: string;
  readonly cells: Readonly<Record<string, ReactNode>>;
};

/**
 * ONE TABLE — for data that is compared across columns (hours, amounts,
 * dates). For records a person opens, use `ListRow`, not a table.
 *
 * A real `<table>` with a caption and column headers. It scrolls sideways
 * inside its own box when it is wider than the screen, so the page itself
 * never scrolls sideways. The first column is the row header. An empty table
 * says so in words; an unknown value is shown by the caller as a dash or
 * words, never as zero.
 */
export function Table({
  caption,
  captionHidden = false,
  columns,
  rows,
  empty,
  testId,
  className,
}: {
  caption: ReactNode;
  /** Keep the caption for screen readers only (a visible heading names it). */
  captionHidden?: boolean;
  columns: readonly TableColumn[];
  rows: readonly TableRow[];
  /** Shown instead of the body when there are no rows. */
  empty: ReactNode;
  testId?: string;
  className?: string;
}) {
  const cell = (c: TableColumn) =>
    cn(
      "px-3 py-3 align-top",
      c.align === "end" ? "text-end tabular-nums" : "text-start",
      c.wideOnly && "hidden md:table-cell",
    );
  return (
    <div
      data-testid={testId}
      className={cn("min-w-0 overflow-x-auto rounded-xl border border-ink-600 bg-ink-900/40", className)}
    >
      <table className="w-full border-collapse text-sm text-text-primary">
        <caption
          className={cn(
            captionHidden
              ? "sr-only"
              : "px-3 pb-2 pt-3 text-start font-display text-base font-semibold text-text-primary",
          )}
        >
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-ink-600">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(cell(c), "font-mono text-xs font-normal uppercase tracking-label text-text-muted")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-sm text-text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-ink-600/60 last:border-b-0">
                {columns.map((c, i) =>
                  i === 0 ? (
                    <th key={c.key} scope="row" className={cn(cell(c), "font-medium")}>
                      {r.cells[c.key]}
                    </th>
                  ) : (
                    <td key={c.key} className={cn(cell(c), "text-text-secondary")}>
                      {r.cells[c.key]}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
