import { PUBLIC_ENTRY_SAY_PARAM, readPublicEntry } from "@/lib/marketing/public-entry";
import { extractProfileSuggestions } from "@/lib/structuring/extract-profile-suggestions";
import { PROFESSION_SLUGS } from "@/lib/taxonomy/profession-skills";
import type { FirstRunIntent } from "./first-run-intent";

/**
 * The landing sentence, read by onboarding — PURE (no React, no IO).
 *
 * Measured on production 2026-09-06 (walk-real-person-join, build ca96605b):
 * a person typed "esu suvirintojas, ieškau darbo Norvegijoje" on the landing,
 * the door carried it as `?next=/dashboard?say=…` through signup, and the
 * onboarding wizard then asked "Ko atėjote?" with NOTHING pre-selected and
 * "Kokį darbą dirbi?" with an empty 49-entry select — the same two facts the
 * person had just stated. This module turns the carried sentence into the
 * wizard's DEFAULTS: the first-run family the ONE router already assigns to
 * the sentence (`readPublicEntry`, the same reading the landing showed), and
 * the profession the existing rule-based recogniser finds in it.
 *
 * Nothing here is declared on the person's behalf: a default is a ticked card
 * / a pre-chosen option the person still sees, can change, and must submit
 * (§7 — a suggestion, confirmed by the user). The profession is proposed only
 * when the recogniser finds EXACTLY ONE catalogue profession; two candidates
 * or none → the select stays empty, as today.
 */
export type LandingHandoff = {
  /** The person's own sentence (trimmed, capped), "" when none was carried. */
  readonly sentence: string;
  /** First-run cards to pre-tick — at most the ONE family the router read. */
  readonly intents: readonly FirstRunIntent[];
  /** A profession from the platform's own registry, or null (never guessed). */
  readonly professionSlug: string | null;
};

export const EMPTY_HANDOFF: LandingHandoff = Object.freeze({
  sentence: "",
  intents: [],
  professionSlug: null,
});

/** `?say=` out of a locale-less OR locale-prefixed return path. Never throws. */
export function sentenceFromReturnPath(next: string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "";
  try {
    const url = new URL(next, "http://internal.invalid");
    return (url.searchParams.get(PUBLIC_ENTRY_SAY_PARAM) ?? "").trim();
  } catch {
    return "";
  }
}

/** ONE catalogue profession named in the sentence, else null. */
export function professionFromSentence(sentence: string): string | null {
  if (!sentence) return null;
  const found = extractProfileSuggestions(sentence).professionSlugs.filter((s) =>
    PROFESSION_SLUGS.includes(s),
  );
  return found.length === 1 ? found[0] : null;
}

export function readLandingHandoff(next: string | null | undefined): LandingHandoff {
  const raw = sentenceFromReturnPath(next);
  if (!raw) return EMPTY_HANDOFF;
  const reading = readPublicEntry(raw);
  if (reading.kind === "empty") return EMPTY_HANDOFF;
  return {
    sentence: reading.sentence,
    intents: reading.kind === "recognised" ? [reading.family] : [],
    professionSlug: professionFromSentence(reading.sentence),
  };
}
