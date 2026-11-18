import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * ONE FILTER BAR — search, filters, sort and the result count in one row
 * that wraps on a phone.
 *
 * It is a layout with a contract, not a data component: the caller passes
 * the controls (the shared `Input`, `Select`, `DarkListbox`, chips), so a
 * plain GET form, a client filter and a saved-search strip all fit. Pass
 * `as="form"` with `action`/`method` for a GET search that works without
 * JavaScript. The result line is announced politely when it changes.
 *
 *   <FilterBar
 *     label={t("filters")}
 *     search={<Input type="search" name="q" … />}
 *     filters={<><Select … /><Select … /></>}
 *     sort={<Select … />}
 *     result={t("results", { count })}
 *   />
 */
export function FilterBar({
  label,
  search,
  filters,
  sort,
  result,
  actions,
  as = "div",
  action,
  method,
  testId,
  className,
}: {
  /** Accessible name of the group. */
  label: string;
  search?: ReactNode;
  filters?: ReactNode;
  sort?: ReactNode;
  /** e.g. "24 results" — the caller's already-localised sentence. */
  result?: ReactNode;
  /** e.g. a submit button, "clear filters", "save this search". */
  actions?: ReactNode;
  as?: "div" | "form";
  action?: string;
  method?: "get" | "post";
  testId?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        {search && <div className="min-w-0 flex-1 basis-56">{search}</div>}
        {filters && <div className="flex min-w-0 flex-wrap items-end gap-2">{filters}</div>}
        {sort && <div className="min-w-0 sm:ml-auto">{sort}</div>}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {result && (
        <p aria-live="polite" className="text-xs text-text-muted">
          {result}
        </p>
      )}
    </>
  );
  const shared = {
    "aria-label": label,
    "data-testid": testId,
    className: cn("flex min-w-0 flex-col gap-2", className),
  };
  return as === "form" ? (
    <form role="search" action={action} method={method} {...shared}>
      {body}
    </form>
  ) : (
    <div role="group" {...shared}>
      {body}
    </div>
  );
}
