"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import { evaluateTeamOfferContact } from "@/lib/communication/communication-eligibility";
import { listReceivedOffers } from "@/lib/company/team-offer";
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

  let side: "supplier" | "receiver" | null = null;
  let offerStatus: string | null = null;
  let counterpart: string | null = null;
  let subject: string | null = null;

  // Supplier side — the raw row is visible ONLY to the offering team's managers.
  const { data: own } = await asAny(supabase)
    .from("team_demand_offers")
    .select("id, status, request_id, team_org_id")
    .eq("id", offerId)
    .maybeSingle();

  if (own) {
    side = "supplier";
    offerStatus = (own as { status: string }).status;
    const admin = asAny(createAdminClient());
    const { data: req } = await admin
      .from("customer_requests")
      .select("profile_id")
      .eq("id", (own as { request_id: string }).request_id)
      .maybeSingle();
    counterpart = (req as { profile_id: string | null } | null)?.profile_id ?? null;
    const { data: team } = await admin
      .from("organizations")
      .select("display_name")
      .eq("id", (own as { team_org_id: string }).team_org_id)
      .maybeSingle();
    subject = (team as { display_name: string | null } | null)?.display_name?.trim() || null;
  } else if (UUID.test(requestId)) {
    // Receiver side — the receiver-gated listing must contain this offer.
    const received = await listReceivedOffers(requestId);
    const offer = received.status === "ok" ? received.rows.find((o) => o.offerId === offerId) : undefined;
    if (offer) {
      side = "receiver";
      offerStatus = offer.status;
      subject = offer.teamName;
      const { data: row } = await asAny(createAdminClient())
        .from("team_demand_offers")
        .select("offered_by, request_id")
        .eq("id", offerId)
        .maybeSingle();
      const r = row as { offered_by: string | null; request_id: string } | null;
      counterpart = r && r.request_id === requestId ? r.offered_by : null;
    }
  }

  if (evaluateTeamOfferContact({ offerStatus, side }) !== "allowed") return null;
  if (!counterpart || counterpart === user.id) return null;

  // Passed only AFTER the gate above held.
  const result = await getOrCreateDirectConversation(
    counterpart,
    locale,
    subject,
    "allowed_team_demand_offer",
  );
  return result.ok ? `/${locale}/dashboard/communication/${result.data.id}` : null;
}
