/**
 * User corrections over a value statement (V10, §36) — PURE.
 *
 * "Ne 30, o 300 kg" corrects the amount of the LAST interpretation; it is
 * not a new statement. This module applies such corrections and ONLY such
 * corrections: a message qualifies only when it carries an explicit
 * negation-correction marker (LT "ne …, o …", EN "not … but …" / "no, …",
 * RU "не …, а …"). A bare restatement ("Turiu 300 kg obuolių") returns
 * null — the caller re-runs full structuring instead, so nothing is ever
 * silently merged into the wrong statement.
 *
 * Corrections change STATE only. Nothing here (or in the chat path that
 * calls it) persists, dispatches or submits anything — replacing an
 * interpretation can never create a duplicate inquiry.
 *
 * Coarse by design, like the statement itself: location corrections resolve
 * at COUNTRY granularity (the model holds no city), windows stay coarse
 * windows.
 */
import { foldText } from "./normalize";
import { COUNTRY_RULES, WORK_TYPE_RULES } from "./structure-need";
import { parseTimeWindow, type TimeWindow } from "./time-window";
import type {
  ValueOfferMode,
  ValueQuantity,
  ValueStatement,
} from "./value-statement";

export type CorrectedField =
  | "quantity"
  | "country"
  | "window"
  | "workType"
  | "offerMode";

export interface CorrectionChange {
  readonly field: CorrectedField;
  /** Display strings for the honest "X (instead of Y)" message. */
  readonly previous: string | null;
  readonly next: string;
}

export interface AppliedCorrection {
  readonly statement: ValueStatement;
  readonly changes: readonly CorrectionChange[];
}

/** The explicit negation-correction markers. The tail AFTER the marker is
 *  where the corrected value lives. */
const MARKERS: RegExp[] = [
  /(?:^|\s)ne\s+[^,.;]{0,48}?,?\s+o\s+/u, // LT: ne X, o Y
  /(?:^|\s)не\s+[^,.;]{0,48}?,?\s+а\s+/u, // RU: не X, а Y
  /\bnot\s+[^,.;]{0,48}?,?\s+but\s+/u, // EN: not X but Y
  /^no,?\s+/u, // EN: "No, 300 kg"
];

function correctionTail(raw: string): string | null {
  const folded = foldText(raw);
  for (const re of MARKERS) {
    const m = folded.match(re);
    if (m && m.index !== undefined) {
      // fold preserves length for LT/RU/EN input, so the folded index maps
      // onto the original text (the V9 echo uses the same property).
      return raw.slice(m.index + m[0].length).trim();
    }
  }
  return null;
}

const KNOWN_UNITS = new Set(["kg", "t", "vnt", "ha", "m2", "m3", "km", "cm", "mm"]);

const RENTAL_RE = /nuomo|isnuomo|\brent(al|ing)?\b|\bhire\b|аренд|сда(м|ю|ем)/u;
const SALE_RE = /parduo|\bsell(ing)?\b|прода(м|ю|ем)/u;

function quantityDisplay(q: ValueQuantity | null): string | null {
  if (!q) return null;
  return q.unit ? `${q.value} ${q.unit}` : String(q.value);
}

function windowDisplay(w: TimeWindow | null): string | null {
  if (!w) return null;
  return w.days ? `${w.kind}(${w.days}d)` : w.kind;
}

/**
 * Apply an explicit correction to the previous statement, or return null
 * when the message is not a correction (caller re-runs full structuring).
 */
export function applyCorrection(
  prev: ValueStatement,
  text: string,
  todayIso: string,
): AppliedCorrection | null {
  const raw = (text ?? "").trim();
  const tail = correctionTail(raw);
  if (tail === null || tail.length === 0) return null;
  const foldedTail = foldText(tail);
  const changes: CorrectionChange[] = [];

  let quantity = prev.quantity;
  let country = prev.country;
  let window = prev.window;
  let workType = prev.workType;
  let offerMode = prev.offerMode;

  // 1. Quantity: a number in the tail, its unit or the previous one — a bare
  //    "300" corrects "30 kg" to "300 kg"; no unit is invented from nothing.
  const qm = foldedTail.match(/(\d+(?:[.,]\d+)?)\s*([a-z²³]{1,4})?/u);
  if (qm && (prev.quantity !== null || (qm[2] && KNOWN_UNITS.has(qm[2])))) {
    const unit =
      qm[2] && KNOWN_UNITS.has(qm[2]) ? qm[2] : (prev.quantity?.unit ?? null);
    const next: ValueQuantity = {
      value: Number.parseFloat(qm[1].replace(",", ".")),
      unit,
      raw: unit ? `${qm[1]} ${unit}` : qm[1],
    };
    if (quantityDisplay(next) !== quantityDisplay(prev.quantity)) {
      changes.push({
        field: "quantity",
        previous: quantityDisplay(prev.quantity),
        next: quantityDisplay(next)!,
      });
      quantity = next;
    }
  }

  // 2. Window: a full phrase in the tail wins; the LT ellipsis "…, o kitą"
  //    shifts the SAME window family one step (this→next week/month).
  const parsed = parseTimeWindow(tail, todayIso);
  let nextWindow: TimeWindow | null = parsed.kind !== "none" ? parsed : null;
  if (nextWindow === null && /^kit(a|o)\b/u.test(foldedTail) && prev.window) {
    if (prev.window.kind === "this_week" || prev.window.kind === "next_week") {
      nextWindow = parseTimeWindow("kitą savaitę", todayIso);
    } else if (prev.window.kind === "next_month") {
      nextWindow = parseTimeWindow("kitą mėnesį", todayIso);
    }
  }
  if (nextWindow && windowDisplay(nextWindow) !== windowDisplay(prev.window)) {
    changes.push({
      field: "window",
      previous: windowDisplay(prev.window),
      next: windowDisplay(nextWindow)!,
    });
    window = nextWindow;
  }

  // 3. Location — COUNTRY granularity only (the model holds no city).
  for (const r of COUNTRY_RULES) {
    if (r.needles.some((n) => foldedTail.includes(n))) {
      if (r.code !== prev.country) {
        changes.push({ field: "country", previous: prev.country, next: r.code });
        country = r.code;
      }
      break;
    }
  }

  // 4. Profession/category: "ne suvirintojų, o elektrikų".
  for (const r of WORK_TYPE_RULES) {
    if (r.needles.some((n) => foldedTail.includes(n))) {
      if (r.slug !== prev.workType) {
        changes.push({ field: "workType", previous: prev.workType, next: r.slug });
        workType = r.slug;
      }
      break;
    }
  }

  // 5. Intent shape: "ne parduoti, o išnuomoti".
  const modeNext: ValueOfferMode | null = RENTAL_RE.test(foldedTail)
    ? "rental"
    : SALE_RE.test(foldedTail)
      ? "sale"
      : null;
  if (modeNext && modeNext !== prev.offerMode) {
    changes.push({
      field: "offerMode",
      previous: prev.offerMode,
      next: modeNext,
    });
    offerMode = modeNext;
  }

  if (changes.length === 0) return null;

  // Recompute what is still missing after the correction satisfied fields.
  const missing = prev.missing.filter((m) => {
    if (m === "location" && country !== null) return false;
    if (m === "window" && window !== null) return false;
    if (m === "quantity" && quantity !== null) return false;
    return true;
  });

  return {
    statement: {
      ...prev,
      quantity,
      country,
      window,
      workType,
      offerMode,
      missing,
      reasons: [
        ...prev.reasons,
        ...changes.map((c) => `corrected:${c.field}(${c.previous ?? "—"}→${c.next})`),
      ],
    },
    changes,
  };
}
