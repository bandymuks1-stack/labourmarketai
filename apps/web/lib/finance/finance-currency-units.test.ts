import { describe, expect, it } from "vitest";

import { deriveFinanceSummary, formatCentsAsEur } from "@/lib/finance/finance-model";
import { minorToDecimalString } from "@/lib/finance/invoice-currency";

/**
 * The finance register writes amounts by the currency's own minor unit and
 * never adds amounts in different currencies. Today's register is EUR-only by
 * its CHECK, so its output is unchanged; the rule exists for the multi-currency
 * invoices that follow (#2203).
 */
const now = new Date("2026-11-18T12:00:00Z");
const row = (currency: string, amountCents: number) => ({
  recordType: "invoice_issued" as const,
  status: "issued" as const,
  amountCents,
  dueDate: null,
  projectId: null,
  currency,
});

describe("finance amounts by minor unit", () => {
  it("EUR prints exactly as before", () => {
    for (const c of [0, 1, 99, 100, 12_345, -250, 1_000_000_07]) {
      expect(minorToDecimalString(c, "EUR")).toBe(formatCentsAsEur(c));
    }
  });

  it("a summary of one currency is computed; mixed currencies are refused, never added", () => {
    expect(() => deriveFinanceSummary([row("EUR", 100), row("EUR", 250)], now)).not.toThrow();
    expect(() => deriveFinanceSummary([row("EUR", 100), row("SEK", 250)], now)).toThrow(/refusing to sum across currencies \(EUR,SEK\)/);
  });

  it("records without a currency field keep the old behaviour", () => {
    const { currency: _c, ...bare } = row("EUR", 100);
    void _c;
    expect(() => deriveFinanceSummary([bare, bare], now)).not.toThrow();
  });
});
