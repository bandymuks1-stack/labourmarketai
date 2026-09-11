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
 * A and B are never both emitted (the canonical rule would ignore B anyway
 * and record a conflict). Nothing is invented: no time in the text → nothing.
 *
 * ── PROVENANCE ────────────────────────────────────────────────────────────
 * Every row this produces carries `source: "ai_extracted"` — the DB's
 * machine-origin value (0013), the same one document-import rows use. The
 * person saw the parse summary before confirming, but did not edit each
 * fragment the way the composer allows, so the rows must not claim to be
 * `worker_input`. `selected` stays false: confirming a time parse never
 * declares a skill (P1-A).
 */

import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { extractWorkLog } from "@/lib/conversation/worklog-extract";

export type IntakeWorkTime = {
  /** The `fragments_json` FormData value, or null when no fragment carries a
   *  duration. */
  readonly fragmentsJson: string | null;
  /** Entry-level worked minutes when only a span was stated, else null. */
  readonly quantityMinutes: number | null;
};

const MAX_FRAGMENTS = 20;

/** A timed fragment that names the BREAK, not work — "30 min pertrauka",
 *  "30 min break", "перерыв 30 мин". Never work time. */
const BREAK_RX = /pertrauk|break|перерыв|обед|pietų|pietu|lunch/i;

export function deriveIntakeWorkTime(notes: string, todayIso: string): IntakeWorkTime {
  const text = String(notes ?? "").trim();
  if (!text) return { fragmentsJson: null, quantityMinutes: null };

  const parsed = extractWorkLog(text, todayIso);
  const worked = parsed.workedMinutes;
  const hasWorked = typeof worked === "number" && Number.isFinite(worked) && worked > 0;

  // A stated SPAN ("nuo 8 iki 17, 30 min pertrauka") is the whole day's
  // worked time, break already subtracted by the parser. Fragments inside such
  // a sentence would count the break as work — so the span wins outright.
  if (parsed.start && parsed.end && hasWorked) {
    return { fragmentsJson: null, quantityMinutes: Math.round(worked) };
  }

  const timed = extractJournalSuggestions(text)
    .fragments.filter(
      (f) =>
        f.time !== null &&
        Number.isFinite(f.time.value) &&
        f.time.value > 0 &&
        f.rawPhrase.trim().length > 0 &&
        !BREAK_RX.test(f.rawPhrase),
    )
    .slice(0, MAX_FRAGMENTS);

  if (timed.length > 0) {
    return {
      fragmentsJson: JSON.stringify(
        timed.map((f) => ({
          rawPhrase: f.rawPhrase.trim().slice(0, 200),
          timeValue: f.time!.value,
          timeUnit: f.time!.unitSlug,
          activitySlug: f.activitySlug ?? null,
          activityLabel: f.activityLabel ?? null,
          isUnknown: false,
          selected: false,
          source: "ai_extracted",
        })),
      ),
      quantityMinutes: null,
    };
  }

  // Explicit hours the fragment recognizer does not read (e.g. English
  // "for 4 hours") but the work-log parser does.
  if (hasWorked) return { fragmentsJson: null, quantityMinutes: Math.round(worked) };
  return { fragmentsJson: null, quantityMinutes: null };
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
  if (t.fragmentsJson) return { fragments_json: t.fragmentsJson };
  if (t.quantityMinutes !== null) {
    return {
      quantity: String(t.quantityMinutes),
      unit_slug: "minutes",
      quantity_source: "ai_extracted",
    };
  }
  return {};
}
