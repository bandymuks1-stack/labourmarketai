/**
 * SAFE MARKET LABEL — what a free-text role/work-type may say on the shared
 * market map.
 *
 * `customer_requests.role_or_work_type` and its location are typed by a
 * company in its own words. On the map those words reach OTHER people, so
 * nothing the company typed may carry a contact route or a link into the
 * label: an e-mail address, a phone number, a URL or a handle would turn a
 * map list row into a contact channel that bypasses the platform (and any
 * visibility rule on the company).
 *
 * This is a presentation guard, not a content filter: it removes the contact
 * tokens, collapses whitespace, keeps the first line and bounds the length.
 * If nothing sayable is left the caller falls back to the place name — never
 * to a guess. Pure, no I/O.
 */

export const MARKET_LABEL_MAX = 48;

const URL_OR_DOMAIN = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|eu|lt|lv|ee|pl|de|nl|ru|io|co|me|app)\b\S*/gi;
const EMAIL = /[^\s@<>()]+@[^\s@<>()]+/g;
const HANDLE = /(?:^|\s)@[\w.]{2,}/g;
/** 7+ digits, allowing the usual separators — a phone number, not "20 welders". */
const PHONE = /\+?\d(?:[\s().-]?\d){6,}/g;
const CONTACT_WORD = /(?<![\p{L}\p{N}])(?:tel|tlf|phone|mob|mobile|call|whatsapp|viber|telegram|signal|skype|email|e-mail|тел|телефон|звоните)(?![\p{L}\p{N}])\s*[:.]?/giu;

export function safeMarketLabel(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.split(/\r?\n/)[0] ?? "";
  text = text
    .replace(EMAIL, " ")
    .replace(URL_OR_DOMAIN, " ")
    .replace(HANDLE, " ")
    .replace(PHONE, " ")
    .replace(CONTACT_WORD, " ");
  text = text.replace(/\s+/g, " ").replace(/^[\s,;:|/\\\-–—•·.]+|[\s,;:|/\\\-–—•·.]+$/g, "");
  // Nothing letter-like left (only digits/punctuation) → nothing sayable.
  if (!/\p{L}/u.test(text)) return null;
  if (text.length <= MARKET_LABEL_MAX) return text;
  const cut = text.slice(0, MARKET_LABEL_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  const bounded = lastSpace >= MARKET_LABEL_MAX / 2 ? cut.slice(0, lastSpace) : cut;
  return `${bounded.replace(/[\s,;:.-]+$/, "")}…`;
}
