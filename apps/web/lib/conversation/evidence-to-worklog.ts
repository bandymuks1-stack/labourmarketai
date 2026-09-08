import { extractWorkLog, type WorkLogParse } from "./worklog-extract";
import type { WorkEvidenceDraft } from "./evidence-goal";

/**
 * ASK → PREFILL → THE EXISTING SAVE FLOW.
 *
 * The bridge from a multi-turn work-evidence conversation into the capture
 * surface that already exists. It creates NO second save path: it produces the
 * same `WorkLogParse` the chat already builds from one sentence, so
 * `WorkerWorkLogFlow`, `createJournalEntry` and the server schema are all
 * reached exactly as before.
 *
 * ── WHY A BRIDGE AND NOT A NEW FLOW ───────────────────────────────────────
 *
 * `startWorkLog` opens an embedded form, and its own comment records why: a
 * clarify question that kept coming back made the journal UNFILLABLE for a
 * real tester, and the form — fields that can actually be submitted — was the
 * fix. Replacing it with a conversation would revert a repair of a measured
 * defect. Prefilling it does the opposite: the conversation gathers what it
 * can, the form still opens, and the anti-loop is untouched.
 *
 * ── THE ONE THING THIS MUST NOT DO ────────────────────────────────────────
 *
 * Make a person say anything twice. Someone who has just told the chat they
 * worked eight hours on wall formwork must not meet an empty form. So the
 * evidence context supplies the fields it holds, and the person's own
 * sentences — ALL of them, in order — become the evidence text.
 *
 * ── `notes` IS EVIDENCE, SO IT IS NEVER REWRITTEN ─────────────────────────
 *
 * `notes` is saved verbatim as the entry's `original_text`; it is the thing a
 * verifier will one day read. So the sentences are joined and nothing else:
 * not summarised, not tidied, not turned into the system's phrasing. "Sienas."
 * on its own line looks unpolished, and it is what the person actually said —
 * and the form is a REVIEW surface, so they can edit it before anything is
 * saved. A tidier record that nobody said would be worse.
 *
 * PURE. No IO, no clock (`today` is passed), no locale.
 */

export interface EvidenceToWorklogInput {
  /** The person's own sentences for this goal, oldest first. */
  readonly said: readonly string[];
  /** The accumulated evidence context, when the goal carried one. */
  readonly evidence: WorkEvidenceDraft | null;
  /** ISO YYYY-MM-DD, supplied by the caller so this stays deterministic. */
  readonly today: string;
  /** The sentence that triggered the open, when it is not already in `said`. */
  readonly latest?: string;
}

/** 60 minutes. Named because a magic number in an hours conversion is how a
 *  duration quietly becomes wrong. */
const MINUTES_PER_HOUR = 60;

function durationLabel(mins: number): string {
  const h = Math.floor(mins / MINUTES_PER_HOUR);
  const m = mins % MINUTES_PER_HOUR;
  if (h > 0 && m > 0) return `${h} val. ${m} min.`;
  if (h > 0) return `${h} val.`;
  return `${m} min.`;
}

/**
 * Compose the sentences a person actually said into one evidence text.
 *
 * Order is preserved and duplicates are dropped: a turn that repeats itself
 * should not double the record. `latest` is appended only when it is not
 * already the last thing said, because `advanceGoal` has usually already
 * recorded it.
 */
export function composeEvidenceText(
  said: readonly string[],
  latest?: string,
): string {
  const parts: string[] = [];
  for (const s of said) {
    const t = s.trim();
    if (t.length > 0 && parts[parts.length - 1] !== t) parts.push(t);
  }
  const l = (latest ?? "").trim();
  if (l.length > 0 && parts[parts.length - 1] !== l) parts.push(l);
  return parts.join(" ");
}

/**
 * Build the work-log draft the existing flow expects, from the conversation.
 *
 * Falls through to exactly the current behaviour when there is no evidence
 * context: one sentence in, `extractWorkLog` out. That is what makes this safe
 * to put in front of every call — a discovery goal, a chip, or the journal
 * page's hand-off all behave as they did.
 */
export function worklogDraftFromEvidence(
  input: EvidenceToWorklogInput,
): WorkLogParse {
  const text = composeEvidenceText(input.said, input.latest);
  const base = extractWorkLog(text, input.today);
  const stated = input.evidence?.stated;
  if (!stated) return base;

  // The site the person NAMED in conversation wins over one guessed out of a
  // sentence: they were answering the question "where or for whom".
  const site = stated.context ?? base.site;

  // A duration stated in conversation fills the gap only when the sentence did
  // not already carry a span. An explicit "nuo 8 iki 17" is the richer fact
  // and must not be overwritten by a rounded hours answer.
  const hasSpan = base.workedMinutes != null;
  const fromHours =
    !hasSpan && stated.durationHours != null && stated.durationHours > 0
      ? Math.round(stated.durationHours * MINUTES_PER_HOUR)
      : null;

  const workedMinutes = base.workedMinutes ?? fromHours;

  return {
    ...base,
    site,
    workedMinutes,
    hoursLabel:
      base.hoursLabel ?? (fromHours != null ? durationLabel(fromHours) : null),
    // THE ANTI-LOOP, PRESERVED AND STRENGTHENED. `hasSignal` is what decides
    // whether the flow opens or the clarify question is asked again. A
    // conversation that produced an activity has, by definition, produced
    // signal — so after asking, the form OPENS. It cannot send the person back
    // to the question they just answered, which is the exact loop the form was
    // built to end.
    hasSignal: base.hasSignal || (stated.activity ?? "").trim().length > 0,
  };
}

/**
 * Did the conversation add anything the sentence alone would not have given?
 *
 * Used to decide whether prefilling is worth doing at all. When the answer is
 * no, the caller can take the untouched existing path and nothing changes.
 */
export function evidenceAddsToDraft(
  evidence: WorkEvidenceDraft | null,
  base: WorkLogParse,
): boolean {
  if (!evidence) return false;
  const s = evidence.stated;
  if (s.context && !base.site) return true;
  if (s.durationHours != null && base.workedMinutes == null) return true;
  if (s.object || s.role) return true;
  return false;
}
