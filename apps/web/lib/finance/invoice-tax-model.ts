/**
 * COUNTRY-NEUTRAL INVOICE TAX MODEL (pure: no IO, no locale, no country).
 *
 * Mirrors the SQL in 20261008150000_project_invoice_lifecycle_v1.sql
 * (`_invoice_tax_rate_v1`, `_invoice_line_tax_cents_v1`, `_invoice_recompute_totals_v1`).
 * The database is the authority; this file exists so the UI can PREVIEW exactly
 * what the database will store, and so the arithmetic is pinned by tests.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────
 * 1. TREATMENT IS DATA. Six explicit values. `zero_rated` and `reverse_charge`
 *    are DIFFERENT legal states that both yield a zero tax amount; the invoice
 *    preserves which one the issuing user selected. Nothing infers a treatment
 *    from a country, a project, a customer or an amount.
 * 2. THE USER CONFIRMS. A line has no treatment until a person sets one; the
 *    issue command refuses unset lines. Presets only PRE-FILL a form.
 * 3. SNAPSHOT. Treatment, rate and note are copied onto the line and frozen at
 *    issue. A later change to a preset or default never reaches an issued line.
 * 4. NO COUNTRY KNOWLEDGE. No rate, no wording, no jurisdiction appears here.
 *    The accounting / legal determination stays with the authorized business or
 *    accounting user; the platform records and calculates the selected one.
 *
 * ── ARITHMETIC (stated explicitly) ───────────────────────────────────────
 * All money is integer minor units (cents). Rates are percent with up to four
 * decimals (`7.5`, `20`, `0`).
 *   net   = round(quantity × unit_price)            (half away from zero)
 *   tax   = round(net × rate / 100)                 PER LINE, half away from zero
 *   gross = net + tax
 * Invoice totals are the SUMS of the already-rounded line values:
 *   Σnet, Σtax, Σgross  — never re-derived from a total, so the printed lines
 *   always add up to the printed totals. Rounding mode `per_line` is stored on
 *   the invoice (`tax_rounding`) so a future per-invoice-group mode is an
 *   additive value, not a redesign. Totals are also GROUPED by (treatment,
 *   rate, note) for display and for the stored `tax_breakdown`.
 */

export const TAX_TREATMENTS = [
  "standard",
  "reduced",
  "zero_rated",
  "reverse_charge",
  "exempt",
  "outside_scope",
] as const;

export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

/** Treatments that carry a positive percentage. Every other treatment is 0 %. */
export const RATE_BEARING_TREATMENTS: readonly TaxTreatment[] = ["standard", "reduced"];

export const TAX_NOTE_MAX = 500;
export const TAX_RATE_MAX = 100;

export function isTaxTreatment(v: unknown): v is TaxTreatment {
  return typeof v === "string" && (TAX_TREATMENTS as readonly string[]).includes(v);
}

export function treatmentCarriesRate(t: TaxTreatment): boolean {
  return RATE_BEARING_TREATMENTS.includes(t);
}

/**
 * Exact decimal multiply for `net × rate / 100` using integer arithmetic on a
 * 4-decimal rate, so `333 × 7.5 %` is exactly 24.975 and rounds to 25 (a
 * floating-point `333 * 7.5 / 100` is 24.974999999999998 and would round to 24).
 */
export function lineTaxCents(netCents: number, ratePercent: number): number {
  if (!Number.isInteger(netCents) || netCents < 0) throw new RangeError("net must be a non-negative integer");
  const scaled = Math.round(ratePercent * 10_000); // rate in 1/10_000 percent
  const numerator = BigInt(netCents) * BigInt(scaled); // net × rate × 10_000
  const denominator = BigInt(1000000); // 100 (percent) × 10_000 (scale)
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return Number(remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient);
}

export type TaxInput = {
  readonly treatment: string | null | undefined;
  readonly ratePercent?: number | null;
};

export type TaxValidation =
  | { readonly ok: true; readonly treatment: TaxTreatment; readonly ratePercent: number }
  | { readonly ok: false; readonly reason: "unset" | "unknown_treatment" | "rate_required" | "rate_not_allowed" | "rate_out_of_range" };

/**
 * Validate a (treatment, rate) pair exactly as the database does:
 * standard / reduced need a rate in (0, 100]; every other treatment must have
 * rate 0 (or none) — so `zero_rated` can never be confused with a taxed line.
 */
export function validateTax(input: TaxInput): TaxValidation {
  if (input.treatment == null || input.treatment === "") return { ok: false, reason: "unset" };
  if (!isTaxTreatment(input.treatment)) return { ok: false, reason: "unknown_treatment" };
  const rate = input.ratePercent ?? null;
  if (treatmentCarriesRate(input.treatment)) {
    if (rate == null || !(rate > 0)) return { ok: false, reason: "rate_required" };
    if (rate > TAX_RATE_MAX) return { ok: false, reason: "rate_out_of_range" };
    return { ok: true, treatment: input.treatment, ratePercent: Math.round(rate * 10_000) / 10_000 };
  }
  if (rate != null && rate !== 0) return { ok: false, reason: "rate_not_allowed" };
  return { ok: true, treatment: input.treatment, ratePercent: 0 };
}

export type InvoiceLineInput = {
  readonly netCents: number;
  readonly treatment: string | null | undefined;
  readonly ratePercent?: number | null;
  readonly note?: string | null;
};

export type ComputedLine = {
  readonly netCents: number;
  readonly treatment: TaxTreatment;
  readonly ratePercent: number;
  readonly note: string | null;
  readonly taxCents: number;
  readonly grossCents: number;
};

export type TaxGroup = {
  readonly treatment: TaxTreatment;
  readonly ratePercent: number;
  readonly note: string | null;
  readonly netCents: number;
  readonly taxCents: number;
  readonly grossCents: number;
  readonly lineCount: number;
};

export type InvoiceTotals =
  | {
      readonly complete: true;
      readonly lines: readonly ComputedLine[];
      readonly netCents: number;
      readonly taxCents: number;
      readonly grossCents: number;
      readonly groups: readonly TaxGroup[];
    }
  | {
      /** At least one line has no (valid) treatment: tax and gross are UNKNOWN,
       *  never zero. `unsetLines` counts them. */
      readonly complete: false;
      readonly netCents: number;
      readonly unsetLines: number;
    };

/** Compute lines and totals; incomplete while any line lacks a valid treatment. */
export function computeInvoiceTotals(lines: readonly InvoiceLineInput[]): InvoiceTotals {
  const net = lines.reduce((s, l) => s + l.netCents, 0);
  const computed: ComputedLine[] = [];
  let unset = 0;
  for (const l of lines) {
    const v = validateTax({ treatment: l.treatment, ratePercent: l.ratePercent });
    if (!v.ok) {
      unset += 1;
      continue;
    }
    const tax = lineTaxCents(l.netCents, v.ratePercent);
    computed.push({
      netCents: l.netCents,
      treatment: v.treatment,
      ratePercent: v.ratePercent,
      note: l.note?.trim() ? l.note.trim() : null,
      taxCents: tax,
      grossCents: l.netCents + tax,
    });
  }
  if (unset > 0 || lines.length === 0) {
    return { complete: false, netCents: net, unsetLines: unset };
  }
  const byKey = new Map<string, TaxGroup>();
  for (const c of computed) {
    const key = `${c.treatment}|${c.ratePercent}|${c.note ?? ""}`;
    const g = byKey.get(key);
    byKey.set(key, {
      treatment: c.treatment,
      ratePercent: c.ratePercent,
      note: c.note,
      netCents: (g?.netCents ?? 0) + c.netCents,
      taxCents: (g?.taxCents ?? 0) + c.taxCents,
      grossCents: (g?.grossCents ?? 0) + c.grossCents,
      lineCount: (g?.lineCount ?? 0) + 1,
    });
  }
  const groups = [...byKey.values()].sort(
    (a, b) =>
      a.treatment.localeCompare(b.treatment) ||
      a.ratePercent - b.ratePercent ||
      (a.note ?? "").localeCompare(b.note ?? ""),
  );
  return {
    complete: true,
    lines: computed,
    netCents: net,
    taxCents: computed.reduce((s, c) => s + c.taxCents, 0),
    grossCents: computed.reduce((s, c) => s + c.grossCents, 0),
    groups,
  };
}

/** net = round(quantity × unit price) — half away from zero, exact decimal quantity. */
export function lineNetCents(quantity: number, unitPriceCents: number): number {
  // quantity has at most 4 decimals in storage; scale to integers.
  const q = BigInt(Math.round(quantity * 10_000));
  const n = q * BigInt(unitPriceCents);
  const d = BigInt(10000);
  const quo = n / d;
  const rem = n % d;
  return Number(rem * BigInt(2) >= d ? quo + BigInt(1) : quo);
}

/**
 * A PRE-FILL suggestion from an organization preset. It is only ever a form
 * default: the result must be shown to, and confirmed by, the issuing user.
 */
export type TaxPreset = {
  readonly id: string;
  readonly label: string;
  readonly treatment: TaxTreatment;
  readonly ratePercent: number | null;
  readonly noteText: string | null;
};
