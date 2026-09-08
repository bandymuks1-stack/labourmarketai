import type { JournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";

/**
 * THE WORK-EVIDENCE GOAL PAYLOAD — what a multi-turn conversation about REAL
 * WORK accumulates, beside (never inside) the discovery filters.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────
 *
 * `conversation-goal.ts` already solved multi-turn memory: it carries the
 * active goal, ages it, remembers what was offered and refused, and keeps the
 * person's own sentences in `said`. Work-logging was simply not a goal-bearing
 * intent, so:
 *
 *   person : "Šiandien montavau PERI klojinius."
 *   system : "Kokią konstrukciją formavote?"
 *   person : "Sienas."          ← re-classified from scratch, context lost
 *
 * ── WHY IT IS A SEPARATE PAYLOAD AND NOT A FEW MORE FILTER FIELDS ─────────
 *
 * The goal's `filters` is `DiscoveryFilterState` — a SEARCH vocabulary
 * (profession, country, start, accommodation, transport, tool,
 * opportunityType). It answers "what am I looking for". Evidence answers
 * something categorically different: "what did I actually do". Pouring wall
 * formwork into a `tool` filter would give one field two meanings, and the
 * next reader could not tell a thing a person DID from a thing they are
 * SEARCHING FOR. That is the collapse this file exists to avoid, so the two
 * live side by side on the same goal and never share a field.
 *
 * ── THE SEPARATION IS STRUCTURAL, NOT A CONVENTION ────────────────────────
 *
 * `stated` holds only what the PERSON said. `derived` holds only what the
 * deterministic recognizer read out of their words. They are different objects
 * so nothing can drift between them by assignment, and a guard asserts the
 * shape. The RAW sentences stay where they already were — the goal's `said`
 * ledger — so all three tiers of SEP-1 are distinguishable at every turn:
 *
 *   raw sentence   goal.said            "Šiandien montavau PERI klojinius."
 *   stated fact    evidence.stated      object = "sienas", durationHours = 8
 *   inference      evidence.derived     skillSlugs = ["formwork"]
 *   confirmation   NOT HERE             the existing accept/reject path owns it
 *
 * Nothing in this module confirms anything. A draft is a conversation in
 * progress, never a competency the person holds.
 *
 * ── REUSE, NOT A SECOND PARSER ────────────────────────────────────────────
 *
 * Facts are read out of `JournalSuggestions`, the output of the recognizer the
 * Work Journal already uses. This module writes no regex over a person's
 * words. The one thing it adds is the trivially correct trick that makes a
 * conversation work at all: when the system has just asked about a dimension,
 * the next short sentence is the ANSWER to that dimension — so "Sienas." needs
 * no parser, only the memory of what was asked.
 *
 * PURE. No IO, no clock, no copy, no locale. Safe in client and server bundles.
 */

/** The dimensions a work-evidence conversation can be missing. */
export type EvidenceDimension =
  | "object"
  | "role"
  | "duration"
  | "quantity"
  | "context";

/**
 * How the person stood in the work.
 *
 * `assisted` is not a lesser human, it is a DIFFERENT claim — and keeping it
 * is what stops "I helped unload the formwork" from being read as "I install
 * formwork". Doctrine: a wrong signal is worse than none.
 */
export type EvidenceRole = "performed" | "assisted" | "led";

/** Facts the PERSON stated, in their own words. Never inferred, never merged
 *  with anything a recognizer produced. */
export interface StatedWorkFacts {
  /** The work itself, as the person first described it. */
  readonly activity: string | null;
  /** What the work was done to or on — the wall, the orders, the discs. */
  readonly object: string | null;
  readonly role: EvidenceRole | null;
  /** Hours, when the person gave a duration. */
  readonly durationHours: number | null;
  /** A count the person stated, kept with its unit and never turned into a
   *  quality claim: 128 orders is a quantity, not a standard of work. */
  readonly quantity: { readonly value: number; readonly unitSlug: string } | null;
  /** Site, project or place, when named. */
  readonly context: string | null;
}

/** What the deterministic recognizer read. DERIVED — never a fact about the
 *  person, never a competency they hold, never a verification. */
export interface DerivedWorkReadings {
  readonly skillSlugs: readonly string[];
  readonly workDirectionSlug: string | null;
  /**
   * The words in the PERSON'S OWN LANGUAGE that triggered each recognition.
   *
   * Carried because they are the honest bridge to a standardised meaning: an
   * ESCO label lookup wants "pastolius", not a whole sentence and not an
   * English slug. Keeping the person's word also keeps the correspondence
   * explainable - a mapping nobody can see the reason for is one they cannot
   * contest.
   */
  readonly matchedTerms: readonly string[];
}

export interface WorkEvidenceDraft {
  readonly stated: StatedWorkFacts;
  readonly derived: DerivedWorkReadings;
  /** Dimensions already asked about. A question is asked at most once, so a
   *  person is never interrogated in a loop about the same missing field. */
  readonly asked: readonly EvidenceDimension[];
}

export const EMPTY_STATED: StatedWorkFacts = {
  activity: null,
  object: null,
  role: null,
  durationHours: null,
  quantity: null,
  context: null,
};

export function emptyEvidenceDraft(): WorkEvidenceDraft {
  return {
    stated: EMPTY_STATED,
    derived: { skillSlugs: [], workDirectionSlug: null, matchedTerms: [] },
    asked: [],
  };
}

/**
 * How many follow-ups one work statement may earn.
 *
 * TWO. The addendum's own example asks twice and stops, and that is the right
 * instinct: a person logging a day's work is not filling in a form, and the
 * third question is where a helpful conversation turns into an interrogation.
 * If a dimension is still missing after this, the evidence is saved without
 * it — an incomplete record of real work beats an abandoned one.
 */
export const MAX_EVIDENCE_QUESTIONS = 2;

/** Read this turn's stated facts and derived readings out of the recognizer's
 *  existing output. No second parser. */
export function evidenceFromSuggestions(
  suggestions: JournalSuggestions,
  text: string,
): { readonly stated: StatedWorkFacts; readonly derived: DerivedWorkReadings } {
  const trimmed = text.trim();
  const hours =
    suggestions.time && suggestions.time.unitSlug === "hours"
      ? suggestions.time.value
      : suggestions.time && suggestions.time.unitSlug === "days"
        ? suggestions.time.value * 8
        : null;
  return {
    stated: {
      // The opening sentence IS the activity, in the person's own words. It is
      // never rewritten into a canonical phrase: the canonical reading lives
      // in `derived`, and overwriting the original would destroy the one thing
      // a person can recognise as theirs.
      activity: trimmed.length > 0 ? trimmed : null,
      object: null,
      role: null,
      durationHours: hours,
      quantity: suggestions.quantity
        ? { value: suggestions.quantity.value, unitSlug: suggestions.quantity.unitSlug }
        : null,
      context: suggestions.siteName ?? null,
    },
    derived: {
      skillSlugs: suggestions.skillSlugs ?? [],
      workDirectionSlug: suggestions.workDirectionSlug ?? null,
      matchedTerms: (suggestions.skillSuggestions ?? [])
        .map((r) => r.matchedText.trim())
        .filter((w) => w.length >= 2),
    },
  };
}

/**
 * Merge a turn into the draft. Later wins per dimension — the same rule the
 * discovery goal uses, and the same reason: a later turn naming a dimension
 * again is a CORRECTION, and a correction that does not win is not a
 * correction. Nothing is ever removed, only superseded; the raw sentence that
 * carried the earlier value stays in the goal's `said` ledger.
 */
export function mergeEvidenceDraft(
  carried: WorkEvidenceDraft,
  next: Partial<StatedWorkFacts>,
  derived?: Partial<DerivedWorkReadings>,
): WorkEvidenceDraft {
  return {
    stated: {
      // `activity` is deliberately FIRST-wins: it is the opening description
      // of the work, and a later short answer ("Sienas.") is an answer to a
      // question, not a new account of the day.
      activity: carried.stated.activity ?? next.activity ?? null,
      object: next.object ?? carried.stated.object,
      role: next.role ?? carried.stated.role,
      durationHours: next.durationHours ?? carried.stated.durationHours,
      quantity: next.quantity ?? carried.stated.quantity,
      context: next.context ?? carried.stated.context,
    },
    derived: {
      skillSlugs: mergeSlugs(carried.derived.skillSlugs, derived?.skillSlugs ?? []),
      workDirectionSlug:
        derived?.workDirectionSlug ?? carried.derived.workDirectionSlug,
      matchedTerms: mergeSlugs(carried.derived.matchedTerms, derived?.matchedTerms ?? []),
    },
    asked: carried.asked,
  };
}

function mergeSlugs(
  carried: readonly string[],
  next: readonly string[],
): readonly string[] {
  if (next.length === 0) return carried;
  return [...new Set([...carried, ...next])];
}

/**
 * The person answered the dimension we just asked about.
 *
 * This is why the conversation needs no new parser: "Sienas." is meaningless
 * on its own and unambiguous as the answer to "what were you forming". The
 * answer is kept VERBATIM — the product's job is to remember what someone
 * said, not to improve it.
 */
export function answerDimension(
  draft: WorkEvidenceDraft,
  dimension: EvidenceDimension,
  rawText: string,
): WorkEvidenceDraft {
  const value = rawText.trim();
  if (value.length === 0) return draft;

  const next: Partial<StatedWorkFacts> =
    dimension === "object"
      ? { object: value }
      : dimension === "context"
        ? { context: value }
        : dimension === "role"
          ? { role: readRole(value) ?? undefined }
          : dimension === "duration"
            ? { durationHours: readHours(value) ?? undefined }
            : { quantity: readQuantity(value) ?? undefined };

  return mergeEvidenceDraft(draft, next);
}

/**
 * Read a role from a free answer, in the five UI languages.
 *
 * Returns null when the answer names neither — an unreadable answer must not
 * become a guessed role. `assisted` is checked FIRST: "I mostly helped the
 * brigade" contains both ideas, and the modest reading is the safe one.
 */
export function readRole(text: string): EvidenceRole | null {
  const t = text.toLowerCase();
  if (/pad[ėe]j|talkin|help|assist|hielp|geholfen|halfen|помог|assisted/.test(t)) {
    return "assisted";
  }
  if (/vadovav|brigadinink|meistr|led\b|lead|leit|руковод|supervis/.test(t)) return "led";
  if (/pats|pati|montavau|dariau|atlik|myself|self|selbst|zelf|сам/.test(t)) {
    return "performed";
  }
  return null;
}

function readHours(text: string): number | null {
  const m = text.match(/(\d+([.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  // A day of work. Beyond this the number is not hours and guessing would put
  // a false fact on a person's record.
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : null;
}

function readQuantity(
  text: string,
): { readonly value: number; readonly unitSlug: string } | null {
  const m = text.match(/(\d+([.,]\d+)?)\s*([\p{L}²³]+)?/u);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return { value: n, unitSlug: (m[3] ?? "unit").toLowerCase() };
}

/**
 * The one question worth asking next, or null.
 *
 * MATERIALITY IS THE WHOLE POINT (addendum §4). A dimension is asked about
 * only when knowing it would change something downstream, and each rule below
 * says which downstream thing:
 *
 *   object    disambiguates the COMPETENCY. "I installed formwork" and "I
 *             installed wall formwork" are different capabilities to an
 *             employer, and the recognizer cannot tell them apart.
 *   role      separates DEMONSTRATED capability from presence. Asked only once
 *             the object is known, because "what did you do to what" must be
 *             settled before "how did you stand in it" means anything.
 *   duration  anchors the work in time — but ONLY when no quantity was given.
 *             Either one anchors it; asking for both is arithmetic, not
 *             conversation.
 *   context   is what makes VERIFICATION possible later. Asked last, because
 *             a person who has told us nothing about the work yet does not
 *             want to be asked who their employer was.
 *
 * NOT ASKED, deliberately: tools, materials, methods, safety, documents. Each
 * is real, and none of them changes what the product can do next for a person
 * who has just logged a day's work. The dimension list is not a form to be
 * completed — a question with no downstream consequence is an interruption.
 *
 * PROFESSION-AWARENESS COMES FROM THE MISSING FIELDS, NOT FROM A TRADE LIST.
 * "Surinkau 128 užsakymus" already carries object and quantity, so the next
 * question is about role, not about how many orders. "Montavau klojinius"
 * carries neither, so the object comes first. Nothing here names a trade, a
 * system or a manufacturer, which is what stops this from becoming a
 * construction-shaped — or a PERI-shaped — solution.
 */
export function nextEvidenceQuestion(
  draft: WorkEvidenceDraft,
): EvidenceDimension | null {
  if (draft.asked.length >= MAX_EVIDENCE_QUESTIONS) return null;

  const { stated } = draft;
  const unasked = (d: EvidenceDimension) => !draft.asked.includes(d);

  if (!stated.object && unasked("object")) return "object";
  if (stated.object && !stated.role && unasked("role")) return "role";
  if (!stated.durationHours && !stated.quantity && unasked("duration")) return "duration";
  if (!stated.context && unasked("context")) return "context";
  return null;
}

/** Record that a dimension was asked, so it is never asked twice. */
export function noteAsked(
  draft: WorkEvidenceDraft,
  dimension: EvidenceDimension,
): WorkEvidenceDraft {
  if (draft.asked.includes(dimension)) return draft;
  return { ...draft, asked: [...draft.asked, dimension] };
}

/**
 * Is there enough here to be worth saving as work evidence?
 *
 * Only the activity is required. A person who wrote one honest sentence about
 * their day has produced real evidence, and refusing it until they fill in
 * more fields is exactly the form-first product this must not become.
 */
export function isSaveableEvidence(draft: WorkEvidenceDraft): boolean {
  return (draft.stated.activity ?? "").trim().length > 0;
}
