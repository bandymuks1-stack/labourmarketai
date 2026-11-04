/**
 * THE PUBLISHER'S DESCRIPTION AS READABLE TEXT — never as markup.
 *
 * Some official feeds deliver the description as HTML (NAV: every active ad,
 * 2026-11-04 — `<section>`, `<p>`, `<strong>`, `<li>`, entities such as
 * `&nbsp;`). The store keeps those words VERBATIM (`vacancy-contract.ts`:
 * the original is the fact). Rendering them as text showed the tags
 * themselves to readers (first real user's feedback, 2026-11-04).
 *
 * This turns the stored string into plain text for display and for the
 * translation input:
 *   - only a CLOSED list of formatting tags is recognised; block tags and
 *     `<br>` become line breaks, `<li>` becomes a bullet line, the rest drop;
 *   - `<script>` / `<style>` / `<head>` blocks are removed with their content;
 *   - entities are decoded ONCE, after the tags are gone, so `&lt;b&gt;`
 *     becomes the literal characters `<b>` — text, never a tag;
 *   - angle brackets that are not one of those tags (`< 30 m²`, `<10 år>`)
 *     are left as typed; a text with no recognised tag keeps its own breaks.
 *
 * The output is still rendered by React as a text node, so nothing here is a
 * sanitiser and nothing is ever passed to `dangerouslySetInnerHTML`.
 */

const BLOCK_TAGS =
  "p|div|section|article|header|footer|main|aside|h[1-6]|ul|ol|dl|dt|dd|table|thead|tbody|tfoot|tr|blockquote|pre|hr|figure|figcaption";
const INLINE_TAGS = "span|strong|b|i|em|u|s|small|sup|sub|font|a|abbr|code|mark|del|ins|label|img|th|td|caption|nobr|wbr|o:p";

const DROP_BLOCK_RE = /<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const UNCLOSED_RE = /<!--|<\/?(?:script|style|head|noscript)\b[^>]*>?/gi;
const BR_RE = /<br\b[^>]*\/?>/gi;
const LI_OPEN_RE = /<li\b[^>]*>/gi;
const LI_CLOSE_RE = /<\/li\s*>/gi;
const BLOCK_RE = new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi");
const INLINE_RE = new RegExp(`</?(?:${INLINE_TAGS})\\b[^>]*>`, "gi");
const ANY_KNOWN_TAG_RE = new RegExp(`</?(?:${BLOCK_TAGS}|${INLINE_TAGS}|br|li|script|style|head|noscript)\\b[^>]*>`, "i");

const NAMED: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", euro: "€",
  laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bdquo: "„",
  aring: "å", Aring: "Å", oslash: "ø", Oslash: "Ø", aelig: "æ", AElig: "Æ",
  auml: "ä", Auml: "Ä", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü", szlig: "ß",
  eacute: "é", Eacute: "É", egrave: "è", agrave: "à", aacute: "á", oacute: "ó",
  iacute: "í", uacute: "ú", ccedil: "ç", ntilde: "ñ", deg: "°", sup2: "²", times: "×",
  copy: "©", reg: "®", trade: "™", shy: "",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,8});/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
      return code === 0xa0 ? " " : String.fromCodePoint(code);
    }
    return NAMED[body] ?? whole;
  });
}

/** Plain, readable text from a stored vacancy description (HTML or not). */
export function vacancyDescriptionText(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n?/g, "\n");
  if (ANY_KNOWN_TAG_RE.test(text) || text.includes("<!--")) {
    // Removed until nothing changes, then any unclosed remnant: one pass over
    // "<scr<script></script>ipt>" would leave a fresh "<script>". The output
    // is text either way; this keeps it free of those openers too.
    let prev: string;
    do {
      prev = text;
      text = text.replace(COMMENT_RE, "").replace(DROP_BLOCK_RE, "");
    } while (text !== prev);
    do {
      prev = text;
      text = text.replace(UNCLOSED_RE, "");
    } while (text !== prev);
    // HTML source: its own line breaks are layout, not content.
    text = text
      .replace(/\s*\n\s*/g, " ")
      .replace(BR_RE, "\n")
      .replace(LI_OPEN_RE, "\n• ")
      .replace(LI_CLOSE_RE, "")
      .replace(BLOCK_RE, "\n\n")
      .replace(INLINE_RE, "");
  }
  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
