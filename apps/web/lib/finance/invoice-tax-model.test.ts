import { describe, expect, it } from "vitest";

import {
  TAX_TREATMENTS,
  computeInvoiceTotals,
  lineNetCents,
  lineTaxCents,
  validateTax,
} from "@/lib/finance/invoice-tax-model";

describe("invoice tax model - treatment is data, never inferred", () => {
  it("has exactly the six explicit treatments", () => {
    expect([...TAX_TREATMENTS]).toEqual([
      "standard",
      "reduced",
      "zero_rated",
      "reverse_charge",
      "exempt",
      "outside_scope",
    ]);
  });

  it("zero_rated and reverse_charge are DIFFERENT states with the same zero amount", () => {
    const z = computeInvoiceTotals([{ netCents: 10_000, treatment: "zero_rated" }]);
    const r = computeInvoiceTotals([{ netCents: 10_000, treatment: "reverse_charge", note: "ref" }]);
    expect(z.complete && r.complete).toBe(true);
    if (z.complete && r.complete) {
      expect(z.taxCents).toBe(0);
      expect(r.taxCents).toBe(0);
      expect(z.groups[0].treatment).toBe("zero_rated");
      expect(r.groups[0].treatment).toBe("reverse_charge");
      expect(z.groups[0].treatment).not.toBe(r.groups[0].treatment);
    }
  });

  it("standard/reduced need a positive rate; the others must be zero", () => {
    expect(validateTax({ treatment: "standard", ratePercent: 0 })).toEqual({ ok: false, reason: "rate_required" });
    expect(validateTax({ treatment: "standard" })).toEqual({ ok: false, reason: "rate_required" });
    expect(validateTax({ treatment: "reduced", ratePercent: 101 })).toEqual({ ok: false, reason: "rate_out_of_range" });
    expect(validateTax({ treatment: "zero_rated", ratePercent: 5 })).toEqual({ ok: false, reason: "rate_not_allowed" });
    expect(validateTax({ treatment: "reverse_charge", ratePercent: 17 })).toEqual({ ok: false, reason: "rate_not_allowed" });
    expect(validateTax({ treatment: "magic", ratePercent: 5 })).toEqual({ ok: false, reason: "unknown_treatment" });
    expect(validateTax({ treatment: null })).toEqual({ ok: false, reason: "unset" });
    expect(validateTax({ treatment: "exempt" })).toEqual({ ok: true, treatment: "exempt", ratePercent: 0 });
  });

  it("any configured rate works - no country is baked in (3.5, 7.5, 8.1, 25)", () => {
    for (const rate of [3.5, 7.5, 8.1, 25]) {
      const v = validateTax({ treatment: "standard", ratePercent: rate });
      expect(v.ok).toBe(true);
    }
  });
});

describe("invoice tax model - arithmetic (per-line rounding, half away from zero)", () => {
  it("rounds 333 x 7.5% = 24.975 UP to 25 (float 333*7.5/100 would give 24)", () => {
    expect(lineTaxCents(333, 7.5)).toBe(25);
    expect(Math.round((333 * 7.5) / 100)).toBe(25); // sanity: float round(24.975) happens to match here
    expect(lineTaxCents(1, 50)).toBe(1); // 0.5 -> 1 (half away from zero)
    expect(lineTaxCents(1, 49.9999)).toBe(0);
    expect(lineTaxCents(0, 20)).toBe(0);
  });

  it("net = round(quantity x unit price) with 4-decimal quantity", () => {
    expect(lineNetCents(15.5, 4500)).toBe(69_750);
    expect(lineNetCents(40, 1200)).toBe(48_000);
    expect(lineNetCents(0.3333, 100)).toBe(33);
    expect(lineNetCents(2.5, 1)).toBe(3); // 2.5 -> 3
  });

  it("rounding is PER LINE; totals are sums of rounded lines (not a re-derived total)", () => {
    // three lines of 333 at 7.5%: per line 25 each = 75; a per-invoice rounding would give round(74.925) = 75;
    // use nets where the two modes differ: 3 x 10 cents at 15% -> per line round(1.5)=2 each = 6; per-invoice round(4.5)=5
    const totals = computeInvoiceTotals([
      { netCents: 10, treatment: "standard", ratePercent: 15 },
      { netCents: 10, treatment: "standard", ratePercent: 15 },
      { netCents: 10, treatment: "standard", ratePercent: 15 },
    ]);
    expect(totals.complete).toBe(true);
    if (totals.complete) {
      expect(totals.lines.map((l) => l.taxCents)).toEqual([2, 2, 2]);
      expect(totals.taxCents).toBe(6); // documented per_line mode
      expect(totals.grossCents).toBe(36);
      expect(totals.netCents + totals.taxCents).toBe(totals.grossCents);
    }
  });

  it("mixed-rate invoice: net -> treatment/rate -> tax -> gross per line and grouped in totals", () => {
    const totals = computeInvoiceTotals([
      { netCents: 69_750, treatment: "standard", ratePercent: 20 },
      { netCents: 48_000, treatment: "reduced", ratePercent: 7.5 },
      { netCents: 250_000, treatment: "reverse_charge", note: "Recipient accounts for the tax" },
      { netCents: 333, treatment: "reduced", ratePercent: 7.5 },
      { netCents: 1_000, treatment: "zero_rated" },
    ]);
    expect(totals.complete).toBe(true);
    if (!totals.complete) return;
    expect(totals.netCents).toBe(369_083);
    expect(totals.taxCents).toBe(13_950 + 3_600 + 0 + 25 + 0);
    expect(totals.grossCents).toBe(totals.netCents + totals.taxCents);
    // groups: reduced@7.5 merges two lines; reverse_charge and zero_rated stay separate
    expect(totals.groups.map((g) => `${g.treatment}@${g.ratePercent}`)).toEqual([
      "reduced@7.5",
      "reverse_charge@0",
      "standard@20",
      "zero_rated@0",
    ]);
    const reduced = totals.groups.find((g) => g.treatment === "reduced")!;
    expect(reduced.lineCount).toBe(2);
    expect(reduced.netCents).toBe(48_333);
    expect(reduced.taxCents).toBe(3_625);
    expect(totals.groups.reduce((s, g) => s + g.grossCents, 0)).toBe(totals.grossCents);
  });

  it("is INCOMPLETE (tax and gross unknown, never 0) while a line has no treatment", () => {
    const totals = computeInvoiceTotals([
      { netCents: 100, treatment: "standard", ratePercent: 20 },
      { netCents: 200, treatment: null },
    ]);
    expect(totals.complete).toBe(false);
    if (!totals.complete) {
      expect(totals.unsetLines).toBe(1);
      expect(totals.netCents).toBe(300);
      expect("taxCents" in totals).toBe(false);
    }
  });

  it("an empty invoice is incomplete", () => {
    expect(computeInvoiceTotals([]).complete).toBe(false);
  });
});
