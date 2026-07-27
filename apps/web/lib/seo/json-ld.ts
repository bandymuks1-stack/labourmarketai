/**
 * Safe JSON-LD serialization — security audit finding L-05.
 *
 * THE PROBLEM. Every JSON-LD block in this app was emitted as
 * `dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}`. `JSON.stringify`
 * escapes quotes and backslashes but NOT `<`, `>` or `/`. Inside a `<script>`
 * element the HTML parser has not finished — it scans for the literal
 * `</script`, so a string value containing `</script><script>...` closes the
 * data block early and everything after it is executed as script.
 *
 * Today every JSON-LD input here is repo-internal (content files, fixed category
 * labels, validated route params), so this is NOT currently exploitable. It is a
 * loaded gun: the day any of it starts carrying a worker's profile text, a
 * company name or a search term — all of which are user-controlled in this
 * product — it becomes stored XSS with no other code change.
 *
 * THE FIX. Escape the characters that can break out of a script element, using
 * JSON unicode escapes. These are valid inside a JSON string, so the parsed
 * value is byte-identical for consumers (Google, schema validators) — this
 * changes the ENCODING, never the data.
 *
 * U+2028 / U+2029 are also escaped: they are valid in JSON but are line
 * terminators in older JS parsers, which makes them a legacy injection vector.
 */

/** U+2028 LINE SEPARATOR / U+2029 PARAGRAPH SEPARATOR.
 *
 *  Built with `fromCharCode` rather than written literally so this source file
 *  stays pure ASCII — a raw U+2028 in a source file is itself a parser hazard,
 *  which is precisely the class of bug this module exists to prevent. */
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "/": "\\u002f",
  [LINE_SEP]: "\\u2028",
  [PARA_SEP]: "\\u2029",
};

/** Constructed from ESCAPES so the pattern and the map can never drift apart. */
const SCRIPT_BREAKOUT = new RegExp(
  `[${Object.keys(ESCAPES)
    .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
    .join("")}]`,
  "g",
);

/**
 * Serialize a value for embedding in `<script type="application/ld+json">`.
 *
 * Use this INSTEAD of `JSON.stringify` for every `dangerouslySetInnerHTML`
 * JSON-LD block. Enforced by `lib/seo/json-ld.test.ts`.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(SCRIPT_BREAKOUT, (c) => ESCAPES[c] ?? c);
}
