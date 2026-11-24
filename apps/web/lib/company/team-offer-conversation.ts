"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import { evaluateTeamOfferContact } from "@/lib/communication/communication-eligibility";
import { toActiveLocale } from "@/lib/i18n/config";
import { displayedWorkspaceOf, refuseStaleWorkspace } from "@/lib/company/stale-workspace";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Open (or reopen) the negotiation thread of ONE brigade offer (2026-10-11).
 *
 * Before this, a buyer could only accept or decline a brigade offered against
 * their need, and the offering company could only wait: neither side could ask
 * a single question, clarify a start date or propose different terms. This is
 * the conversation step of supply → demand → offer → conversation → agreement.
 *
 * §8.1 discipline, the twin of the agency bridge action: the caller's side is
 * proven by the caller's OWN authorized read, never by a form field —
 *   - supplier: the offer row is readable under the caller's RLS
 *     (team_demand_offers_select_v1 admits the offering team's managers only);
 *   - receiver: the offer is listed by list_team_offers_for_request_v1, which
 *     answers rows only to the demand's owner / org demand-access holders.
 * Only AFTER that proof is the counterpart's profile id read server-side (the
 * demand owner, or the manager who made the offer) — it never reaches the
 * client. The offer must be live (offered / accepted / assigned).
 *
 * The thread carries no source stamp: the closed source-relation set
 * (20260706210000) has no offer member, and widening that CHECK is
 * owner-gated SQL (part of the supply-offer negotiation migration).
 */
export async function openTeamOfferConversationAction(formData: FormData): Promise<void> {
  await refuseStaleWorkspace(displayedWorkspaceOf(formData));
  const locale = toActiveLocale(String(formData.get("locale") ?? ""));
  const route = await resolveTeamOfferThread(
    String(formData.get("offerId") ?? ""),
    String(formData.get("requestId") ?? ""),
    locale,
  );
  redirect(route ?? `/${locale}/dashboard/communication?notice=cannot_open`);
}

/**
 * The chat door to the same thread ("rašyti komandai" from the offers answer):
 * the SAME gate, returning the route instead of redirecting. null = the gate
 * did not hold; the chat says so and opens nothing.
 */
export async function openTeamOfferThreadForChat(input: {
  offerId: string;
  requestId?: string | null;
  locale: string;
}): Promise<{ route: string | null }> {
  const locale = toActiveLocale(input.locale);
  return { route: await resolveTeamOfferThread(input.offerId, input.requestId ?? "", locale) };
}

async function resolveTeamOfferThread(offerId: string, requestId: string, locale: string): Promise<string | null> {
  if (!UUID.test(offerId)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // ONE party-gated read (20261012110000): the caller's side, the offer
  // status, the counterpart and the thread subject — or zero rows for anyone
  // who is not a party. The service-role reads this used to make were refused
  // in production (service_role holds no privilege on these tables), so the
  // thread never opened for either side.
  void requestId;
  const { data: rows, error } = await asAny(supabase).rpc("team_offer_thread_party_v1", { p_offer_id: offerId });
  if (error) return null;
  const party = ((rows ?? []) as {
    side: "supplier" | "receiver";
    offer_status: string;
    counterpart_profile_id: string | null;
    subject: string | null;
  }[])[0];
  if (!party) return null;
  const side = party.side;
  const offerStatus = party.offer_status;
  const counterpart = party.counterpart_profile_id;
  const subject = party.subject?.trim() || null;

  if (evaluateTeamOfferContact({ offerStatus, side }) !== "allowed") return null;
  if (!counterpart || counterpart === user.id) return null;

  // Passed only AFTER the gate above held.
  const result = await getOrCreateDirectConversation(
    counterpart,
    locale,
    subject,
    "allowed_team_demand_offer",
  );
  // ONE thread per pair stays the rule (the shared dedupe); the offer the
  // person opened it FROM travels with the route, so the thread names which
  // need and which offer is being discussed (party-checked again there).
  return result.ok ? `/${locale}/dashboard/communication/${result.data.id}?offer=${offerId}` : null;
}
