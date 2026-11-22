"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { toActiveLocale } from "@/lib/i18n/config";
import { displayedWorkspaceOf, refuseStaleWorkspace } from "@/lib/company/stale-workspace";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owner decision A (2026-11-22, decision 0033; option 1 of the same day:
 * hidden IN THE THREADS, at the server) — "write about this need".
 *
 * A provider organization's manager (agency, subcontractor, brigade) writes to
 * the client about an OPEN need the organization may already see on its board,
 * without the client being named. The database does all of it in ONE call,
 * open_need_conversation_open_v1 (20261122160000): the board's own gate
 * (list_open_demand_for_team_offer_v1 for this organization), then the
 * caller's existing open-need thread for that need or a new one with both
 * participants, stamped 'open_need', under the same new-conversation cap. It
 * returns ONLY the thread id: the client's profile id never reaches this
 * server, let alone the browser. Never a thread the two already share — that
 * would link the anonymous need to a known person.
 *
 * In the thread the provider is "blinded" until the client chooses to show its
 * name (disclose_open_need_identity_v1): RLS gives it neither the client's
 * participant row nor the client's author id. No first message is written for
 * the provider.
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

  const { data, error } = await asAny(supabase).rpc("open_need_conversation_open_v1", {
    p_request_id: requestId,
    p_org_id: orgId,
  });
  if (error) {
    console.warn("[open-need] open refused:", (error as { code?: string }).code ?? "unknown");
    return null;
  }
  const conversationId = typeof data === "string" && UUID.test(data) ? data : null;
  if (!conversationId) return null;
  revalidatePath(`/${locale}/dashboard/communication`);
  return `/${locale}/dashboard/communication/${conversationId}`;
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
