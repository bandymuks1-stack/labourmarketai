/**
 * Does a public request read as an advertisement sent to us, rather than a need?
 *
 * Since the owner's spam order (2026-11-09) a NEW request that reads as an advert is not
 * stored at all (`lib/security/public-form-guard.ts` refuses it before the RPC). The
 * queue still shows this reading as a label on rows stored before that. A genuine
 * request read as an advert is now refused and told "could not send", so this still
 * errs towards "genuine": a company may well paste its own website, and a link alone
 * proves nothing.
 *
 * It takes a link plus one pitch, or two pitches. Each pitch below is something a seller
 * says about their own offer, not something a company says about work it needs done, so
 * "email campaigns" or "cold calling" are left out: both can be the job being hired for.
 */

const LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|org|net|io|ai|co|app|biz|info|shop|site|online|world|top|xyz)\b/i;

const PITCHES: readonly RegExp[] = [
  /freeb2bdata|companyscout/i,
  /\bb2b data\b|\blead finder\b/i,
  /\b\d[\d.,]*\s*(?:million|mln)\s+(?:companies|people|contacts|emails|leads)\b/i,
  /\bverified e-?mails?\b/i,
  /\bunlimited (?:csv )?exports?\b|\bexport (?:it|them) to csv\b/i,
  /\blifetime (?:access|seat|deal)\b|\bclaim your (?:lifetime )?seat\b/i,
  /\bearn \d+% commission\b/i,
  /\bunsubscribe\b|\brather not hear from (?:me|us)\b|\byou didn['’]t ask for (?:it|this)\b/i,
  /\brank (?:on|in) google\b|\bguest posts?\b/i,
  /\bdatabase of (?:[\d.,]+\s*(?:million|mln)?\s*)?(?:companies|businesses|contacts|leads)\b/i,
  /\b(?:lead|e-?mail|contact) lists?\b/i,
  /\bopt[- ]out\b|\bremove (?:me|you) from (?:this|our|the) list\b/i,
];

/**
 * How many links or bare domains the text carries. One whitespace-separated token is one
 * link, so `https://www.firma.lt/apie` counts once although LINK matches it twice.
 */
export function countLinks(...freeText: readonly (string | null | undefined)[]): number {
  return freeText
    .filter(Boolean)
    .join("\n")
    .split(/\s+/)
    .filter((token) => LINK.test(token)).length;
}

export function looksLikeAdvertising(...freeText: readonly (string | null | undefined)[]): boolean {
  const text = freeText.filter(Boolean).join("\n");
  const pitches = PITCHES.filter((pitch) => pitch.test(text)).length;
  return pitches >= 2 || (pitches === 1 && LINK.test(text));
}
