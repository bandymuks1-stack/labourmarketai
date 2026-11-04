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
 * translation input, in ONE pass over the string (no repeated replacing):
 *   - only a CLOSED list of formatting tags is recognised; block tags and
 *     `<br>` become line breaks, `<li>` becomes a bullet line, the rest drop;
 *   - `<script>` / `<style>` / `<head>` / `<noscript>` blocks and comments are
 *     removed with their content, to the end of the text when never closed;
 *   - entities are decoded ONCE, after the tags are gone;
 *   - LAST, every `<` that could open a tag gets a space after it, so the
 *     result holds NO tag start at all, whatever it was built from: a payload
 *     split around a removed block, an escaped `&lt;script&gt;`, or a tag we
 *     do not recognise. `< 30 m²` and `<10 år>` read as typed.
 *
 * The output is still rendered by React as a text node, so nothing is ever
 * passed to `dangerouslySetInnerHTML`; the last step holds even without that.
 */

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "blockquote", "pre", "hr",
  "figure", "figcaption",
]);
const INLINE_TAGS = new Set([
  "span", "strong", "b", "i", "em", "u", "s", "small", "sup", "sub", "font",
  "a", "abbr", "code", "mark", "del", "ins", "label", "img", "th", "td",
  "caption", "nobr", "wbr", "o:p",
]);
/** Removed WITH their content: what they hold was never words for a reader. */
const CONTENT_FREE_TAGS = new Set(["script", "style", "head", "noscript"]);

/** A complete tag at the sticky position: closing slash + name. */
const TAG_AT = /<(\/?)([a-z][a-z0-9:]*)\b[^<>]*>/iy;

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

function isKnownTag(name: string): boolean {
  return BLOCK_TAGS.has(name) || INLINE_TAGS.has(name) || name === "br" || name === "li" || CONTENT_FREE_TAGS.has(name);
}

/** The tag at `at`, when `text` holds a complete one there. */
function tagAt(text: string, at: number): { closing: boolean; name: string; end: number } | null {
  TAG_AT.lastIndex = at;
  const m = TAG_AT.exec(text);
  return m ? { closing: m[1] === "/", name: m[2].toLowerCase(), end: at + m[0].length } : null;
}

/** Whether this text is an HTML source: its own line breaks are then layout. */
function looksLikeHtml(text: string): boolean {
  for (let at = text.indexOf("<"); at !== -1; at = text.indexOf("<", at + 1)) {
    if (text.startsWith("<!--", at)) return true;
    const tag = tagAt(text, at);
    if (tag && isKnownTag(tag.name)) return true;
  }
  return false;
}

function htmlToLines(html: string): string {
  const source = html.replace(/\s*\n\s*/g, " ");
  const lower = source.toLowerCase();
  const out: string[] = [];
  let at = 0;
  while (at < source.length) {
    const lt = source.indexOf("<", at);
    if (lt === -1) {
      out.push(source.slice(at));
      break;
    }
    out.push(source.slice(at, lt));
    if (source.startsWith("<!--", lt)) {
      const close = source.indexOf("-->", lt + 4);
      at = close === -1 ? source.length : close + 3;
      continue;
    }
    const tag = tagAt(source, lt);
    if (!tag || !isKnownTag(tag.name)) {
      // Not a tag we know: the character stays, and the last step of
      // vacancyDescriptionText makes sure it cannot open one.
      out.push("<");
      at = lt + 1;
      continue;
    }
    if (CONTENT_FREE_TAGS.has(tag.name)) {
      if (tag.closing) {
        at = tag.end;
        continue;
      }
      const close = lower.indexOf(`</${tag.name}`, tag.end);
      const closeEnd = close === -1 ? -1 : source.indexOf(">", close);
      at = closeEnd === -1 ? source.length : closeEnd + 1;
      continue;
    }
    if (tag.name === "br") out.push("\n");
    else if (tag.name === "li") out.push(tag.closing ? "" : "\n• ");
    else if (BLOCK_TAGS.has(tag.name)) out.push("\n\n");
    at = tag.end;
  }
  return out.join("");
}

/** Plain, readable text from a stored vacancy description (HTML or not). */
export function vacancyDescriptionText(raw: string): string {
  if (!raw) return "";
  const text = raw.replace(/\r\n?/g, "\n");
  return decodeEntities(looksLikeHtml(text) ? htmlToLines(text) : text)
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/<(?=[a-z!/?])/gi, "< ")
    .trim();
}
