import { locales } from "@/lib/i18n/config";
import { PUBLIC_ENTRY_SAY_PARAM, readPublicEntry } from "@/lib/marketing/public-entry";
import { extractProfileSuggestions } from "@/lib/structuring/extract-profile-suggestions";
import { PROFESSION_SLUGS } from "@/lib/taxonomy/profession-skills";
import {
  FIRST_RUN_INTENTS,
  INTENT_IDENTITY,
  nextPathForIntents,
  type FirstRunIntent,
} from "./first-run-intent";

/**
 * The landing hand-off, read by onboarding — PURE (no React, no IO).
 *
 * TWO things the landing can carry inside `?next=`, ONE mechanism:
 *
 * 1. The person's SENTENCE (`/dashboard?say=…`). Measured on production
 *    2026-09-06 (walk-real-person-join, build ca96605b): a person typed
 *    "esu suvirintojas, ieškau darbo Norvegijoje" on the landing, the door
 *    carried it through signup, and the onboarding wizard then asked "Ko
 *    atėjote?" with NOTHING pre-selected and "Kokį darbą dirbi?" with an
 *    empty 49-entry select — the same two facts the person had just stated.
 *    The sentence becomes the wizard's DEFAULTS: the first-run family the
 *    ONE router already assigns to it (`readPublicEntry`, the same reading
 *    the landing showed) and the profession the existing rule-based
 *    recogniser finds in it.
 *
 * 2. A named DOOR (`/dashboard/start/company?capability=training_provider`).
 *    Measured on production 2026-09-06 (lanes F + C, build dd5d92c3): the
 *    landing's institution door "Atstovauju mokyklai, kolegijai ar
 *    universitetui" carried that path through signup — the SAME path the
 *    first-run router hands an `education` intent — and the wizard again
 *    showed "Ko atėjote?" with nothing ticked, so college staff had to guess
 *    that "Atstovauju mokymo įstaigai" was theirs. The door's path is read
 *    BACK through the router (`nextPathForIntents` inverted, never a retyped
 *    table of capability strings): the intents whose routed destination the
 *    carried path already IS are the cards to pre-tick. An unknown
 *    capability or type is not a door → nothing is ticked.
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
  /** First-run cards to pre-tick — the ONE family the router read from the
   *  sentence, else the intents the carried door routes to. */
  readonly intents: readonly FirstRunIntent[];
  /** A profession from the platform's own registry, or null (never guessed). */
  readonly professionSlug: string | null;
  /** The intents whose routed destination the carried path already IS
   *  (`nextPathForIntents` inverted) — empty when `next` is not a landing
   *  door. The wizard uses it to let the person's final choice decide the
   *  destination: keeping the tick lands on the door's own path. */
  readonly door: readonly FirstRunIntent[];
};

export const EMPTY_HANDOFF: LandingHandoff = Object.freeze({
  sentence: "",
  intents: [],
  professionSlug: null,
  door: [],
});

/**
 * The landing door (final CTA band, `lib/marketing/public-doors.ts`) whose
 * plain words name each company intent — the `landing.cta.*` key the
 * onboarding page shows back ("Jūs pasirinkote: „Atstovauju mokyklai…“").
 * Only company intents can be doors (a worker door carries no path).
 */
export const DOOR_WORDS_KEY: Readonly<
  Partial<Record<FirstRunIntent, "employer" | "agency" | "institution">>
> = {
  hire: "employer",
  agency: "agency",
  education: "institution",
};

const LOCALE_PREFIX = new RegExp(`^/(?:${locales.join("|")})(?=/|$)`);

/** Parse a locale-less OR locale-prefixed internal path; null when it is not
 *  one (foreign URL, empty, malformed). Never throws. */
function parseReturnPath(next: string | null | undefined): URL | null {
  if (typeof next !== "string" || !next.startsWith("/")) return null;
  try {
    const url = new URL(next.replace(LOCALE_PREFIX, "") || "/", "http://internal.invalid");
    return url.host === "internal.invalid" ? url : null;
  } catch {
    return null;
  }
}

/** pathname + sorted query (the sentence excluded) — order-insensitive
 *  identity of a routed destination. */
function routeKey(url: URL): string {
  const params = [...url.searchParams.entries()]
    .filter(([k]) => k !== PUBLIC_ENTRY_SAY_PARAM)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${url.pathname}?${new URLSearchParams(params).toString()}`;
}

const COMPANY_INTENTS: readonly FirstRunIntent[] = FIRST_RUN_INTENTS.filter(
  (i) => INTENT_IDENTITY[i] === "company",
);

/** Every non-empty company-intent combination → the path the router hands
 *  it. Built once from `nextPathForIntents` itself, so the inverse can never
 *  drift from the router (a new preset appears here without a second table). */
const ROUTED_DOORS: ReadonlyMap<string, readonly FirstRunIntent[]> = (() => {
  const map = new Map<string, readonly FirstRunIntent[]>();
  const n = COMPANY_INTENTS.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const intents = COMPANY_INTENTS.filter((_, idx) => mask & (1 << idx));
    const path = nextPathForIntents(intents);
    const url = path ? parseReturnPath(path) : null;
    // canonical-order subsets are enumerated smallest-first per key; the
    // first (fewest intents) wins so a bare path maps to `hire`, not to a
    // superset that happens to route the same way.
    if (url && !map.has(routeKey(url))) map.set(routeKey(url), intents);
  }
  return map;
})();

/** `?say=` out of a locale-less OR locale-prefixed return path. Never throws. */
export function sentenceFromReturnPath(next: string | null | undefined): string {
  const url = parseReturnPath(next);
  return (url?.searchParams.get(PUBLIC_ENTRY_SAY_PARAM) ?? "").trim();
}

/** The first-run intents whose routed destination `next` already IS —
 *  `nextPathForIntents` read backwards. `[]` for anything else (a worker
 *  path, an invitation deep link, an unknown capability or type). */
export function doorIntentsFromReturnPath(
  next: string | null | undefined,
): readonly FirstRunIntent[] {
  const url = parseReturnPath(next);
  return url ? (ROUTED_DOORS.get(routeKey(url)) ?? []) : [];
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
  const door = doorIntentsFromReturnPath(next);
  const raw = sentenceFromReturnPath(next);
  const reading = raw ? readPublicEntry(raw) : null;
  if (!reading || reading.kind === "empty") {
    return door.length > 0
      ? { sentence: "", intents: door, professionSlug: null, door }
      : EMPTY_HANDOFF;
  }
  return {
    sentence: reading.sentence,
    // The person's own words win over the door they came through; a sentence
    // the router could not read leaves the door's cards ticked.
    intents: reading.kind === "recognised" ? [reading.family] : door,
    professionSlug: professionFromSentence(reading.sentence),
    door,
  };
}
