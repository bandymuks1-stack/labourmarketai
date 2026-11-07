/**
 * Does a public request read as an advertisement sent to us, rather than a need?
 *
 * The row is always stored: this only decides whether someone is alerted, and the queue
 * shows the same reading as a label. A missed advert costs one mail. A genuine request
 * read as an advert loses the alert behind a 24-hour promise, so this errs towards
 * "genuine": a company may well paste its own website, and a link alone proves nothing.
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
];

export function looksLikeAdvertising(...freeText: readonly (string | null | undefined)[]): boolean {
  const text = freeText.filter(Boolean).join("\n");
  const pitches = PITCHES.filter((pitch) => pitch.test(text)).length;
  return pitches >= 2 || (pitches === 1 && LINK.test(text));
}
