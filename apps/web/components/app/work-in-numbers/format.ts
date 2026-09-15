/**
 * Number formatting shared by every Work-in-Numbers surface. Dates never
 * pass through here — they go through `formatUtcDate` (W12: one display
 * zone, UTC), so no `Intl.DateTimeFormat` is constructed in this module.
 */

export function fmtHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hours);
}

export function fmtPct(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
}

/** `t(key, values)` as the components receive it — pre-bound to a
 *  namespace by the caller, so a component never chooses a namespace. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;
