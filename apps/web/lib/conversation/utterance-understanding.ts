/**
 * WHAT KIND OF THING DID THE PERSON JUST SAY? — the layer ABOVE the intent
 * router. Pure: no server-only import, no IO, no env.
 *
 * ── The defect this exists for ────────────────────────────────────────────
 * A staffing agency typed its OWN NAME into the chat:
 *
 *     "Baltic Staffing Group"  →  need-workers  (score 3)
 *
 * One weak keyword ("staffing") out of three tokens turned a company's name
 * into an employer DEMAND INTAKE — inverting SEP-4 (DEMAND ≠ SUPPLY) with
 * full confidence. "UAB Statybos Meistrai" became `log-work` on a score of 1.
 *
 * ── Why a score floor alone cannot fix it ─────────────────────────────────
 * Measured over every sentence the existing intent tests assert on:
 *
 *     "mano CV"                 score 3  → cv-choose   LEGITIMATE
 *     "Baltic Staffing Group"   score 3  → need-workers  THE DEFECT
 *
 * Score 3 holds 114 legitimate corpus sentences. There is no floor that
 * separates them, so the discriminator has to be SHAPE, not strength.
 *
 * ── The boundary ──────────────────────────────────────────────────────────
 * A match is demoted to `reference` only when BOTH hold:
 *
 *   1. it is REFERENCE-SHAPED — several tokens, every one capitalised in what
 *      the person actually typed, no digit, no question mark, and no
 *      first-person possessive. That is what a person typing an organisation
 *      or a human name produces, and it is not what a typed command produces:
 *      a command has a lowercase verb or object ("rodyk CV", "ieškau darbo",
 *      "покажи резюме"), which fails "every token capitalised";
 *
 *   2. the match is WEAK — below `ACTION_FLOOR`.
 *
 * Condition 2 is the safety belt for condition 1's known false positives:
 * "Rodyk CV" and "Show CV" ARE reference-shaped (sentence-case, two
 * capitalised tokens) but score 8, so they stay actions. Measured: the only
 * reference-shaped corpus sentences scoring at or above the floor are real
 * commands ("Player Card" 6, "Papildyti LMC" 9, "Bestätige Jans Arbeit" 10),
 * and every reference-shaped sentence below it is a company name, a person
 * name, a place or a test heading.
 *
 * ── What this module deliberately is NOT ──────────────────────────────────
 * It contains no company names, no entity list, no per-phrase special case
 * and no new intent. It cannot: it never sees the product's data. It asks one
 * question about the SHAPE of what was typed, and the caller decides what to
 * do with the answer — which for a reference is to RESOLVE IT AGAINST THE
 * CALLER'S OWN WORLD FIRST, and to ask when that does not settle it.
 */
import { classifyIntent, type ConversationIntent } from "@/lib/conversation/intent-router";

/**
 * Below this, a reference-shaped utterance is not treated as a command.
 *
 * MEASURED, not chosen: it is the lowest score at which the corpus contains
 * only real commands. Raising it would start demoting "Player Card" (6);
 * lowering it to 3 would fail to demote "Baltic Staffing Group" (3) without
 * also catching "mano CV" (3) — which is why the shape test, not this number,
 * does the actual separating.
 */
export const ACTION_FLOOR = 6;

/**
 * First-person possessives across the five routed locales.
 *
 * A phrase carrying one is about the SPEAKER, not about some third party, so
 * it is never a bare reference — "Mano CV" and "Моё CV" are capitalised in
 * exactly the way an organisation name is, and only this tells them apart.
 *
 * Compared token-by-token rather than with a `\b` word boundary: JavaScript's
 * `\b` is derived from ASCII `\w`, so `/\bмоё\b/` does not behave on Cyrillic.
 * That bug let "Моё CV" through the first draft of this module.
 */
const POSSESSIVES: ReadonlySet<string> = new Set([
  // lt
  "mano", "savo", "musu", "mūsų", "mus",
  // en
  "my", "our", "mine", "ours",
  // ru
  "мой", "моя", "моё", "мое", "мои", "моего", "моей",
  "свой", "своя", "своё", "свое", "свои",
  "наш", "наша", "наше", "наши",
  // nl
  "mijn", "onze", "ons",
  // de
  "mein", "meine", "meinen", "meiner", "meines",
  "unser", "unsere", "unseren", "unserer",
]);

/** Strip leading/trailing punctuation from a token, keeping letters. */
function core(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
}

/** Does this token begin with an upper-case letter in what was typed? */
function startsUpper(token: string): boolean {
  const first = core(token).charAt(0);
  if (!first) return true; // a punctuation particle, e.g. the "z" of "Sp. z o.o"
  return first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase();
}

/**
 * Does this read like a NAME rather than an instruction?
 *
 * Exported for the guard, which asserts the exact production sentences on it.
 */
export function looksLikeReference(text: string): boolean {
  const raw = (text ?? "").trim();
  if (!raw) return false;
  // A question is an instruction, however it is capitalised.
  if (/[?¿？]/.test(raw)) return false;
  // A quantity is the single strongest signal of a real demand or work entry
  // ("Reikia 8 Pastolininkų"), and no organisation name is mostly digits.
  if (/\d/.test(raw)) return false;
  const tokens = raw.split(/\s+/).filter((t) => core(t).length > 0 || t.length > 0);
  // One token is never enough to be sure ("CV"), and a long line is prose.
  if (tokens.length < 2 || tokens.length > 6) return false;
  if (tokens.some((t) => POSSESSIVES.has(core(t).toLocaleLowerCase()))) return false;
  return tokens.every(startsUpper);
}

/**
 * What the product decided the utterance IS.
 *
 * The owner's target shape distinguishes five things. Three of them are
 * produced here, and the two that are not have an honest home rather than an
 * inert variant:
 *
 *   · known actionable intent      → `intent`
 *   · possible entity / reference  → `reference`
 *   · unsupported / not understood → `none`
 *   · informational / question     → today these ARE intent ids (`capabilities`,
 *                                    `context`, `criteria`, `figures`…). They
 *                                    need no separate kind until an answer has
 *                                    to be composed rather than routed.
 *   · clarification required       → an OUTCOME, not a classification: it is
 *                                    what the caller does when a `reference`
 *                                    resolves to nothing and the model layer
 *                                    cannot place it either.
 */
/** Which layer produced the reading. Both normalise onto ONE union. */
export type UnderstandingSource = "deterministic" | "model";

/** Why nothing usable came back. `none` is not one of these — see below. */
export type UnsupportedReason =
  | "unauthenticated"
  | "empty"
  | "rate_limited"
  | "ai_unavailable"
  | "not_understood";

export type Understanding =
  | {
      readonly kind: "intent";
      readonly intent: Exclude<ConversationIntent, "unknown">;
      readonly score: number;
      readonly source: UnderstandingSource;
    }
  | {
      readonly kind: "reference";
      /** Exactly what the person typed — the caller resolves it, never this module. */
      readonly text: string;
      readonly score: number;
      /** What the weak match WOULD have fired, kept for telemetry and tests. */
      readonly suppressed: Exclude<ConversationIntent, "unknown"> | null;
      readonly source: UnderstandingSource;
    }
  | {
      /**
       * They are asking ABOUT something rather than asking for it to be done.
       * Only the model produces this: the deterministic router has no way to
       * tell a question from a command except by the ids it already owns.
       */
      readonly kind: "question";
      readonly text: string;
      /** A name the question is about, copied verbatim — unresolved. */
      readonly reference: string | null;
      readonly source: "model";
    }
  | {
      /**
       * A real message that is not yet a request — a correction ("ne, čia ne
       * mano CV"), a fragment, or something genuinely ambiguous. The product
       * ASKS. It does not guess, and it does not force the message into an
       * operation.
       */
      readonly kind: "clarification";
      readonly text: string;
      readonly source: "model";
    }
  | {
      /**
       * We asked and got nothing usable. DISTINCT from `none`: this one means
       * a real attempt was made and failed, which is a different sentence to
       * the person and a different fact for telemetry.
       */
      readonly kind: "unsupported";
      readonly reason: UnsupportedReason;
      readonly source: UnderstandingSource;
    }
  /** The deterministic layer found nothing. The model has NOT been asked yet. */
  | { readonly kind: "none" };

/**
 * THE ENTRY POINT. `classifyIntent` is untouched underneath — this is a layer
 * above it, so nothing that already routed correctly can change strength or
 * meaning. Only a weak match on a reference-shaped utterance is re-labelled.
 */
export function understand(text: string): Understanding {
  const match = classifyIntent(text);
  if (match.intent === "unknown" || match.score <= 0) return { kind: "none" };
  const intent = match.intent as Exclude<ConversationIntent, "unknown">;
  if (match.score < ACTION_FLOOR && looksLikeReference(text)) {
    return {
      kind: "reference",
      text: text.trim(),
      score: match.score,
      suppressed: intent,
      source: "deterministic",
    };
  }
  return { kind: "intent", intent, score: match.score, source: "deterministic" };
}
