import "server-only";
import { getLocale } from "next-intl/server";

/**
 * The locale to record on a SERVER-emitted telemetry row (W14 — analytics
 * locale truth).
 *
 * ## The defect this replaces
 *
 * Every server-emitted event hardcoded `locale: "lt"`. The client tracker
 * (`lib/telemetry/task.ts`) reads the real locale off the path, so pilot_events
 * held a MIX: honest locales from the browser and a fabricated "lt" from every
 * server action. That is worse than uniformly wrong — a locale breakdown looks
 * plausible, and simply over-reports Lithuanian by however many events happen
 * to be emitted server-side. Nothing on the chart says which rows were guessed.
 *
 * ## Why the fallback is "unknown" and not the default locale
 *
 * When the request context cannot be read, the honest answer is that we do not
 * know — not that the user is Lithuanian. Falling back to `defaultLocale` would
 * reproduce exactly the bug being fixed, only with better intentions: an
 * unmeasured row would still enter the data as a measured one.
 *
 * `UNKNOWN_LOCALE` is deliberately visible in any breakdown, so a chart that
 * starts showing a lot of it is reporting a real gap rather than hiding it.
 * This is the same honesty contract the planning projection follows when it
 * NAMES a source it could not read instead of quietly dropping it.
 */

/** Recorded when the request locale genuinely cannot be resolved. */
export const UNKNOWN_LOCALE = "unknown";

export async function serverEventLocale(): Promise<string> {
  try {
    // next-intl resolves this from the active request. Outside a request scope
    // (a background job, a test harness) it throws rather than guessing —
    // which is the behaviour we want, because we would rather record
    // "unknown" than a locale nobody chose.
    const locale = await getLocale();
    const trimmed = locale?.trim();
    return trimmed ? trimmed.slice(0, 16) : UNKNOWN_LOCALE;
  } catch {
    return UNKNOWN_LOCALE;
  }
}
