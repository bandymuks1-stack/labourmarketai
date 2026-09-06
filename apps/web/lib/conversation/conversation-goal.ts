/**
 * CONVERSATION GOAL — the memory a multi-turn conversation was missing.
 *
 * OWNER P0, 2026-09-06 (window 7). Observed on production:
 *
 *   person : "Ieškau darbo pagal savo CV"
 *   system : offers the CV upload
 *   person : "tu jau turi mano duomenis"
 *   system : offers the CV upload again
 *
 * The defect was NOT two Lithuanian phrases. `handleSend` classified every
 * sentence from scratch (`classifyIntent`), so:
 *
 *   1. nothing carried the ACTIVE GOAL from one turn to the next — turn 3
 *      ("gerai, tada ieškok visoje Europoje") re-entered as a brand-new
 *      search and turn 4 ("rodyk tik nuo 3000 eurų") read as `unknown`;
 *   2. `runFindWork(text)` read World State out of the CURRENT sentence
 *      only, so an accumulated constraint from an earlier turn was lost;
 *   3. "tu jau turi mano duomenis" scored 0 in the router → the generic
 *      fallback with the SAME three starter chips, CV among them, forever;
 *   4. nothing recorded that an offer had just been refused, so the product
 *      could repeat it without limit.
 *
 * This module is the smallest canonical answer to all four, and it is PURE:
 * no I/O, no React, no Supabase, no locale files. It decides what KIND of
 * turn a sentence is relative to the goal already in flight, accumulates the
 * goal's constraints on the CANONICAL `DiscoveryFilterState` (never a second
 * filter vocabulary), and keeps the ledger of what has already been offered
 * and refused. Execution stays exactly where it was: the intent registry,
 * the dispatcher, the executors, the RPCs.
 *
 * WHAT IT DELIBERATELY IS NOT:
 *
 *   * not a second router — `classifyIntent` remains the deterministic floor
 *     and runs first; this module only asks "is this sentence a continuation
 *     of what we were already doing?";
 *   * not a phrase list for CV — the known-state reference, the correction
 *     and the refusal are recognised as GENERAL conversational moves in
 *     LT/EN/RU/NL/DE, and nothing here names a CV, an uploader or any
 *     specific action;
 *   * not a memory of content — no sentence text, no personal data and no id
 *     is retained beyond the constraints the person themself stated.
 *
 * GOAL ≠ INPUT METHOD (owner §2). "Find me work using my CV" is the goal
 * "find work" with the CV named as ONE possible source. The goal a turn
 * opens is therefore always the routed intent, never the medium it mentions;
 * `use-known-state` is the explicit instruction to stop asking for a source
 * the product may already hold.
 */

import {
  EMPTY_DISCOVERY_FILTERS,
  type DiscoveryFilterState,
} from "@/lib/opportunities/discovery-filters";
import type { UnsupportedDimension } from "@/lib/ai-workspace/world-state-language";
import { fold, UNICODE_WORD_BOUNDARY } from "@/lib/conversation/intent-router";
import type { ConversationIntent } from "@/lib/conversation/intent-router";

/**
 * ONE pattern builder, the same two corrections the router's `p()` makes —
 * because both are silent failures, not errors, and both cost a production
 * walk to find:
 *
 *   1. **The source is folded.** `classifyTurn` folds the incoming sentence
 *      (diacritics stripped), so a pattern that still carries them can never
 *      match. Cyrillic is not an edge case here: `fold` decomposes `й` to
 *      `и`, so "используйте" arrives as "используите" and a literal
 *      "используй" in a pattern matches nothing at all.
 *   2. **`\b` becomes the Unicode boundary.** JavaScript's `\b` is ASCII-only:
 *      between a space and `у` the engine sees no word boundary, so every
 *      Cyrillic pattern written with `\b` silently never fires.
 *
 * Sources are therefore written in plain folded lower case, and the builder —
 * never a bare `RegExp` literal — is what turns them into matchers.
 */
const rx = (source: string): RegExp =>
  new RegExp(fold(source).replace(/\\b/g, UNICODE_WORD_BOUNDARY), "u");

/**
 * Intents that OPEN a goal — a stated destination the next turns may refine.
 *
 * A goal-bearing intent is one where "and also in Belgium" or "no, twelve" is
 * a meaningful continuation. A read that simply shows a screen (`documents`,
 * `market-map`, `messages-view`) is complete in one turn and opens nothing:
 * carrying a goal for it would make the NEXT unrelated sentence look like a
 * follow-up. Keep this set small and behavioural, not aspirational.
 */
export const GOAL_BEARING_INTENTS: ReadonlySet<ConversationIntent> = new Set([
  "find-work",
  "opportunities",
  "need-workers",
  "find-workers",
  "need-service",
  "offer-value",
  "availability",
]);

/**
 * How many turns a goal survives without being restated. A goal is a memory
 * of intent, not a lock: after this many unrelated turns the person has
 * plainly moved on, and continuing to attach constraints to a stale goal
 * would be worse than forgetting it.
 */
export const GOAL_MAX_TURNS = 8;

export interface ConversationGoal {
  /** The intent that opened the goal — the handler every follow-up re-enters. */
  readonly intent: ConversationIntent;
  /** Turns this goal has survived, including the one that opened it. */
  readonly turns: number;
  /**
   * Constraints accumulated across the whole conversation, on the ONE
   * canonical filter state the board already applies. A later turn naming the
   * same dimension REPLACES it (that is what a correction is); a later turn
   * naming a new dimension ADDS to it.
   */
  readonly filters: DiscoveryFilterState;
  /** Dimensions the person named that the product cannot filter on yet —
   *  carried so the answer keeps saying so instead of silently dropping them. */
  readonly unsupported: readonly UnsupportedDimension[];
  /** Action ids offered while this goal was active (chip ids — the existing
   *  `handleChip` vocabulary, never a new namespace). */
  readonly offered: readonly string[];
  /** Action ids the person has refused or declared unnecessary. Nothing in
   *  this list may be offered again for this goal (owner §6, anti-loop). */
  readonly declined: readonly string[];
  /** The person has said the product already holds what it was asking for
   *  (owner §3). Once true, the answer must lead with what IS known. */
  readonly useKnownState: boolean;
  /**
   * The sentences that built this goal, oldest first and bounded.
   *
   * A handler that PREFILLS a form (an employer's demand intake) reads the
   * facts out of words, not out of `filters`. Without this, "Ne, 12." would
   * reopen the intake carrying only "12" and would lose the trade the person
   * named a turn earlier — a correction that destroys the thing it corrects.
   *
   * Client-side only, exactly as long as the goal lives: nothing here is
   * persisted by this module, sent to a vendor, or written to a row. The
   * thread's own transcript is a separate, already-existing mechanism.
   */
  readonly said: readonly string[];
}

/** How many sentences of one goal are kept for prefill composition. */
export const SAID_MEMORY = 4;

/**
 * What a new sentence IS, relative to the goal already in flight (owner §4).
 *
 * `unrelated` is the honest default: when nothing indicates continuation, the
 * sentence is routed normally and the goal is left alone. Guessing
 * continuation would be the mirror of the defect this module fixes.
 */
export type TurnKind =
  | "new-goal"
  | "follow-up"
  | "correction"
  | "use-known-state"
  | "confirmation"
  | "rejection"
  | "unrelated";

export function emptyGoal(intent: ConversationIntent): ConversationGoal {
  return {
    intent,
    turns: 1,
    filters: EMPTY_DISCOVERY_FILTERS,
    unsupported: [],
    offered: [],
    declined: [],
    useKnownState: false,
    said: [],
  };
}

/**
 * The words this goal has been described with, as ONE sentence for a handler
 * that reads facts out of language (form prefill, the profession reader).
 *
 * Later turns come LAST so a reader that lets the last mention win sees the
 * correction, not the value it replaced: "Reikia 10 mechanikų." + "Ne, 12."
 * reads as twelve mechanics, which is the single canonical state owner §9 F
 * requires — not two demands, and not ten.
 */
export function goalSentence(goal: ConversationGoal | null, latest: string): string {
  // `advanceGoal` has already appended this turn when it carried facts, so
  // the ledger is complete: joining it (rather than appending `latest` again)
  // is what keeps a refusal out of the words the handler reads.
  if (!goal || goal.said.length === 0) return latest;
  return goal.said.join(" ").trim();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Conversational moves. Five languages, general vocabulary, no product nouns.
 *
 * Every source is written against FOLDED text (diacritics stripped, lower
 * case) exactly like `intent-router`'s own patterns, because that is what
 * people type on a phone. `\w` is ASCII-only in JavaScript and would not
 * match Lithuanian or Cyrillic, so these use explicit character classes.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * "You already have this" — the person points at state the product holds
 * (owner §3/§4, turn 2 of the observed journey). Deliberately about POSSESSION
 * and EXISTING data in general: nothing here names a CV, a profile or a file,
 * so the same sentence works whatever the product had just asked for.
 */
const KNOWN_STATE_REFERENCE: readonly RegExp[] = [
  // LT — "tu jau turi mano duomenis", "juk turite mano profilį", "jau esu įkėlęs"
  rx("\\b(tu|jūs|jums|jau|juk)\\b[^.!?]{0,40}\\bturi(te|u|me)?\\b"),
  rx("\\bjau\\b[^.!?]{0,30}\\b(turi(te|u|me)?|esu|buvau|įkėl|įved|užpild|nurod|pateik|rašiau|sakiau)"),
  rx("\\bnaudo(k|kite|kis|kime|ti)\\b[^.!?]{0,40}\\b(mano|mūsų|esam|turim|profil|duomen|kortel|anket|žmon|darbuotoj)"),
  // EN
  rx("\\byou\\s+(already\\s+)?(have|got|hold)\\b"),
  rx("\\b(already|i\\s+already)\\s+(have|gave|sent|uploaded|filled|told|said)\\b"),
  rx("\\buse\\s+(my|our|the\\s+existing|what\\s+you\\s+have)\\b"),
  // RU
  rx("\\b(у\\s*(вас|тебя))\\b[^.!?]{0,30}(уже\\s+)?(есть|имеется)"),
  rx("\\bуже\\s+(есть|дал|отправ|загруз|запол|говорил|сказал)"),
  rx("\\bиспользуй(те)?\\b[^.!?]{0,30}(мо[йие]|наш|профил|данн)"),
  // NL
  rx("\\bje\\s+hebt\\s+(al|mijn)\\b"),
  rx("\\bgebruik\\s+(mijn|onze|wat\\s+je\\s+hebt)\\b"),
  // DE
  rx("\\b(du\\s+hast|sie\\s+haben)\\s+(schon|bereits|meine)\\b"),
  rx("\\b(nutze|verwende)\\s+(mein|unsere)\\b"),
];

/**
 * An explicit correction opener: "no, twelve". The NEGATION plus a restated
 * value is what makes it a correction rather than a refusal — the person is
 * not declining the goal, they are fixing one fact inside it.
 */
const CORRECTION_OPENER: readonly RegExp[] = [
  rx("^\\s*ne\\b\\s*[,.!-]?"), // LT "ne, 12"
  rx("^\\s*no\\b\\s*[,.!-]?"),
  rx("^\\s*нет\\b\\s*[,.!-]?"),
  rx("^\\s*nee\\b\\s*[,.!-]?"),
  rx("^\\s*nein\\b\\s*[,.!-]?"),
  // Mid-sentence corrections: "ne 30, o 300", "not 10 but 12"
  rx("\\b(ne|not|нет|nicht|niet)\\b[^.!?]{0,24}\\b(o|bet|but|а|sondern|maar)\\b"),
];

/** A refusal of what was just offered — no replacement value follows. */
const REJECTION: readonly RegExp[] = [
  rx("\\b(nereikia|nenoriu|nebūtina|nėra\\s+reikalo|praleisk|nesvarbu)\\b"),
  rx("\\b(don'?t\\s+(need|want)|no\\s+need|not\\s+needed|skip\\s+(that|it)|never\\s*mind)\\b"),
  rx("\\b(не\\s+нужно|не\\s+надо|не\\s+хочу|пропусти)\\b"),
  rx("\\b(niet\\s+nodig|hoeft\\s+niet|sla\\s+over)\\b"),
  rx("\\b(nicht\\s+nötig|brauche\\s+ich\\s+nicht|überspring)\\b"),
];

/** A plain yes — proceed with what was proposed. */
const CONFIRMATION: readonly RegExp[] = [
  rx("^\\s*(taip|gerai|tinka|sutinku|ok|okay|oké|gut|ja|da|да|yes|yep|prima|akkoord|einverstanden)\\b\\s*[.!]?\\s*$"),
  rx("^\\s*(tęsk|tęsti|pirmyn|continue|go\\s+ahead|davai|давай|weiter|ga\\s+door)\\b"),
];

/**
 * A short sentence that adds or narrows a fact rather than starting something
 * new: "Nuo spalio.", "Nyderlanduose arba Belgijoje.", "Jie turi VCA."
 *
 * The test is STRUCTURAL, not lexical — it is deliberately not a list of
 * countries or months, because such a list would be exactly the hard-coded
 * accumulation the owner forbade. A continuation is short, and it opens with
 * a connective / preposition / qualifier rather than an action verb. Anything
 * longer, or anything the router itself recognised as another goal, is not
 * treated as a follow-up.
 */
const FOLLOW_UP_MAX_WORDS = 9;

/**
 * A goal in flight is only displaced by a goal that was actually ASSERTED.
 *
 * The router scores by matched pattern weight, and a score of 1 is a single
 * weak signal — "Gali būti ir Nyderlanduose." scores 1 as `find-work` purely
 * because it names a country. Letting that outrank an employer's live
 * "Reikia 8 elektrikų" would flip the whole conversation from hiring to job
 * hunting on the word "Netherlands". Below this floor, a goal-bearing reading
 * is treated as what it is: a refinement of what we were already doing.
 */
const NEW_GOAL_MIN_SCORE = 2;

/**
 * A short turn that carries a value ("tik nuo 3000 eurų", "12", "nuo spalio")
 * is a refinement even when it opens with a verb the continuation list does
 * not hold. Structural, not lexical: a digit or a currency mark is a stated
 * fact, and a stated fact inside a live goal belongs to that goal.
 */
const CARRIES_VALUE = rx("[0-9]|€|\\beuro?\\b");

const CONTINUATION_OPENER: readonly RegExp[] = [
  // LT — "nuo spalio", "gali būti ir …", "tik …", "taip pat …", "jie turi …"
  rx("^\\s*(nuo|iki|per|ir|arba|taip\\s+pat|tik|dar|geriau|greičiau|gali\\s+būti|būtų\\s+gerai|jie|jos|jis|ji|mes|man|mums)\\b"),
  // EN
  rx("^\\s*(from|until|till|and|or|also|only|just|but|prefer(ably)?|ideally|maybe|they|we|it)\\b"),
  // RU
  rx("^\\s*(с|от|до|и|или|также|только|лучше|они|мы|можно)\\b"),
  // NL
  rx("^\\s*(vanaf|tot|en|of|ook|alleen|liever|zij|we|kan)\\b"),
  // DE
  rx("^\\s*(ab|bis|und|oder|auch|nur|lieber|sie|wir|kann)\\b"),
];

const anyMatch = (patterns: readonly RegExp[], folded: string): boolean =>
  patterns.some((re) => re.test(folded));

/** Words in the sentence — Unicode-aware, so LT and Cyrillic count correctly. */
function wordCount(folded: string): number {
  const m = folded.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

export interface ClassifyTurnInput {
  /** The raw sentence the person just sent. */
  readonly text: string;
  /** What the deterministic router made of it — the floor, already run. */
  readonly routedIntent: ConversationIntent;
  /** The router's matched-weight score for that reading. A weak reading may
   *  not displace a goal already in flight (see `NEW_GOAL_MIN_SCORE`). */
  readonly routedScore: number;
  /** The goal in flight, or null when the conversation has none. */
  readonly goal: ConversationGoal | null;
}

/**
 * Decide what this turn IS. Order matters and encodes the owner's §4 list:
 *
 *   1. no goal in flight → either this sentence opens one, or it is unrelated;
 *   2. an explicit reference to state the product holds beats everything —
 *      it is the sentence that must never re-trigger the same request;
 *   3. an explicit correction beats a new-goal reading, because "Ne, 12."
 *      routes as `unknown` and would otherwise fall to the fallback;
 *   4. a DIFFERENT goal-bearing intent is a genuinely new goal;
 *   5. the SAME goal-bearing intent restated is a follow-up carrying more;
 *   6. a short continuation phrase refines the goal in flight;
 *   7. everything else is unrelated and routes normally.
 */
export function classifyTurn(input: ClassifyTurnInput): TurnKind {
  const folded = fold((input.text ?? "").trim());
  if (folded === "") return "unrelated";

  const { goal, routedIntent } = input;
  const opensGoal = GOAL_BEARING_INTENTS.has(routedIntent);

  if (!goal) return opensGoal ? "new-goal" : "unrelated";

  // (2) "tu jau turi mano duomenis" — the instruction to use what is held.
  if (anyMatch(KNOWN_STATE_REFERENCE, folded)) return "use-known-state";

  // (3) "Ne, 12." — a fix inside the goal, not a refusal of it. A bare "ne"
  //     with nothing after it is a refusal, so a correction must still carry
  //     something (a number or another word) to replace the old fact with.
  if (anyMatch(CORRECTION_OPENER, folded) && wordCount(folded) >= 2) {
    return "correction";
  }

  if (anyMatch(REJECTION, folded)) return "rejection";
  if (anyMatch(CONFIRMATION, folded)) return "confirmation";

  // A goal-bearing reading this weak is a side effect of one matched word,
  // not a stated destination (see NEW_GOAL_MIN_SCORE).
  const weak = input.routedScore < NEW_GOAL_MIN_SCORE;

  // (4) a different destination, actually asserted.
  if (opensGoal && routedIntent !== goal.intent && !weak) return "new-goal";

  // (5) the same goal said again, usually with more in it.
  if (opensGoal && routedIntent === goal.intent) return "follow-up";

  // (6) a short refinement the router could not read, or read only weakly.
  if (
    weak &&
    wordCount(folded) <= FOLLOW_UP_MAX_WORDS &&
    (anyMatch(CONTINUATION_OPENER, folded) || CARRIES_VALUE.test(folded))
  ) {
    return "follow-up";
  }

  return "unrelated";
}

/**
 * Merge a turn's reading into the goal.
 *
 * A dimension present in `next` REPLACES the accumulated one — that is both
 * how a constraint is added and how a correction lands, and it is why nothing
 * here needs to know whether the turn was a correction: replacing a value the
 * person just restated is the same operation either way. A dimension the turn
 * does NOT mention is kept, which is the accumulation that was missing.
 *
 * `EMPTY_DISCOVERY_FILTERS` carries `null` for every field, so an unmentioned
 * dimension arrives as `null` and must not erase what is already held.
 */
export function mergeFilters(
  carried: DiscoveryFilterState,
  next: DiscoveryFilterState,
): DiscoveryFilterState {
  return {
    profession: next.profession ?? carried.profession,
    country: next.country ?? carried.country,
    start: next.start ?? carried.start,
    accommodation: next.accommodation ?? carried.accommodation,
    transport: next.transport ?? carried.transport,
    tool: next.tool ?? carried.tool,
    opportunityType: next.opportunityType ?? carried.opportunityType,
  };
}

export interface AdvanceGoalInput {
  readonly goal: ConversationGoal | null;
  readonly kind: TurnKind;
  readonly routedIntent: ConversationIntent;
  /** What this turn's sentence set, if anything was read out of it. */
  readonly filters?: DiscoveryFilterState;
  readonly unsupported?: readonly UnsupportedDimension[];
  /** The sentence this turn carried — kept on the goal for prefill. */
  readonly text?: string;
}

/**
 * The goal after this turn. Pure and total: every `TurnKind` has an answer,
 * so no branch can silently drop the conversation's memory.
 */
export function advanceGoal(input: AdvanceGoalInput): ConversationGoal | null {
  const { goal, kind, routedIntent } = input;
  const turnFilters = input.filters ?? EMPTY_DISCOVERY_FILTERS;
  const turnUnsupported = input.unsupported ?? [];

  const said = (input.text ?? "").trim();

  if (kind === "new-goal") {
    const fresh = emptyGoal(routedIntent);
    return {
      ...fresh,
      filters: mergeFilters(fresh.filters, turnFilters),
      unsupported: turnUnsupported,
      said: said ? [said] : [],
    };
  }

  if (!goal) return null;

  // The person moved on: age the goal, and forget it once it is plainly stale.
  if (kind === "unrelated") {
    return goal.turns + 1 > GOAL_MAX_TURNS ? null : { ...goal, turns: goal.turns + 1 };
  }

  // A refusal or a plain "yes" adds no facts to the goal, so neither joins
  // the prefill text: "nereikia" is not part of what the person is asking for.
  const carriesFacts =
    kind === "follow-up" || kind === "correction" || kind === "use-known-state";

  const merged: ConversationGoal = {
    ...goal,
    turns: goal.turns + 1,
    filters: mergeFilters(goal.filters, turnFilters),
    unsupported: mergeUnsupported(goal.unsupported, turnUnsupported),
    useKnownState: goal.useKnownState || kind === "use-known-state",
    said:
      carriesFacts && said ? [...goal.said, said].slice(-SAID_MEMORY) : goal.said,
  };

  return merged.turns > GOAL_MAX_TURNS ? null : merged;
}

function mergeUnsupported(
  carried: readonly UnsupportedDimension[],
  next: readonly UnsupportedDimension[],
): readonly UnsupportedDimension[] {
  if (next.length === 0) return carried;
  const seen = new Set<UnsupportedDimension>(carried);
  for (const d of next) seen.add(d);
  return [...seen];
}

/* ────────────────────────────────────────────────────────────────────────────
 * ANTI-LOOP (owner §6). General, not CV-specific: the ledger is keyed on the
 * ACTION ID that was offered, so it protects every offer the product makes.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Record what an answer offered, so a refusal can name it afterwards. Bounded:
 * only the most recent offers matter for deciding whether we are repeating
 * ourselves, and an unbounded list would grow with the conversation.
 */
export const OFFERED_MEMORY = 6;

export function noteOffered(
  goal: ConversationGoal | null,
  ids: readonly string[],
): ConversationGoal | null {
  if (!goal || ids.length === 0) return goal;
  const next = [...goal.offered, ...ids].slice(-OFFERED_MEMORY);
  return { ...goal, offered: next };
}

/**
 * The person refused or said the product already has it: everything that was
 * on the table at that moment is now declined, and may not be offered again
 * for this goal.
 *
 * This is the generic form of the observed loop. The product did not repeat
 * the CV request because of anything about CVs — it repeated it because
 * nothing remembered that it had just been turned down.
 */
export function declineOutstandingOffers(
  goal: ConversationGoal | null,
): ConversationGoal | null {
  if (!goal || goal.offered.length === 0) return goal;
  const declined = new Set([...goal.declined, ...goal.offered]);
  return { ...goal, declined: [...declined], offered: [] };
}

/** May this action still be offered for the goal in flight? */
export function mayOffer(goal: ConversationGoal | null, id: string): boolean {
  return !goal || !goal.declined.includes(id);
}

/**
 * Drop every declined action from a chip row, preserving order.
 *
 * Applied at the ONE place chips reach the thread, so no answer anywhere can
 * re-offer something the person has already refused — including answers
 * written long before this module existed.
 */
export function withoutDeclined<T extends { readonly id: string }>(
  goal: ConversationGoal | null,
  chips: readonly T[] | undefined,
): readonly T[] | undefined {
  if (!goal || !chips || chips.length === 0) return chips;
  if (goal.declined.length === 0) return chips;
  const kept = chips.filter((c) => mayOffer(goal, c.id));
  return kept.length === chips.length ? chips : kept;
}

/**
 * Does the goal already carry a constraint the person stated? Used by the
 * answer to say what it is about to search WITH (owner §7 readback) instead
 * of asking for it again.
 */
export function statedConstraintCount(goal: ConversationGoal | null): number {
  if (!goal) return 0;
  return Object.values(goal.filters).filter((v) => v !== null).length;
}
