"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
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
 * Only AFTER that proof does the database resolve the offer's ONE thread
 * (team_offer_thread_v1, 20261122214700): the open-need thread of the offering
 * person, the offering organization and the need, for both parties and before
 * and after acceptance. Only its id comes back; no profile id reaches this
 * server. The offer must be live (offered / accepted / assigned).
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
  }[])[0];
  if (!party) return null;
  const side = party.side;
  const offerStatus = party.offer_status;

  if (evaluateTeamOfferContact({ offerStatus, side }) !== "allowed") return null;

  // ONE negotiation thread per offer, for BOTH parties and across acceptance
  // (decision A, 20261122214700; Codex P2 on #3647): the database resolves the
  // open-need thread of the offering person, the offering organization and
  // the need — creating it when missing — and returns only its id. The client
  // stays unnamed to the supplier there until it chooses to show its name.
  const { data: threadId, error: openError } = await asAny(supabase).rpc("team_offer_thread_v1", {
    p_offer_id: offerId,
  });
  if (openError || typeof threadId !== "string" || !UUID.test(threadId)) return null;
  // The offer the person opened it FROM travels with the route, so the
  // thread names which offer is being discussed (party-checked again there).
  return `/${locale}/dashboard/communication/${threadId}?offer=${offerId}`;
}
