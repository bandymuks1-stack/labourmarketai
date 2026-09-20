"use server";

import { activeLocales, isCommunicationLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

/** Postgres undefined_column / PostgREST schema-cache column-not-found —
 *  the honest state while migration 20260920122000 is unapplied. */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

export type CommunicationLocaleWriteResult =
  | { readonly kind: "ok" }
  | { readonly kind: "invalid" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

/**
 * COMM-1 — persist the language this person prefers to READ work messages
 * in (`profiles.communication_locale`, owner-gated migration 20260920122000).
 *
 * Mirrors `persistLocalePreferenceAction` below — own row only, under the
 * unchanged `profiles_update` RLS (id = auth.uid()) — with two differences
 * the surface needs: the accepted set is the 13-language COMMUNICATION set
 * (`isCommunicationLocale`, NOT the active UI set — uk / ka have no route),
 * `null` clears the preference back to "same as the interface", and the
 * outcome is REPORTED so the control can revert and say why. `unavailable`
 * is the column not being applied yet (42703 / PGRST204) — a stated state,
 * never a silent success.
 */
export async function persistCommunicationLocaleAction(
  value: string | null,
): Promise<CommunicationLocaleWriteResult> {
  if (value !== null && (typeof value !== "string" || !isCommunicationLocale(value))) {
    return { kind: "invalid" };
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "error" };
    // The generated profiles Update type predates the owner-gated column; the
    // same loose cast bridge-read.ts uses, so the write compiles before apply
    // and degrades honestly (42703 → unavailable) until it is.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ communication_locale: value })
      .eq("id", user.id);
    if (error) {
      if (MISSING_COLUMN_CODES.has(error.code)) return { kind: "unavailable" };
      console.error("[communication-locale] write failed:", error.code);
      return { kind: "error" };
    }
    return { kind: "ok" };
  } catch {
    return { kind: "error" };
  }
}

/**
 * Persist a locale-switcher choice to the ACCOUNT (V8 W4-B item 2).
 *
 * Best-effort by design: the NEXT_LOCALE cookie already makes the switch work
 * on this device the moment the link navigates — this write only makes the
 * choice follow the account onto the next fresh device (read back by the auth
 * callback). Every failure path is silent: signed out, invalid input, RLS
 * refusal or a network error must never break the language switch itself.
 *
 * Own-row only — `profiles_update` RLS (id = auth.uid()) scopes the write,
 * the same path the active-role and active-organization writes already use.
 */
export async function persistLocalePreferenceAction(
  locale: string,
): Promise<void> {
  try {
    if (!(activeLocales as readonly string[]).includes(locale)) return;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ locale }).eq("id", user.id);
  } catch {
    /* best-effort — the cookie still carries the choice on this device */
  }
}
