/**
 * A STATED PAY EXPECTATION (owner continuation command 2026-09-29 §5).
 *
 * "Mano atlyginimo lūkestis nuo 2500 iki 3500 eurų." was measured on
 * production as `unknown`, and the fallback answered it with a READ of the
 * current criteria — the person stated a fact and nothing offered to record
 * it. The fact already has ONE home: the work card's monthly EUR range
 * (`workers.salary_min_eur / salary_max_eur`, written only by
 * `save_worker_card` through `worker.save-work-card`). This module reads the
 * figures out of the sentence so that form opens PREFILLED; the write stays
 * behind the form's own review. Nothing here persists anything.
 *
 * Deliberately narrow: a figure reads as MONTHLY EUR (the card's unit). An
 * hourly / daily rate is reported as such so the surface asks instead of
 * storing an hourly number as a monthly one. A reversed range or a figure
 * outside the card's bounds is not guessed at — the answer is `none`.
 *
 * Pure: no IO, no clock, no JSX.
 */

export type PayStatement =
  | { readonly kind: "range"; readonly min: number; readonly max: number }
  | { readonly kind: "min"; readonly min: number }
  | { readonly kind: "max"; readonly max: number }
  /** A rate per hour / day — not the card's monthly unit; ask. */
  | { readonly kind: "not-monthly" }
  /** No usable figure (or a contradictory one) — ask. */
  | { readonly kind: "none" };

/** The card's own bounds (worker-schemas: 0..100000); under 100 is not a monthly wage. */
const MIN_MONTHLY = 100;
const MAX_MONTHLY = 100_000;

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// "3000", "3 000", "3.000", "3,000", "2500.50" → integer euros.
const NUM = String.raw`(\d{1,3}(?:[ ., ]\d{3})+|\d+)(?:[.,]\d{1,2})?`;

function toInt(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/[ ., ]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// Anchored at the figure: "15 €/val.", "120 eur per day", "20 € в час".
const PER_TIME =
  /^[\s.,]*(\/|per|pr\.?|a|в|за|pro|je|na)?\s*(val\b|val\.|valand|hour|h\b|hr\b|час|stunde|std\b|uur|godz|dien|day\b|день|tag\b|dag\b)/;

const FROM_WORDS = String.raw`(?:nuo|maziausiai|ne\s+maziau(?:\s+(?:kaip|nei))?|bent|from|at\s+least|minimum|min\.?|от|минимум|не\s+менее|ab|mindestens|vanaf|minimaal|od|co\s+najmniej|minimum)`;
const TO_WORDS = String.raw`(?:iki|daugiausia|ne\s+daugiau(?:\s+(?:kaip|nei))?|up\s+to|to|max(?:imum)?\.?|до|максимум|не\s+более|bis|hochstens|tot|maximaal|do|maksymalnie)`;
const CUR = String.raw`\s*(?:€|eur\w*|евро)?\s*`;

export function readPayStatement(text: string): PayStatement {
  const q = fold(text ?? "");
  const nums = [...q.matchAll(new RegExp(NUM, "g"))]
    .map((m) => ({ value: toInt(m[1]!), at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
    .filter((n): n is { value: number; at: number; end: number } => n.value !== null);
  const figures = nums.filter((n) => n.value >= MIN_MONTHLY);
  if (figures.length === 0) return { kind: "none" };

  // A rate right after a figure ("15 €/val.", "120 eur per day") is not monthly.
  for (const n of nums) {
    if (PER_TIME.test(q.slice(n.end, n.end + 16).replace(/^\s*(€|eur\w*|евро)?/, ""))) {
      return { kind: "not-monthly" };
    }
  }

  const ok = (v: number) => v >= MIN_MONTHLY && v <= MAX_MONTHLY;

  const range =
    new RegExp(String.raw`(?:${FROM_WORDS}\s+)?${CUR}${NUM}${CUR}(?:-|–|—|${TO_WORDS})${CUR}${NUM}`).exec(q);
  if (range) {
    const min = toInt(range[1]!);
    const max = toInt(range[2]!);
    if (min !== null && max !== null && ok(min) && ok(max)) {
      return min <= max ? { kind: "range", min, max } : { kind: "none" };
    }
  }
  const from = new RegExp(String.raw`${FROM_WORDS}${CUR}${NUM}`).exec(q);
  if (from) {
    const min = toInt(from[1]!);
    if (min !== null && ok(min)) return { kind: "min", min };
  }
  const to = new RegExp(String.raw`${TO_WORDS}${CUR}${NUM}`).exec(q);
  if (to) {
    const max = toInt(to[1]!);
    if (max !== null && ok(max)) return { kind: "max", max };
  }
  // One bare figure in a pay sentence is what the person expects at least.
  if (figures.length === 1 && ok(figures[0]!.value)) return { kind: "min", min: figures[0]!.value };
  return { kind: "none" };
}

/** The work-card form's initial state (string fields) for a read statement. */
export function payPrefill(p: PayStatement): Record<string, string> {
  switch (p.kind) {
    case "range":
      return { salaryMin: String(p.min), salaryMax: String(p.max) };
    case "min":
      return { salaryMin: String(p.min) };
    case "max":
      return { salaryMax: String(p.max) };
    default:
      return {};
  }
}
