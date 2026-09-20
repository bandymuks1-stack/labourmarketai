import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommunicationLocale, type CommunicationLocale } from "@/lib/i18n/config";

/**
 * COMM-1 — the language a person prefers to READ work messages in.
 *
 * UI_LANGUAGE ≠ COMMUNICATION_LANGUAGE (owner contract RED-1, 2026-09-17).
 * `profiles.locale` is the UI locale (active routes only); this reads the
 * separate `profiles.communication_locale` column (owner-gated migration
 * 20260920122000), which may be any of the 13 communication languages —
 * including uk / ka, which have no UI route at all.
 *
 * Own row only: the caller reads their own profile under `profiles_select`.
 *
 * Honest degradation, not a silent default: while the column is unapplied
 * the read reports `unavailable` (42703 / PGRST204) so the settings surface
 * can say so; any other failure reports `error`. Only an `ok` read carries a
 * preference — and `null` there means "follow the UI locale", which is a
 * real stored state, not a swallowed failure.
 */
export type CommunicationLocaleRead =
  | { readonly kind: "ok"; readonly value: CommunicationLocale | null }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

/** Postgres undefined_column / PostgREST schema-cache column-not-found. */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

export function isMissingCommunicationLocaleColumn(
  code: string | null | undefined,
): boolean {
  return typeof code === "string" && MISSING_COLUMN_CODES.has(code);
}

export async function readCommunicationLocale(
  supabase: SupabaseClient,
  profileId: string,
): Promise<CommunicationLocaleRead> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("communication_locale")
      .eq("id", profileId)
      .maybeSingle();
    if (error) {
      if (isMissingCommunicationLocaleColumn(error.code)) return { kind: "unavailable" };
      console.error("[communication-locale] read failed:", error.code);
      return { kind: "error" };
    }
    const raw = (data as { communication_locale?: unknown } | null)?.communication_locale;
    return {
      kind: "ok",
      value: typeof raw === "string" && isCommunicationLocale(raw) ? raw : null,
    };
  } catch {
    return { kind: "error" };
  }
}

/**
 * The language a viewer READS work messages in: their stored preference when
 * the read succeeded and one is set, otherwise the UI locale of the page —
 * exactly today's behaviour for everyone who has not chosen.
 */
export function viewerLocaleFor(read: CommunicationLocaleRead, uiLocale: string): string {
  return read.kind === "ok" && read.value ? read.value : uiLocale;
}
