"use server";

import { activeLocales } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

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
