/**
 * Conversation intent router — DETERMINISTIC (no LLM).
 *
 * The conversation-first control layer must work with the LLM entirely OFF
 * (doctrine §7 / brief §10): the deterministic layer alone has to cover CV,
 * profile, work-time, calendar, offers, message drafting, confirmations,
 * navigation and next-action. This module is that layer's front door: it maps a
 * free-text sentence to ONE conversation intent using weighted keyword/phrase
 * matching across the ACTIVE locales (LT / EN / RU) plus common variants of the
 * other launch markets.
 *
 * It NEVER executes anything and NEVER writes: it only classifies. The chat
 * surface takes the returned intent and routes to an existing real flow
 * (CV import, employer search, work-log, booking, profile forms, navigation).
 * When the LLM is later switched on it may only PROPOSE a registry action id +
 * fields; this deterministic router remains the always-on floor.
 *
 * Pure module: no server-only imports, no IO — safe on client and trivially
 * unit-testable.
 */

export type ConversationIntent =
  | "log-work" // "šiandien dirbau nuo 8 iki 17" — record a work-journal entry
  | "find-work" // "rask man darbą Nyderlanduose" — employer/opportunity search
  | "write-employer" // "parašyk šiai įmonei" — draft a human message
  | "translate" // "išversk žinutę į olandų kalbą" — translate text
  | "calendar-view" // "kada turiu kitą susitikimą?" — show the plan
  | "reminder" // "primink rytoj 8 val." — set a reminder
  | "cv" // "įkelk šį CV" / "parodyk mano CV"
  | "profile" // "pridėk kalbą / įgūdį / patirtį"
  | "offers" // "ką man siūlo" — incoming booking offers
  | "next-action" // "ką dar turiu padaryti?"
  | "resume" // "kur sustojau?"
  | "unknown";

export type IntentMatch = {
  intent: ConversationIntent;
  /** Sum of matched pattern weights (0 when nothing matched). */
  score: number;
  /** The patterns that fired — surfaced for transparency + tests. */
  matched: string[];
};

type Pattern = { re: RegExp; weight: number };
type IntentRule = { intent: ConversationIntent; patterns: Pattern[] };

/**
 * A Unicode-aware word boundary. JS `\b` is ASCII-only, so it misfires at every
 * non-ASCII boundary (Lithuanian ąčęėįšųūž, Cyrillic): `darbą\b` never matches
 * after `ą`, and `\bcv\b` still lets `zxcv` match. This asserts a real
 * letter↔non-letter transition using Unicode letter/number classes (requires
 * the `u` flag), so short stems like `cv`/`job` stay properly bounded across
 * every launch language.
 */
const UB =
  "(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))";

/** Build a word/phrase pattern, translating each ASCII `\b` in the source into
 *  the Unicode-safe boundary `UB` before compiling. */
function p(source: string, weight = 1): Pattern {
  return { re: new RegExp(source.replace(/\\b/g, UB), "iu"), weight };
}

/**
 * Rule table. Ordered by specificity of the *signal*, not by intent priority —
 * scoring resolves overlaps (e.g. the word "darbas"/"work" appears in both
 * find-work and log-work; the PAST-TENSE verb + a TIME span tips it to
 * log-work, the SEEKING verb tips it to find-work).
 */
const RULES: IntentRule[] = [
  {
    intent: "log-work",
    patterns: [
      // past-tense "worked" across LT/EN/RU/other launch stems
      p("\\bdirbau\\b", 3),
      p("\\bdirbome\\b", 3),
      p("\\bworked\\b", 3),
      p("работал", 3),
      p("\\bgewerkt\\b", 3), // nl
      p("\\bgearbeitet\\b", 3), // de
      // an explicit worked-time span "nuo 8 iki 17", "from 8 to 5", "с 8 до 17"
      p("\\bnuo\\s*\\d{1,2}\\D{0,4}iki\\s*\\d{1,2}", 3),
      p("\\bfrom\\s*\\d{1,2}\\D{0,4}to\\s*\\d{1,2}", 3),
      p("с\\s*\\d{1,2}\\D{0,4}до\\s*\\d{1,2}", 3),
      // "8 valandas / hours / часов"
      p("\\d{1,2}\\s*(val\\.?|valand|hour|hrs?|час)", 2),
      // break / lunch minutes
      p("(pertrauk|pietūs|pietus|break|lunch|обед|перерыв)", 1),
      // "objekte / site / на объекте" — a work site
      p("(objekt|statyb|site|site\\b|стройк|объект)", 1),
      // explicit journal words
      p("(žurnal|įrašyk\\s+darb|log\\s+work|записать\\s+работу)", 2),
    ],
  },
  {
    intent: "find-work",
    patterns: [
      p("\\brask\\b", 3),
      p("\\bieškau\\b", 3),
      p("\\bieškok\\b", 3),
      p("(find|look(ing)?\\s+for)\\s+(me\\s+)?(a\\s+)?(job|work)", 3),
      p("найди", 3),
      p("ищу", 3),
      p("(darbo|darbą)\\b", 1),
      p("\\bjob\\b", 1),
      p("работу", 2),
      p("\\bvacancy|vacature|vakans", 1),
      // "in the Netherlands / country" — a search location
      p("(nyderland|olandij|netherland|holland|нидерланд|deutschland|germanij)", 1),
    ],
  },
  {
    intent: "translate",
    patterns: [
      p("\\bišversk\\b", 3),
      p("\\bversti\\b", 2),
      p("\\btranslate\\b", 3),
      p("переведи", 3),
      p("перевод", 2),
      p("\\bvertimą\\b", 2),
      p("(į|to|на)\\s+(olandų|nyderland|dutch|nederlands|немецк|anglų|english)", 1),
    ],
  },
  {
    intent: "write-employer",
    patterns: [
      p("\\bparašyk\\b", 3),
      p("\\bparašok\\b", 2),
      p("(write|send|message)\\s+(to\\s+)?(this\\s+)?(employer|company|them)", 3),
      p("напиши", 3),
      p("сообщение", 1),
      p("(šiai\\s+įmonei|darbdaviui|to\\s+the\\s+employer|работодател)", 2),
      p("\\bžinut", 1),
    ],
  },
  {
    intent: "reminder",
    patterns: [
      p("\\bprimink\\b", 3),
      p("\\bpriminim", 2),
      p("\\bremind\\b", 3),
      p("\\breminder\\b", 2),
      p("напомни", 3),
      p("напоминани", 2),
    ],
  },
  {
    intent: "calendar-view",
    patterns: [
      p("(kada|when).{0,20}(susitikim|meeting|pamain|shift|event|įvyk)", 3),
      p("\\bkalendor", 3),
      p("\\bcalendar\\b", 3),
      p("календар", 3),
      p("(mano|šios savaitės|today'?s|this week'?s)\\s+(plan|tvarkaraš|schedule|расписани)", 2),
      p("\\bsusitikim", 1),
      p("\\bmeeting\\b", 1),
      p("планы", 1),
    ],
  },
  {
    intent: "cv",
    patterns: [
      p("\\bcv\\b", 3),
      p("(gyvenimo\\s+apraš|curriculum|résumé|resume)", 3),
      p("резюме", 3),
      p("\\blebenslauf\\b", 3),
      p("(įkelk|upload|загрузи|прикрепи)\\s+.{0,10}(cv|резюме)", 2),
    ],
  },
  {
    intent: "profile",
    patterns: [
      p("\\bprofil", 2),
      p("\\bprofile\\b", 2),
      p("\\bįgūd", 2),
      p("\\bskill", 2),
      p("навык", 2),
      p("(pridėk|add|добавь)\\s+.{0,12}(kalb|language|язык|patirt|experience|опыт|išsilavin|education|образовани)", 2),
      p("\\bkalb(a|ą|as|os)\\b", 1),
      p("\\blanguage", 1),
    ],
  },
  {
    intent: "offers",
    patterns: [
      p("\\bpasiūlym", 3),
      p("\\boffer", 3),
      p("\\bbooking\\b", 2),
      p("предложени", 3),
      p("\\bangebot\\b", 2),
      p("(ką\\s+man\\s+siūlo|what.{0,8}offered|что.{0,8}предлага)", 2),
    ],
  },
  {
    intent: "next-action",
    patterns: [
      p("(ką\\s+dar|ką\\s+man).{0,20}(padaryti|daryti|reikia)", 3),
      p("(what|what'?s)\\s+(next|else|left|should\\s+i\\s+do)", 3),
      p("что\\s+(дальше|ещё|еще)\\b", 3),
      p("\\bnext\\s+step", 2),
      p("\\bkitas\\s+žingsn", 2),
    ],
  },
  {
    intent: "resume",
    patterns: [
      p("(kur\\s+(aš\\s+)?sustojau|kur\\s+likau|kur\\s+baigiau)", 3),
      p("(where\\s+(did\\s+)?i\\s+(stop|leave\\s+off|left\\s+off))", 3),
      p("на\\s+чём\\s+я\\s+остановил", 3),
      p("\\bcontinue\\b", 1),
      p("\\btęsti\\b", 1),
    ],
  },
];

/**
 * Classify a sentence into a single conversation intent. Returns `unknown`
 * (score 0) when nothing matched, so the caller can degrade to an honest
 * fallback + starter chips (never a fabricated action).
 */
export function classifyIntent(text: string): IntentMatch {
  const q = (text ?? "").toLowerCase();
  if (!q.trim()) return { intent: "unknown", score: 0, matched: [] };

  let best: IntentMatch = { intent: "unknown", score: 0, matched: [] };
  for (const rule of RULES) {
    let score = 0;
    const matched: string[] = [];
    for (const { re, weight } of rule.patterns) {
      if (re.test(q)) {
        score += weight;
        matched.push(re.source);
      }
    }
    // Strictly-greater keeps the earliest rule on ties, which encodes our
    // specificity ordering (log-work before find-work, etc.).
    if (score > best.score) best = { intent: rule.intent, score, matched };
  }
  return best;
}
