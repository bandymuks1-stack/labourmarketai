import type { ReactNode } from "react";

/** Rows a long list shows before the rest open in place (responsive pass
 *  2026-11-22). The caller orders the rows, so what matters most is on show. */
export const FOLDED_ROWS_VISIBLE = 5;

/**
 * ONE long-list fold for the workspace: the first rows, then the rest behind
 * a "Show all (n)" row (`common.disclosure.showAll`) that opens in place. No
 * row is removed. Plain <details>, so it works in server and client
 * components alike. Without `showAll` the list renders whole.
 */
export function FoldedRows<T>({
  rows,
  showAll,
  testId,
  render,
  listClassName = "flex flex-col gap-2",
}: {
  rows: readonly T[];
  showAll?: (count: number) => string;
  testId: string;
  render: (row: T) => ReactNode;
  listClassName?: string;
}) {
  const fold = showAll && rows.length > FOLDED_ROWS_VISIBLE;
  const shown = fold ? rows.slice(0, FOLDED_ROWS_VISIBLE) : rows;
  return (
    <>
      <ul className={listClassName}>{shown.map(render)}</ul>
      {fold ? (
        <details className="group" data-testid={testId}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-medium text-brand-blue [&::-webkit-details-marker]:hidden">
            {showAll(rows.length)}
          </summary>
          <ul className={`mt-2 ${listClassName}`}>{rows.slice(FOLDED_ROWS_VISIBLE).map(render)}</ul>
        </details>
      ) : null}
    </>
  );
}
