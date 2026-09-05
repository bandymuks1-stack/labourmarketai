import { buildReturnValue } from "@/lib/auth/redirect";
import {
  INTENT_REGISTRY,
  type IntentHandlerId,
  type RoutedIntent,
} from "@/lib/conversation/intent-registry";
import { classifyIntent } from "@/lib/conversation/intent-router";
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
    family: familyOfIntent(match.intent),
  };
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
