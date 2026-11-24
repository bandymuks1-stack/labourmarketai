import "server-only";

import { serverEventLocale } from "@/lib/telemetry/server-locale";

/**
 * The language a need was WRITTEN in, as stored on `customer_requests
 * .original_language`.
 *
 * Every demand write used to send the constant "lt". Measured 2026-10-11: a
 * Dutch owner's "We hebben 3 lassers nodig in Rotterdam…" was stored as
 * Lithuanian — a fact about the text that was simply false, and the one a
 * translation reader relies on. The request's UI locale is the language the
 * person was writing in; it is recorded when it is one the column accepts.
 *
 * Outside a request scope (no locale to read) the previous value "lt" is kept,
 * because the column's own default coalesces to it and the RPC accepts
 * nothing else as "unknown".
 */
const ACCEPTED = new Set(["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru", "uk", "ka"]);

export function acceptedDemandLanguage(locale: string | null | undefined): string {
  const l = (locale ?? "").trim().toLowerCase();
  return ACCEPTED.has(l) ? l : "lt";
}

export async function demandWrittenLanguage(): Promise<string> {
  return acceptedDemandLanguage(await serverEventLocale());
}
