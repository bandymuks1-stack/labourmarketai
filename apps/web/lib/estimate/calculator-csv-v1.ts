/**
 * Public project-cost calculator CSV export v1 — PURE, client-safe.
 *
 * Stable, locale-independent column ids + a localized label column, with
 * version / provenance metadata rows at the top. All numbers are emitted with
 * a dot decimal separator (money at 2 decimals) so the file parses the same
 * in every locale; the UI remains the localized view.
 *
 * Escaping: RFC-4180 quoting is reused from lib/projects/operations-report
 * (csvCell). On top of that, csvSafeCell neutralises spreadsheet FORMULA
 * INJECTION: any cell that would start with = + - @ or a tab/CR gets a
 * leading apostrophe. Every engine number here is non-negative (the engine
 * clamps), so a leading "-" can only come from user text — guarding it never
 * corrupts a real value.
 */
import { csvCell } from "@/lib/projects/operations-report";
import { ESTIMATE_VERSION, type EstimateInputs, type EstimateResult } from "./estimate";
import {
  AREA_QUANTITY_PACK_VERSION,
  type AreaQuantityResult,
} from "./packs/area-quantity-v1";
import { VAT_DISPLAY_VERSION, type VatDisplay } from "./vat-display-v1";

/** Version of the CSV layout itself (first metadata row). */
export const CALCULATOR_CSV_VERSION = 1;

/** Neutralise spreadsheet formula injection, then RFC-4180-escape. */
export function csvSafeCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return csvCell(guarded);
}

function row(cells: readonly string[]): string {
  return cells.map(csvSafeCell).join(",");
}

function money(n: number): string {
  return n.toFixed(2);
}

function plain(n: number): string {
  return String(n);
}

export interface CalculatorCsvOptions {
  readonly inputs: EstimateInputs;
  readonly result: EstimateResult;
  readonly vat: VatDisplay | null;
  readonly pack: AreaQuantityResult | null;
  /** Caller-supplied timestamp (keeps the builder deterministic for tests). */
  readonly generatedAtIso: string;
  /** Stable missing-info keys from the engine (honest incompleteness). */
  readonly missingInfo: readonly string[];
  /** Localized display labels, keyed by the stable column id used in rows.
   *  Missing labels fall back to the stable id — the file stays complete. */
  readonly labels: Readonly<Record<string, string>>;
  /** Localized "preliminary estimate, not a binding offer" disclaimer. */
  readonly disclaimer: string;
}

const HEADER = ["section", "key", "label", "value", "unit"] as const;

/** Build the full CSV text (with trailing newline). */
export function buildCalculatorCsv(opts: CalculatorCsvOptions): string {
  const { inputs, result, vat, pack, labels } = opts;
  const label = (key: string): string => labels[key] ?? key;
  const currency = result.currency;
  const lines: string[] = [row(HEADER as unknown as string[])];

  const push = (section: string, key: string, value: string, unit: string) => {
    lines.push(row([section, key, label(key), value, unit]));
  };

  // ── Provenance ────────────────────────────────────────────────────────
  push("meta", "tool", "labourmarket.ai project-cost calculator", "");
  push("meta", "csv_version", String(CALCULATOR_CSV_VERSION), "");
  push("meta", "engine_version", String(ESTIMATE_VERSION), "");
  if (vat) push("meta", "vat_display_version", String(VAT_DISPLAY_VERSION), "");
  if (pack) push("meta", "pack_version", String(AREA_QUANTITY_PACK_VERSION), "");
  push("meta", "generated_at", opts.generatedAtIso, "");
  push("meta", "currency", currency, "");
  push("meta", "disclaimer", opts.disclaimer, "");

  // ── User inputs ───────────────────────────────────────────────────────
  push("inputs", "template", inputs.template, "");
  if (inputs.workType.trim()) push("inputs", "workType", inputs.workType, "");
  push("inputs", "unitType", inputs.unitType, "");
  push("inputs", "quantity", plain(inputs.quantity), inputs.unitType);
  push("inputs", "workerCount", plain(inputs.workerCount), "");
  push("inputs", "hoursPerWorker", plain(inputs.hoursPerWorker), "h");
  push("inputs", "totalHours", plain(inputs.totalHours), "h");
  push("inputs", "rate", money(inputs.rate), `${currency}/h`);
  if (inputs.country) push("inputs", "country", inputs.country, "");
  push("inputs", "materials", money(inputs.materials), currency);
  push("inputs", "equipment", money(inputs.equipment), currency);
  push("inputs", "transportAccommodation", money(inputs.transportAccommodation), currency);
  push("inputs", "overheadPercent", plain(inputs.overheadPercent), "%");
  push("inputs", "marginPercent", plain(inputs.marginPercent), "%");
  push("inputs", "contingencyPercent", plain(inputs.contingencyPercent), "%");
  if (vat) push("inputs", "vatPercent", plain(vat.vatPercent), "%");

  // ── Quantity pack (only when used) ────────────────────────────────────
  if (pack) {
    push("pack", "netAreaM2", plain(pack.netAreaM2), "m2");
    push("pack", "coverageAreaM2", plain(pack.coverageAreaM2), "m2");
    push("pack", "coverageWithWasteM2", plain(pack.coverageWithWasteM2), "m2");
    push("pack", "packageCount", plain(pack.packageCount), "pkg");
    push("pack", "materialCost", money(pack.materialCost), currency);
    push("pack", "labourHours", plain(pack.labourHours), "h");
    push("pack", "crewDurationHours", plain(pack.crewDurationHours), "h");
    push("pack", "insulationVolumeM3", plain(pack.insulationVolumeM3), "m3");
  }

  // ── Engine result ─────────────────────────────────────────────────────
  push("result", "labourHours", plain(result.labourHours), "h");
  push("result", "labourSubtotal", money(result.labourSubtotal), currency);
  push("result", "directCosts", money(result.directCosts), currency);
  push("result", "overhead", money(result.overhead), currency);
  push("result", "margin", money(result.margin), currency);
  push("result", "contingency", money(result.contingency), currency);
  push("result", "estimatedTotal", money(result.estimatedTotal), currency);
  if (result.hasRange) {
    push("result", "low", money(result.low), currency);
    push("result", "high", money(result.high), currency);
  }
  if (vat) {
    push("result", "netTotalExclVat", money(vat.netTotal), currency);
    push("result", "vatAmount", money(vat.vatAmount), currency);
    push("result", "grossTotalInclVat", money(vat.grossTotal), currency);
  }

  // ── Honest incompleteness ─────────────────────────────────────────────
  for (const key of opts.missingInfo) {
    push("missing", key, "", "");
  }

  return lines.join("\r\n") + "\r\n";
}
