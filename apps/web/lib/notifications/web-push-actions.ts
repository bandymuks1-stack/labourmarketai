"use server";

import "server-only";

/**
 * The two web-push writes a client may call: turn push on for THIS device,
 * turn it off. Both run under the caller's own session.
 *
 *   ON  — refused while the channel is not active (flag + VAPID keys), so a
 *         hidden feature cannot be switched on by a crafted request. The
 *         subscription is shape-checked and its endpoint must be a known push
 *         service (no server-side request to an arbitrary URL). It is stored
 *         through `register_web_push_subscription_v1`, which binds the
 *         endpoint to the caller (a browser endpoint moves to whoever signed
 *         in and subscribed last, so the previous account stops reaching this
 *         device). Then the person's opt-in is stored WITH the existing
 *         notification preferences (`*` / `push`).
 *   OFF — always allowed, even with the channel switched off: stopping
 *         notifications must never depend on a flag. Deletes this device's
 *         row (own-row RLS) and stores the opt-in as false.
 */
import { createClient } from "@/lib/supabase/server";
import { setPushOptIn } from "./notification-preferences";
import { webPushStatus } from "./web-push-config";
import { isAllowedPushEndpoint, isValidSubscription } from "./web-push-protocol";

export type WebPushActionResult =
  | { readonly kind: "ok" }
  | { readonly kind: "invalid" }
  | { readonly kind: "not_active" }
  | { readonly kind: "not_authenticated" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

const ABSENT = new Set(["42P01", "PGRST202", "PGRST205", "42883"]);

export async function registerWebPushSubscriptionAction(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<WebPushActionResult> {
  if (!webPushStatus().active) return { kind: "not_active" };
  if (!isValidSubscription(input)) return { kind: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not_authenticated" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("register_web_push_subscription_v1", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
  });
  if (error) {
    console.error("[web-push] register failed", { code: error.code });
    return ABSENT.has(error.code ?? "") ? { kind: "unavailable" } : { kind: "error" };
  }
  const pref = await setPushOptIn(supabase, { profileId: user.id, enabled: true });
  if (pref.kind !== "ok") return pref.kind === "feature_unavailable" ? { kind: "unavailable" } : { kind: "error" };
  return { kind: "ok" };
}

export async function unregisterWebPushSubscriptionAction(input: {
  endpoint: string | null;
}): Promise<WebPushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not_authenticated" };
  if (input.endpoint && isAllowedPushEndpoint(input.endpoint)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("web_push_subscriptions")
      .delete()
      .eq("profile_id", user.id)
      .eq("endpoint", input.endpoint);
    if (error && !ABSENT.has(error.code ?? "")) {
      console.error("[web-push] unregister failed", { code: error.code });
      return { kind: "error" };
    }
  }
  const pref = await setPushOptIn(supabase, { profileId: user.id, enabled: false });
  if (pref.kind !== "ok") return pref.kind === "feature_unavailable" ? { kind: "unavailable" } : { kind: "error" };
  return { kind: "ok" };
}
