import { isCommunicationLocale } from "@/lib/i18n/config";

/**
 * The language the composer starts in — the language the person most likely
 * WRITES, not just the page they are reading (chat audit 2026-11-11,
 * defect 2: a Swedish employer reading `/en` had Swedish text stamped `en`
 * unless they changed the dropdown, so no reader got a translation offer).
 *
 * In order, the first that is a supported message language:
 *   1. the language of the person's own most recent message in this thread
 *      (what they actually wrote last time);
 *   2. their browser's preferred languages (`Accept-Language`), in order —
 *      a Swede on the English page still has `sv` first;
 *   3. the page's UI locale.
 * A choice the person saved in this browser still wins on the client. The
 * dropdown always shows the result, so the stamp is never hidden. Pure.
 */
export function initialWriteLanguage(input: {
  readonly ownLastLanguage: string | null | undefined;
  readonly acceptLanguage: string | null | undefined;
  readonly uiLocale: string;
}): string {
  const own = (input.ownLastLanguage ?? "").trim().toLowerCase();
  if (own && isCommunicationLocale(own)) return own;
  for (const part of (input.acceptLanguage ?? "").split(",")) {
    const base = (part.split(";")[0] ?? "").trim().toLowerCase().split("-")[0] ?? "";
    if (base && isCommunicationLocale(base)) return base;
  }
  return isCommunicationLocale(input.uiLocale) ? input.uiLocale : "";
}
