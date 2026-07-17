/**
 * VAT display layer v1 — PUBLIC-CALCULATOR-ONLY view over the engine output.
 *
 * DESIGN DECISION (European Work & Project Calculator v1, documented in
 * docs/product/european-work-project-calculator-v1.md): VAT is NOT added to
 * the shared estimate engine (lib/estimate/estimate.ts) in this wave. The
 * engine and its stored `customer_requests.payload.estimate` shape
 * (ESTIMATE_VERSION = 1) stay byte-identical, so the authenticated demand
 * wizard, server recompute and every stored payload keep parsing exactly as
 * before. This module is a pure DISPLAY layer the public calculator lays on
 * top of an already-computed engine result.
 *
 * Honesty rules:
 *  - VAT appears ONLY when the user explicitly entered a VAT percentage —
 *    no country VAT registry, no invented default rate;
 *  - the engine's estimatedTotal is shown as the sub-total EXCLUDING VAT,
 *    then the VAT line, then the total INCLUDING VAT — all three visible.
 */

/** Version of this display layer (CSV provenance). */
export const VAT_DISPLAY_VERSION = 1;

export interface VatDisplay {
  /** The user-entered percentage (0–100). */
  readonly vatPercent: number;
  /** Engine estimatedTotal — the sub-total EXCLUDING VAT. */
  readonly netTotal: number;
  /** netTotal × vatPercent. */
  readonly vatAmount: number;
  /** netTotal + vatAmount. */
  readonly grossTotal: number;
}

/** Round to 2 decimals — same policy as lib/estimate/estimate.ts (round2). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the VAT display. Returns null — meaning "show no VAT lines at
 * all" — when the user did not enter a usable percentage (null / undefined /
 * NaN / out of 0–100). An explicitly entered 0 IS displayed (e.g. reverse
 * charge), because the user stated it.
 */
export function computeVatDisplay(
  estimatedTotal: number,
  vatPercent: number | null | undefined,
): VatDisplay | null {
  if (vatPercent == null) return null;
  if (typeof vatPercent !== "number" || !Number.isFinite(vatPercent)) return null;
  if (vatPercent < 0 || vatPercent > 100) return null;
  if (typeof estimatedTotal !== "number" || !Number.isFinite(estimatedTotal)) {
    return null;
  }
  const netTotal = round2(Math.max(0, estimatedTotal));
  const vatAmount = round2(netTotal * (vatPercent / 100));
  return {
    vatPercent,
    netTotal,
    vatAmount,
    grossTotal: round2(netTotal + vatAmount),
  };
}

/**
 * Parse the raw text of the calculator's VAT input into the module's
 * "entered or not" contract: empty / whitespace → null (not entered);
 * anything else → Number(...) (which may still be rejected by
 * computeVatDisplay when out of range).
 */
export function parseVatPercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
