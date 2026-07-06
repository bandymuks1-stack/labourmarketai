"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Open (or reopen) the buyer↔provider conversation for an ACCEPTED service
 * request — the marketplace loop's missing next step (root-cause audit PR4:
 * "the loop dies at acceptance; accepted rows are inert").
 *
 * §8.1 discipline, mirroring the scouting Step 4A action: the granting fact is
 * verified SERVER-SIDE here — the caller must be buyer or provider of the
 * request (RLS also enforces this on the read) and the status must be
 * `accepted` (the loop's one real mutual commitment). Only then is the
 * explicit `allowed_accepted_service_request` grant passed to
 * getOrCreateDirectConversation. No counterpart profile id ever reaches the
 * client — rows keep exposing display names only.
 *
 * Failure never bounces silently: it lands on the messages list with the
 * existing honest `?notice=cannot_open` restricted state.
 */
export async function openServiceRequestConversationAction(
  formData: FormData,
): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  const locale = String(formData.get("locale") ?? "lt");
  const cannotOpen = `/${locale}/dashboard/communication?notice=cannot_open`;

  if (!requestId) redirect(cannotOpen);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(cannotOpen);

  const { data: row } = await asAny(supabase)
    .from("service_offering_requests")
    .select("buyer_id, provider_id, status, service_offerings(title)")
    .eq("id", requestId)
    .maybeSingle();

  const req = row as {
    buyer_id: string;
    provider_id: string;
    status: string;
    service_offerings: { title: string | null } | null;
  } | null;

  if (!req || req.status !== "accepted") redirect(cannotOpen);
  const counterpart =
    user!.id === req!.buyer_id
      ? req!.provider_id
      : user!.id === req!.provider_id
        ? req!.buyer_id
        : null;
  if (!counterpart) redirect(cannotOpen);

  const subject = req!.service_offerings?.title?.slice(0, 120) ?? null;
  const result = await getOrCreateDirectConversation(
    counterpart,
    locale,
    subject,
    "allowed_accepted_service_request",
  );
  if (!result.ok) redirect(cannotOpen);
  redirect(`/${locale}/dashboard/communication/${result.data.id}`);
}
