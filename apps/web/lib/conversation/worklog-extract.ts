/**
 * Deterministic work-log extractor — parses a worker's free-text sentence into
 * the fields a work-journal entry needs, WITHOUT any LLM (doctrine §7 / brief
 * §10: the deterministic layer must cover work-time on its own).
 *
 * IMPORTANT — what is a claim vs. a display aid:
 *   - The worker's ORIGINAL sentence (`notes`) is the legal evidence and is
 *     saved verbatim as the journal entry's `original_text`. Skills are
 *     recognized from it by the canonical journal pipeline — nothing here
 *     declares a skill.
 *   - `date` and `site` map to real `journal_entry_metrics` rows.
 *   - `start` / `end` / `breakMinutes` / `hoursLabel` / `task` are a PARSE
 *     PREVIEW shown so the worker can verify the system understood them; they
 *     are NOT persisted as separate structured claims (they already live inside
 *     the evidence text). This keeps the preview honest: "I understood it this
 *     way" — confirm to save the real fields.
 *
 * Pure module: no IO. `today` (YYYY-MM-DD) is passed in so the function stays
 * deterministic and unit-testable; the client supplies the real current date.
 */
import { isExplicitJournalRequest } from "./intent-router";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";

export type WorkLogParse = {
  /** ISO date (YYYY-MM-DD) — parsed or defaulted to `today`. */
  date: string;
  /** HH:MM 24h — null when no span was stated. */
  start: string | null;
  end: string | null;
  /** Minutes of break, 0 when none stated. */
  breakMinutes: number;
  /** Worked-time in minutes, when derivable (span − break, or explicit hours). */
  workedMinutes: number | null;
  /** Human label for worked time, e.g. "8 val. 15 min." — null when unknown. */
  hoursLabel: string | null;
  /** Best-effort work site (word(s) after "objekte"/"site"/"на объекте"). */
  site: string | null;
  /** Best-effort activity phrase (trailing clause) — display only. */
  task: string | null;
  /** The worker's own words — saved verbatim as the entry evidence. */
  notes: string;
  /** True when we parsed at least a date-defining or time-defining signal, so
   *  the flow can decide whether to ask ONE clarifying question first. */
  hasSignal: boolean;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse "8", "8:30", "8.30", "0830" → minutes since midnight, or null. */
function toMinutes(h: string, m?: string): number | null {
  const hh = Number(h);
  const mm = m != null ? Number(m) : 0;
  if (!Number.isInteger(hh) || hh < 0 || hh > 23) return null;
  if (!Number.isInteger(mm) || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function hhmm(mins: number): string {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

/** "8 val. 15 min." in the worker's shorthand (locale-neutral units). */
function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} val. ${m} min.`;
  if (h > 0) return `${h} val.`;
  return `${m} min.`;
}

// "nuo 8 iki 17", "from 8:30 to 17", "с 8 до 17", or a bare "8-17" / "8:00–17:00".
const SPAN_RE =
  /(?:nuo|from|с|von|van)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:iki|to|до|bis|tot|[-–—])\s*(\d{1,2})(?:[:.](\d{2}))?/iu;
// "45 min", "45 minučių", "45 мин", optionally near a break word.
const BREAK_RE =
  /(\d{1,3})\s*(?:min|минут|мин)\w*/iu;
const BREAK_CONTEXT_RE = /(pertrauk|piet[uū]|break|lunch|обед|перерыв|pauze|pause)/iu;
// explicit "8 valandas / hours / часов"
const EXPLICIT_HOURS_RE = /(\d{1,2})(?:[:.,](\d{1,2}))?\s*(?:val\.?|valand\w*|hour\w*|hrs?|час\w*|uur|stunden?)/iu;
// site after "objekte X" / "site X" / "на объекте в X"
const SITE_RE =
  /(?:objekt\w*|statyb\w*|site|на\s+объекте(?:\s+в)?|op\s+de\s+locatie|auf\s+der\s+baustelle)\s+([A-Za-zÀ-ÿА-Яа-яĀ-ž][\wÀ-ÿА-Яа-яĀ-ž-]{1,40})/iu;
// "šiandien" today, "vakar" yesterday, explicit ISO, "liepos 24"/"24 d."
const TODAY_RE = /(šiandien|today|сегодня|vandaag|heute)/iu;
const YESTERDAY_RE = /(vakar|yesterday|вчера|gisteren|gestern)/iu;
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

/** Add `deltaDays` to an ISO date string, staying pure (no Date.now). */
function shiftIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  const dt = new Date(base);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function extractWorkLog(text: string, today: string): WorkLogParse {
  const raw = (text ?? "").trim();
  const q = raw.toLowerCase();

  // ── date ────────────────────────────────────────────────────────────────
  let date = today;
  let dateSignal = false;
  const iso = raw.match(ISO_RE);
  if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    dateSignal = true;
  } else if (YESTERDAY_RE.test(q)) {
    date = shiftIso(today, -1);
    dateSignal = true;
  } else if (TODAY_RE.test(q)) {
    date = today;
    dateSignal = true;
  }

  // ── time span ─────────────────────────────────────────────────────────────
  let start: string | null = null;
  let end: string | null = null;
  let spanMinutes: number | null = null;
  const span = raw.match(SPAN_RE);
  if (span) {
    const s = toMinutes(span[1], span[2]);
    const e = toMinutes(span[3], span[4]);
    if (s != null && e != null && e > s) {
      start = hhmm(s);
      end = hhmm(e);
      spanMinutes = e - s;
    }
  }

  // ── break ─────────────────────────────────────────────────────────────────
  let breakMinutes = 0;
  // Only treat a "NN min" as a break when a break word is present anywhere in
  // the sentence — otherwise a stray "45 min" (e.g. travel) is left alone.
  if (BREAK_CONTEXT_RE.test(q)) {
    const br = raw.match(BREAK_RE);
    if (br) {
      const n = Number(br[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 600) breakMinutes = n;
    }
  }

  // ── worked minutes ────────────────────────────────────────────────────────
  let workedMinutes: number | null = null;
  if (spanMinutes != null) {
    workedMinutes = Math.max(0, spanMinutes - breakMinutes);
  } else {
    const eh = raw.match(EXPLICIT_HOURS_RE);
    if (eh) {
      const h = Number(eh[1]);
      const frac = eh[2] != null ? Number(`0.${eh[2]}`) : 0;
      if (Number.isFinite(h) && h >= 0 && h <= 24) {
        workedMinutes = Math.round((h + frac) * 60) - breakMinutes;
        if (workedMinutes < 0) workedMinutes = Math.round((h + frac) * 60);
      }
    }
  }
  const hoursLabel = workedMinutes != null ? durationLabel(workedMinutes) : null;

  // ── site ──────────────────────────────────────────────────────────────────
  let site: string | null = null;
  const siteM = raw.match(SITE_RE);
  if (siteM) site = siteM[1];

  // ── task (best effort, display only) ──────────────────────────────────────
  // Trailing clause after the last comma, when it looks like an activity
  // (contains letters and isn't just a time/break token). Never a hard claim.
  let task: string | null = null;
  const parts = raw.split(/[,.;]/).map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (
    last &&
    parts.length > 1 &&
    /[A-Za-zÀ-ÿА-Яа-яĀ-ž]/.test(last) &&
    !SPAN_RE.test(last) &&
    !BREAK_RE.test(last) &&
    last.length <= 80
  ) {
    task = last;
  }

  const hasSignal = dateSignal || start != null || workedMinutes != null;

  return {
    date,
    start,
    end,
    breakMinutes,
    workedMinutes,
    hoursLabel,
    site,
    task,
    notes: raw,
    hasSignal,
  };
}

/**
 * IS THIS SENTENCE THE WORK, OR A REQUEST ABOUT THE JOURNAL?
 *
 * Production 2026-09-06 (real-person join walk): "Užpildyk darbo žurnalą"
 * opened the journal flow — correctly, it is an explicit request — but the
 * flow carried the REQUEST SENTENCE as the entry's evidence, and two taps
 * later `journal_entries.original_text = 'Užpildyk darbo žurnalą'`. The
 * request became the record.
 *
 * A draft may persist only when the sentence carries WORK CONTENT — at
 * least one of:
 *   - a time span or a worked duration ("nuo 8 iki 17", "8 valandas");
 *   - a place ("objekte Kaune");
 *   - a recognised activity (the canonical skill recogniser reads it — the
 *     same one the journal pipeline uses — or a past-tense work verb in the
 *     person's own language: "montavau", "dirbau", "installed", "работал",
 *     "gearbeitet").
 * Otherwise the flow ASKS what was done. A sentence that names the journal
 * and carries nothing else is a META REQUEST and is refused at the schema
 * floor too, so no path can save it.
 *
 * `today` does not matter here (a date alone is not work content), so the
 * function takes none and stays trivially pure.
 */
export type JournalDraftReadiness = "ok" | "meta-request" | "no-content";

// Past-tense work verbs. LT: the explicit "dirbau/dirbome" plus the regular
// 1st-person past endings (-avau, -ojau, -ėjau/-ejau, -iau, -inau, -ovau,
// -uvau, -davau and their plurals) — NEVER a bare "-au", which is also the
// present tense ("taisau", "valau", "pildau"). EN: a regular "-ed" verb. RU: the
// -л/-ла/-ли past, with the journal word itself ("журнал" ends in "-ал")
// excluded. DE/NL: a "ge…t / ge…en" participle.
const PAST_WORK_VERB_RE =
  /(?<![\p{L}])(?:dirbau|dirbome|dirbom|worked|работал|работала|работали|gewerkt|gearbeitet)(?![\p{L}])|(?<![\p{L}])[\p{L}]{2,}(?:avau|ojau|ėjau|ejau|iau|inau|ovau|uvau|davau|avome|ojome|ėjome|ejome|iome|inome|ovome|uvome)(?![\p{L}])|(?<![\p{L}])[a-z]{3,}ed(?![\p{L}])|(?<![\p{L}])(?!журнал)[\p{L}]{3,}(?:ал|ала|али|ил|ила|или|ял|яла|яли)(?![\p{L}])|(?<![\p{L}])ge[\p{L}]{3,}(?:t|en)(?![\p{L}])/iu;

export function journalDraftReadiness(text: string): JournalDraftReadiness {
  const raw = (text ?? "").trim();
  if (!raw) return "no-content";
  const parse = extractWorkLog(raw, "2000-01-01");
  const hasContent =
    parse.start !== null ||
    parse.workedMinutes !== null ||
    parse.site !== null ||
    PAST_WORK_VERB_RE.test(raw) ||
    recognizeSkills(raw, 1).length > 0;
  if (hasContent) return "ok";
  return isExplicitJournalRequest(raw) ? "meta-request" : "no-content";
}

/** The server-floor form of the rule: a sentence that only ASKS for the
 *  journal is never evidence. Used by the log-work input schema. */
export function isJournalMetaRequest(text: string): boolean {
  return journalDraftReadiness(text) === "meta-request";
}
