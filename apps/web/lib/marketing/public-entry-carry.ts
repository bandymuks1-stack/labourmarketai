import { buildReturnValue } from "@/lib/auth/redirect";

/**
 * THE CARRY HALF of the public entry — how a visitor's sentence travels to
 * the conversation after sign-in. PURE and SMALL on purpose.
 *
 * Split from `lib/marketing/public-entry.ts` on 2026-11-12 (a lighter landing
 * first screen): that module also holds the READING half, which imports the
 * whole deterministic intent router. The landing's sentence field needs the
 * carry half to render (the cap on the field, the sign-in links) and the
 * reading half only once a person asks — so the field imports this file
 * statically and loads the router on first use. Everything here is
 * re-exported from `public-entry.ts`; other callers are unchanged.
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

/** Trim, collapse whitespace, cap. Returns "" for nothing worth reading. */
export function normaliseEntrySentence(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, PUBLIC_ENTRY_MAX_CHARS);
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
