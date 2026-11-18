/**
 * MINIMUM NECESSARY PAYLOAD for `translate_vacancy` (owner decision
 * 2026-09-22: "Use minimum necessary vacancy fields only. Exclude
 * personal/contact data and unnecessary source payload.").
 *
 * An advertisement's body is third-party prose. It often carries the one
 * thing this platform has no business sending to a translation provider: a
 * named person's e-mail address or phone number ("Kontakt: Anna Svensson,
 * anna.svensson@x.se, +46 70 123 45 67"). The reader needs those bytes on
 * screen, the provider does not need them at all.
 *
 * So they never travel: each match is replaced with an opaque token before
 * the call and restored verbatim afterwards. A token carries no meaning a
 * model could translate, and the restore puts the PUBLISHER'S OWN CHARACTERS
 * back — never a model's rendering of them, so a phone number cannot be
 * "corrected" by a translator.
 *
 * This is a FILTER, not a guarantee about prose: a contact named only in
 * words is not detectable, which is exactly why the task stays classified
 * `SENSITIVE_FREE_TEXT` and grant-gated rather than being argued down to
 * PUBLIC on the strength of this file.
 *
 * Pure. No IO, no server-only, no provider.
 */

/** The token shape. Deliberately ASCII, bracketed and numbered: it survives
 *  a translation unchanged in every locale the product serves, and a missing
 *  one is trivially detectable (`restoreRedactions` reports it). */
const TOKEN = (i: number) => `[[${i}]]`;
const TOKEN_RE = /\[\[(\d+)\]\]/g;

/**
 * Patterns for the contact classes a job advertisement actually carries.
 * Ordered longest-first so an e-mail inside a URL is not half-matched.
 *
 *  - e-mail      anna.svensson@x.se
 *  - URL         https://x.se/jobs/1, www.x.se
 *  - phone       +46 70 123 45 67, 070-1234567, (08) 123 456
 *
 * THE PHONE SHAPE IS THE DELICATE ONE, and it is deliberately conservative
 * in the direction that protects the FIGURES. A leading `+` is decisive. A
 * number without one is redacted only when it carries at least 9 digits and
 * is not a date — because "2026-10-01" (8 digits), "35 000 SEK", "24 m²" and
 * "8 timmar" are the contractual facts the digit check exists to protect,
 * and a redactor that ate a start date would be worse than no redactor.
 *
 * The cost of that choice, stated rather than hidden: a short local number
 * written without a country code ("(08) 123 456") is NOT detected. That is
 * one more reason the task stays `SENSITIVE_FREE_TEXT` and grant-gated.
 */
const ISO_DATE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/;
const EU_DATE = /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;

const PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /\bhttps?:\/\/[^\s<>"')]+/gi,
  /\bwww\.[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s<>"')]*)?/gi,
  /\+\d[\d\s().-]{6,}\d/g,
  /\b\d[\d\s().-]{7,}\d\b/g,
];

/** A no-plus candidate is a phone only when it is long enough AND is not a
 *  date. `+`-prefixed matches skip this test — they are never a date. */
function looksLikePhone(match: string): boolean {
  if (match.startsWith("+")) return true;
  const trimmed = match.trim();
  if (ISO_DATE.test(trimmed) || EU_DATE.test(trimmed)) return false;
  return (trimmed.match(/\d/g) ?? []).length >= 9;
}

export interface Redacted {
  /** What may leave the platform. */
  readonly text: string;
  /** token index → the publisher's own characters. */
  readonly tokens: readonly string[];
}

/** Replace contact data with tokens. Returns the text unchanged (and no
 *  tokens) when there is nothing to redact. */
export function redactContactData(input: string): Redacted {
  const tokens: string[] = [];
  let text = input;
  for (const re of PATTERNS) {
    const isPhone = re.source.includes("\\d[\\d\\s().-]");
    text = text.replace(re, (match) => {
      if (isPhone && !looksLikePhone(match)) return match;
      tokens.push(match);
      return TOKEN(tokens.length - 1);
    });
  }
  return { text, tokens };
}

export type RestoreResult =
  | { readonly ok: true; readonly text: string }
  /** The rendering lost or invented a token — it is refused, never shown. */
  | { readonly ok: false; readonly reason: "token_missing" | "token_unknown" };

/**
 * Put the publisher's own characters back. Refuses when the rendering does
 * not carry EXACTLY the tokens that were sent: a lost token means the
 * contact line was dropped from the translation, and an unknown one means
 * the model invented a marker — both are renderings that no longer match the
 * advertisement, so the original stands instead.
 */
export function restoreRedactions(
  rendered: string,
  tokens: readonly string[],
): RestoreResult {
  if (tokens.length === 0) return { ok: true, text: rendered };
  const seen = new Set<number>();
  let unknown = false;
  const text = rendered.replace(TOKEN_RE, (_m, raw: string) => {
    const i = Number(raw);
    const value = tokens[i];
    if (value === undefined) {
      unknown = true;
      return _m;
    }
    seen.add(i);
    return value;
  });
  if (unknown) return { ok: false, reason: "token_unknown" };
  if (seen.size !== tokens.length) return { ok: false, reason: "token_missing" };
  return { ok: true, text };
}
