/**
 * TIME STATED IN A SENTENCE BECOMES TIME ON THE RECORD (issue #1689, owner §4:
 * "time cannot remain hidden inside free text"). Pure: no IO, no AI.
 *
 * ── THE DEFECT THIS CLOSES (measured on production, 2026-09-11) ────────────
 * The web composer persists the person's durations as `fragment_time` rows
 * (it builds `fragments_json` from the same deterministic parse it shows
 * for review). The conversation flow and the MCP `journal.confirm`
 * capability did NOT: their one FormData mapping sent `notes`, `work_date`
 * and `site_name` only, on the stated ground that "hours already live in
 * the evidence notes". So "Klijavau plyteles 6 val., glaisčiau sienas 2 val."
 * saved through the chat carried NO duration metric, the canonical work-time
 * rule found no line, and every total downstream read 0 h for a day the
 * person had described in full.
 *
 * ── WHAT THIS DOES ────────────────────────────────────────────────────────
 * Derives, from the notes alone, exactly what the composer would have sent:
 *   1. per-fragment durations (+ the activity the SAME fragment names) via
 *      the journal's own recognizer — `fragments_json` for the write core;
 *   2. when no fragment carries a duration but the sentence states a span
 *      ("nuo 8 iki 17, 30 min pertrauka") the work-log parser already turns
 *      into worked minutes, an entry-level `quantity` in minutes.
 * A and B are never both emitted for the SAME figure (the canonical rule would
 * ignore B anyway and record a conflict). Nothing is invented: no time in the
 * text → nothing.
 *
 * ── THE STATED TOTAL IS NOT ONE MORE ITEM (owner's sentence, 2026-09-11) ──
 * "Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val.
 * testavau, 2 val. ieškojau partnerių." states the day ONCE and itemises it.
 * The recognizer now returns the 9 h as `statedTotal`, outside `fragments`
 * (before, it was a fourth fragment: 18 h for a 9 h day). When the items add
 * up to it nothing more is recorded — the items ARE the day. When they do
 * not ("9 valandas … : 5 val. X, 2 val. Y" — 2 h never itemised) the stated
 * figure goes to the entry-level `quantity` slot in minutes BESIDE the
 * fragments: the canonical rule counts the items, sets the entry figure
 * aside as a visible `conflict`, and the §13 check names it to the person.
 * Never summed, never dropped. The slot is one: a stated OUTPUT (below)
 * keeps it when both occur in one sentence, because an output has no other
 * place on the record while the itemised hours are already counted.
 *
 * ── PROVENANCE ────────────────────────────────────────────────────────────
 * Every row this produces carries `source: "ai_extracted"` — the DB's
 * machine-origin value (0013), the same one document-import rows use. The
 * person saw the parse summary before confirming, but did not edit each
 * fragment the way the composer allows, so the rows must not claim to be
 * `worker_input`. `selected` stays false: confirming a time parse never
 * declares a skill (P1-A).
 *
 * ── OUTPUT STATED IN THE SAME SENTENCE (registry 20260911130000) ──────────
 * "Nuvažiavau 320 km, 8 val." states two facts: the time AND what the work
 * produced. The composer records the output as the entry-level `quantity`
 * metric in its recorded unit (km, pallets, m², …); the chat and MCP intake
 * recorded only the time, so a driver's kilometres and a warehouse worker's
 * pallets were lost the moment they were said. `intakeOutputFields` reads the
 * same recognizer's quantity and sends it the same way — ONLY while the
 * entry-level quantity slot is not already carrying the day's minutes (the
 * span case above): time wins that slot, the canonical work-time rule owns
 * it, and an output is never written where it would read as a duration.
 */

import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { extractWorkLog } from "@/lib/conversation/worklog-extract";
import { isWorkTimeUnit } from "@/lib/journal/work-time";

export type IntakeFragment = {
  readonly rawPhrase: string;
  readonly timeValue: number;
  readonly timeUnit: "hours" | "minutes" | "days";
  readonly activitySlug: string | null;
  readonly activityLabel: string | null;
  readonly isUnknown: false;
  readonly selected: false;
  readonly source: "ai_extracted";
};

export type IntakeWorkTime = {
  /** The `fragments_json` FormData value, or null when no fragment carries a
   *  duration. */
  readonly fragmentsJson: string | null;
  /** The same fragments as objects — for the confirm preview, which lists
   *  exactly what the save will record (issue #1689). Empty when
   *  `fragmentsJson` is null. */
  readonly fragments: readonly IntakeFragment[];
  /** Entry-level worked minutes when only a span was stated, else null. */
  readonly quantityMinutes: number | null;
  /** The day's total the person stated beside the itemised fragments when
   *  the items do NOT add up to it — in minutes, for the entry-level slot the
   *  canonical rule sets aside and the §13 check names. Null when no total
   *  was stated, when the items add up to it, or when there are no
   *  fragments (a lone total is then simply the entry's time). */
  readonly statedTotalMinutes: number | null;
};

const MAX_FRAGMENTS = 20;

/** A timed fragment that names the BREAK, not work — "30 min pertrauka",
 *  "30 min break", "перерыв 30 мин". Never work time. */
const BREAK_RX = /pertrauk|break|перерыв|обед|pietų|pietu|lunch/i;

export function deriveIntakeWorkTime(notes: string, todayIso: string): IntakeWorkTime {
  const text = String(notes ?? "").trim();
  if (!text) return NOTHING;

  const parsed = extractWorkLog(text, todayIso);
  const worked = parsed.workedMinutes;
  const hasWorked = typeof worked === "number" && Number.isFinite(worked) && worked > 0;

  // A stated SPAN ("nuo 8 iki 17, 30 min pertrauka") is the whole day's
  // worked time, break already subtracted by the parser. Fragments inside such
  // a sentence would count the break as work — so the span wins outright.
  if (parsed.start && parsed.end && hasWorked) {
    return { ...NOTHING, quantityMinutes: Math.round(worked) };
  }

  const suggestions = extractJournalSuggestions(text);
  const timed = suggestions.fragments
    .filter(
      (f) =>
        f.time !== null &&
        Number.isFinite(f.time.value) &&
        f.time.value > 0 &&
        f.rawPhrase.trim().length > 0 &&
        !BREAK_RX.test(f.rawPhrase),
    )
    .slice(0, MAX_FRAGMENTS);

  if (timed.length > 0) {
    const fragments: IntakeFragment[] = timed.map((f) => ({
      rawPhrase: f.rawPhrase.trim().slice(0, 200),
      timeValue: f.time!.value,
      timeUnit: f.time!.unitSlug,
      activitySlug: f.activitySlug ?? null,
      activityLabel: f.activityLabel ?? null,
      isUnknown: false,
      selected: false,
      source: "ai_extracted",
    }));
    return {
      fragmentsJson: JSON.stringify(fragments),
      fragments,
      quantityMinutes: null,
      statedTotalMinutes: statedTotalMinutes(suggestions.statedTotal),
    };
  }

  // Explicit hours the fragment recognizer does not read (e.g. English
  // "for 4 hours") but the work-log parser does.
  if (hasWorked) return { ...NOTHING, quantityMinutes: Math.round(worked) };
  return NOTHING;
}

const NOTHING: IntakeWorkTime = {
  fragmentsJson: null,
  fragments: [],
  quantityMinutes: null,
  statedTotalMinutes: null,
};

/** The stated total in minutes when the items do not add up to it; a total
 *  in `days` has no minute value (no approved workday length) and is left to
 *  the person's own words. */
function statedTotalMinutes(
  total: ReturnType<typeof extractJournalSuggestions>["statedTotal"],
): number | null {
  if (!total || total.matchesFragments) return null;
  if (!Number.isFinite(total.value) || total.value <= 0) return null;
  if (total.unitSlug === "hours") return Math.round(total.value * 60);
  if (total.unitSlug === "minutes") return Math.round(total.value);
  return null;
}

/**
 * The FormData fields for the canonical write core — spread into the ONE
 * mapping the conversation executor and the MCP `journal.confirm` share.
 * `work_date` may be empty; the parser then anchors relative dates on today,
 * which only matters for a span, never for an explicit "6 val.".
 */
export function intakeWorkTimeFields(
  notes: string,
  workDate: string | null | undefined,
): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10);
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(workDate ?? "")) ? String(workDate) : today;
  const t = deriveIntakeWorkTime(notes, anchor);
  if (t.fragmentsJson) {
    const output = intakeOutputFields(notes);
    if (Object.keys(output).length > 0 || t.statedTotalMinutes === null) {
      return { fragments_json: t.fragmentsJson, ...output };
    }
    // The items do not add up to the total the person stated: the stated
    // figure is recorded where the canonical rule sets it aside visibly
    // (`conflict` → §13 `entry_duration_ignored`), never where it would add.
    return {
      fragments_json: t.fragmentsJson,
      quantity: String(t.statedTotalMinutes),
      unit_slug: "minutes",
      quantity_source: "ai_extracted",
    };
  }
  if (t.quantityMinutes !== null) {
    // The quantity slot carries the day's minutes; a stated output has no
    // second slot on the entry and is NOT written as if it were time.
    return {
      quantity: String(t.quantityMinutes),
      unit_slug: "minutes",
      quantity_source: "ai_extracted",
    };
  }
  return intakeOutputFields(notes);
}

/**
 * The stated OUTPUT — "320 km", "12 palečių", "35 m²" — as the entry-level
 * `quantity` FormData fields in its recorded unit, with machine provenance.
 * The same recognizer reading the composer shows for confirmation; the write
 * core still validates the unit against the live `productivity_units`
 * registry and refuses an unknown one by name. Never a time unit: a duration
 * is time, handled by `deriveIntakeWorkTime`. Nothing stated → nothing.
 */
export function intakeOutputFields(notes: string): Record<string, string> {
  const text = String(notes ?? "").trim();
  if (!text) return {};
  const q = extractJournalSuggestions(text).quantity;
  if (!q || !Number.isFinite(q.value) || q.value <= 0) return {};
  if (isWorkTimeUnit(q.unitSlug)) return {};
  return {
    quantity: String(q.value),
    unit_slug: q.unitSlug,
    quantity_source: "ai_extracted",
  };
}
