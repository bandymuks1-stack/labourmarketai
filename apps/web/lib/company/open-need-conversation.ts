"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import { toActiveLocale } from "@/lib/i18n/config";
import { displayedWorkspaceOf, refuseStaleWorkspace } from "@/lib/company/stale-workspace";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owner decision A (2026-11-22, decision 0033) — "write about this need".
 *
 * A provider organization's manager (agency, subcontractor, brigade) writes to
 * the client about an OPEN need the organization may already see on its board,
 * without the client being named. The ONE gate is the database's own
 * open_need_message_party_v1 (20261122160000), which calls the board's gate
 * (list_open_demand_for_team_offer_v1) for this organization: zero rows for
 * anyone else. Only after it answered is the owner's profile id used — for the
 * server's participant insert, never sent to the browser.
 *
 * The thread is the existing conversation system, stamped 'open_need': the
 * client is shown to the provider as "Client XXXXXX" until the client chooses
 * to show its name (disclose_open_need_identity_v1). A pair that already
 * shares a thread reuses it (the one dedupe rule): they already know each
 * other. No first message is written for the provider.
 */
export async function openNeedConversationAction(formData: FormData): Promise<void> {
  await refuseStaleWorkspace(displayedWorkspaceOf(formData));
  const locale = toActiveLocale(String(formData.get("locale") ?? ""));
  const route = await resolveOpenNeedThread(
    String(formData.get("orgId") ?? ""),
    String(formData.get("requestId") ?? ""),
    locale,
  );
  redirect(route ?? `/${locale}/dashboard/communication?notice=cannot_open`);
}

async function resolveOpenNeedThread(orgId: string, requestId: string, locale: string): Promise<string | null> {
  if (!UUID.test(orgId) || !UUID.test(requestId)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await asAny(supabase).rpc("open_need_message_party_v1", {
    p_request_id: requestId,
    p_org_id: orgId,
  });
  if (error) return null;
  const party = ((rows ?? []) as { owner_profile_id: string | null; subject: string | null }[])[0];
  const owner = party?.owner_profile_id ?? null;
  if (!owner || owner === user.id) return null;

  // Passed only AFTER the gate above held.
  const result = await getOrCreateDirectConversation(
    owner,
    locale,
    party?.subject?.trim() || null,
    "allowed_open_need",
    { type: "open_need", id: requestId },
  );
  return result.ok ? `/${locale}/dashboard/communication/${result.data.id}` : null;
}

/**
 * The client shows its name in ONE open-need thread. The database decides who
 * may (disclose_open_need_identity_v1: only the need's owner, as a participant
 * of a thread about its own need); anyone else is refused.
 */
export async function discloseOpenNeedIdentityAction(formData: FormData): Promise<void> {
  const locale = toActiveLocale(String(formData.get("locale") ?? ""));
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!UUID.test(conversationId)) redirect(`/${locale}/dashboard/communication`);

  const supabase = await createClient();
  const { error } = await asAny(supabase).rpc("disclose_open_need_identity_v1", {
    p_conversation_id: conversationId,
  });
  if (error) console.warn("[open-need] disclose refused:", (error as { code?: string }).code ?? "unknown");
  revalidatePath(`/${locale}/dashboard/communication`);
  redirect(`/${locale}/dashboard/communication/${conversationId}`);
}

/**
 * Whether the caller is the hidden client of this open-need thread and has not
 * yet shown its name. Read under the caller's own RLS: the disclosure row is
 * visible to participants only. `isOwner` comes from the source context (the
 * route hint answers only to the need's owner).
 */
export async function readOpenNeedDisclosure(conversationId: string): Promise<boolean | null> {
  if (!UUID.test(conversationId)) return null;
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("open_need_identity_disclosures")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) return null;
  return !!data;
}
