import { buildReturnValue } from "@/lib/auth/redirect";
import {
  INTENT_REGISTRY,
  type IntentHandlerId,
  type RoutedIntent,
} from "@/lib/conversation/intent-registry";
import { classifyIntent } from "@/lib/conversation/intent-router";
// The possessive vocabulary lives with the other shared grammatical sources,
// never here: this module owns NO patterns (public-entry-real-intent.test.ts).
import { speaksOfOwnWork } from "@/lib/structuring/role-label";
import type { FirstRunIntent } from "@/lib/onboarding/first-run-intent";

/**
 * THE PUBLIC ENTRY — a visitor's own sentence, read by the ONE router.
 *
 * Frozen design contract 2026-09-05, package P1 ("Viešas įėjimas su tikru
 * intent'u"): the landing used to answer a visitor's question with a
 * scripted scenario. Now the visitor types what they need in their own
 * words and the SAME deterministic router the authenticated conversation
 * dispatches through (`classifyIntent`, lib/conversation/intent-router.ts)
 * says what was understood. This module is the read-only hook into that
 * router — it classifies, it never executes, it never writes, and it
 * carries no second intent vocabulary: every id below is a `RoutedIntent`
 * the registry already holds.
 *
 * PURE: no React, no IO, no server-only imports — safe on the client (the
 * landing is static) and trivially unit-testable.
 *
 * WHAT LEAVES THIS MODULE
 *   - a reading (recognised intent + the first-run family it belongs to,
 *     or "unrecognised" so the page can ask ONE question with two chips);
 *   - the `next` value the auth doors carry, so the sentence survives
 *     signup / login / onboarding through the EXISTING `lib/auth/redirect.ts`
 *     return-path mechanism and lands on `/dashboard?say=<sentence>` — no
 *     second hand-off channel, no storage, nothing the redirect sanitiser
 *     does not already govern.
 */

/** Hard cap on a sentence the entry will read or carry. Long enough for a
 *  real need ("Reikia 12 pastolininkų Roterdame nuo spalio 5 d., su VCA"),
 *  short enough that the `next` value stays a small, loggable path. */
export const PUBLIC_ENTRY_MAX_CHARS = 200;

/** The query key the sentence rides under on the post-auth destination.
 *  Consumed by the conversation surface; NOT in the redirect sanitiser's
 *  credential denylist, so `getSafeReturnPath` lets it through. */
export const PUBLIC_ENTRY_SAY_PARAM = "say";

/** Where the sentence is delivered after auth — the ONE conversation root. */
const CONVERSATION_ROOT = "/dashboard";

export type PublicEntryReading =
  | { readonly kind: "empty" }
  | { readonly kind: "unrecognised"; readonly sentence: string }
  | {
      readonly kind: "recognised";
      readonly sentence: string;
      readonly intent: RoutedIntent;
      /** The first-run identity family the intent belongs to — the SAME
       *  five values onboarding asks about (`lib/onboarding/first-run-intent`). */
      readonly family: FirstRunIntent;
    };

/** Trim, collapse whitespace, cap. Returns "" for nothing worth reading. */
export function normaliseEntrySentence(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, PUBLIC_ENTRY_MAX_CHARS);
}

/**
 * Which first-run family an intent belongs to — a PROJECTION of the intent
 * registry's own metadata (domain + handler), not a parallel vocabulary.
 * The registry says where each intent lands; this only answers the one
 * question the public entry has: is the visitor here to WORK, to HIRE, as
 * an AGENCY, as a STUDENT, or for an EDUCATION institution?
 */
const AGENCY_HANDLERS: ReadonlySet<IntentHandlerId> = new Set<IntentHandlerId>([
  "inviteClient",
  "clientDemand",
  "proposeCandidate",
  "proposalStatus",
]);
const EDUCATION_HANDLERS: ReadonlySet<IntentHandlerId> = new Set<IntentHandlerId>([
  "inviteStudent",
  "programmes",
]);
const STUDENT_HANDLERS: ReadonlySet<IntentHandlerId> = new Set<IntentHandlerId>([
  "learningCompass",
]);
/** Domains that only an organisation acts in. */
const HIRE_DOMAINS: ReadonlySet<string> = new Set(["company", "project", "admin"]);
/** Handlers in mixed domains that are the employer's side of the market. */
const HIRE_HANDLERS: ReadonlySet<IntentHandlerId> = new Set<IntentHandlerId>([
  "employerCandidates",
  "findWorkers",
  "interestInbox",
  "confirmWork",
  "timesheets",
  "timesheetImport",
  "workHours",
  "needService",
  "clientOffers",
]);

export function familyOfIntent(intent: RoutedIntent): FirstRunIntent {
  const { domain, handler } = INTENT_REGISTRY[intent];
  if (AGENCY_HANDLERS.has(handler)) return "agency";
  if (EDUCATION_HANDLERS.has(handler)) return "education";
  if (STUDENT_HANDLERS.has(handler)) return "student";
  if (HIRE_DOMAINS.has(domain) || HIRE_HANDLERS.has(handler)) return "hire";
  return "work";
}

/**
 * ── SOME HANDLERS BELONG TO BOTH ACTORS (owner readiness window, 2026-09-09)
 *
 * `familyOfIntent` is a projection of the REGISTRY, so it can only answer per
 * intent. For most intents that is exactly right — `find-workers` is an
 * employer's whatever the wording. `timesheetImport` is not: importing work
 * that already happened is §7's foundational journey for a PERSON *and* a
 * real employer task, and one constant cannot be true for both.
 *
 * Traced end to end before this existed, in both languages:
 *
 *   "I want to upload my old work history"      → hours-import
 *   "Noriu įkelti savo seną darbo istoriją"     → family `hire`
 *                                               → pre-tick ["hire"]
 *                                               → identity ["company"]
 *                                               → /dashboard/start/company
 *
 * So a person who says **MY** old work history was signed up as an
 * organisation and asked to create a company — and the chip they were then
 * offered points at `/dashboard/hours?import=1`, whose own page header calls
 * it *"the operator's daily surface"* and which answers `states.noCompany`
 * to anyone without one. That is SEP-5 (IDENTITY ≠ ROLE) on the very first
 * thing the product does with them.
 *
 * #1670, which built this front door two days earlier, was thinking of a
 * person throughout — three of the five sentences in its own docblock carry a
 * first-person possessive ("my", "meine", "mijn"), and its comment reads *"a
 * person asking to UPLOAD their history was shown JOB ADVERTS"*. The DOOR was
 * right and the actor behind it was mislabelled.
 *
 * WHY THE SENTENCE DECIDES, AND WHY HERE. Flipping the constant to `work`
 * would only move the error onto the employer who types "import our old
 * timesheets" into the same box. The sentence itself carries the answer, in
 * the same structural signal the router already trusts for
 * `profession-statement`: grammatical person. `familyOfIntent` keeps its
 * meaning and its signature — this refinement lives in `readPublicEntry`,
 * which is the ONLY consumer and which already holds the sentence.
 *
 * NOTHING ELSE MOVES. The intent, the chip and the destination are untouched;
 * a signed-in employer's timesheet import never calls this module at all.
 * What changes is which first-run card is pre-ticked for an anonymous visitor
 * — and therefore whether a person is handed a company they did not ask for.
 *
 * AND THE VOCABULARY IS NOT HERE. `speaksOfOwnWork` lives beside
 * `PROFESSION_STATEMENT_ANCHOR_SOURCE` in `lib/structuring/role-label.ts`,
 * because this module is guarded to own no patterns of its own — the first
 * draft of this fix put two regexes here and
 * `public-entry-real-intent.test.ts` refused it, correctly. A keyword table
 * kept in whichever surface needed it first is how two readings of the same
 * words drift apart (#1669).
 */
const ACTOR_AMBIGUOUS_HANDLERS: ReadonlySet<IntentHandlerId> =
  new Set<IntentHandlerId>(["timesheetImport"]);


/** Read one sentence through the canonical router. Never throws. */
export function readPublicEntry(raw: string | null | undefined): PublicEntryReading {
  const sentence = normaliseEntrySentence(raw);
  if (!sentence) return { kind: "empty" };
  const match = classifyIntent(sentence);
  if (match.intent === "unknown") return { kind: "unrecognised", sentence };
  return {
    kind: "recognised",
    sentence,
    intent: match.intent,
    family: familyForSentence(match.intent, sentence),
  };
}

/**
 * The family for THIS sentence — `familyOfIntent`, refined by grammatical
 * person for the handlers that genuinely belong to both actors. See
 * `ACTOR_AMBIGUOUS_HANDLERS` for the measurement that made this necessary.
 *
 * Exported so the guard can assert the refinement directly rather than only
 * through the reading.
 */
export function familyForSentence(
  intent: RoutedIntent,
  sentence: string,
): FirstRunIntent {
  const family = familyOfIntent(intent);
  if (family !== "hire") return family;
  if (!ACTOR_AMBIGUOUS_HANDLERS.has(INTENT_REGISTRY[intent].handler)) {
    return family;
  }
  // Only a first-person claim moves it. No possessive at all keeps the
  // registry's answer, so an employer's "import the old timesheets" is
  // unchanged and nothing is guessed from silence.
  return speaksOfOwnWork(sentence) ? "work" : family;
}

/**
 * The locale-less internal path the auth doors hand to `?next=`:
 * `/dashboard?say=<sentence>`. Built through the SAME `buildReturnValue`
 * the middleware uses, so the value obeys the same length cap and the same
 * query filtering as every other post-login return. `null` when there is no
 * sentence to carry — the door then falls back to the plain dashboard.
 */
export function entryReturnPath(sentence: string | null | undefined): string | null {
  const clean = normaliseEntrySentence(sentence);
  if (!clean) return null;
  const query = new URLSearchParams({ [PUBLIC_ENTRY_SAY_PARAM]: clean }).toString();
  return buildReturnValue(CONVERSATION_ROOT, query);
}

export type EntryDoor = "signup" | "login";

/**
 * The sentence back OUT of a `?next=` value — the return half of
 * `entryReturnPath`, and the reason it exists is owner window 11 §21.
 *
 * The sentence already survived authentication when the owner walked
 * production: `/lt/auth/login?next=%2Fdashboard%3Fsay%3DIe%C5%A1kau...` is
 * exactly what the landing emits. What did NOT survive was the person's
 * knowledge that it had: the login screen said "Prisijungti" and nothing
 * about what they had just asked for, so from where they stood the request
 * was gone. This lets the auth screens say it back.
 *
 * Defensive by construction: any malformed value yields `null` rather than
 * throwing, and the result is capped by `normaliseEntrySentence` exactly as
 * the outbound half is. It reads a value the page already received; it never
 * reaches a store and never widens what `?next=` may carry.
 */
export function sentenceFromReturnPath(next: string | null | undefined): string | null {
  if (typeof next !== "string" || !next) return null;
  const q = next.indexOf("?");
  if (q < 0) return null;
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(next.slice(q + 1)).get(PUBLIC_ENTRY_SAY_PARAM);
  } catch {
    return null;
  }
  const clean = normaliseEntrySentence(raw);
  return clean || null;
}

/** The locale-prefixed href of an auth door, carrying the sentence. */
export function entryDoorHref(
  locale: string,
  door: EntryDoor,
  sentence: string | null | undefined,
): string {
  const base = `/${locale}/auth/${door}`;
  const next = entryReturnPath(sentence);
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}
