"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import {
  agencyConnectionSide,
  evaluateAgencyConnectionContact,
} from "@/lib/communication/communication-eligibility";
import { isBridgeUuid } from "@/lib/agency/bridge-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Open (or reopen) the agency ↔ client conversation for an ACTIVE
 * connection (2026-09-24) — step 10 of the owner's acceptance walk, which
 * used to be impossible: `agency_client_connections` was no contact
 * permission at all, so two companies that had explicitly invited and
 * accepted each other could not exchange a single in-app message.
 *
 * §8.1 discipline, the twin of the accepted-booking action: the granting
 * facts are verified SERVER-SIDE here, and only then is the explicit
 * `allowed_agency_connection` grant passed to getOrCreateDirectConversation.
 *   - the connection row is read under RLS (the agency owner, the client
 *     owner, the invited e-mail, or admin can see it — nobody else);
 *   - its status must be `active` (invited AND accepted); pending, declined
 *     and revoked rows grant nothing;
 *   - the caller's SIDE is the ACTIVE workspace company from the
 *     membership-validated employer resolver, never a form field, and it
 *     must be exactly one of the two companies on the row;
 *   - the counterpart is the OTHER side's consenting person — the agency
 *     member who invited (`invited_by`) or the client member who accepted
 *     (`accepted_by`) — so the thread opens between the two people who
 *     actually made this relationship. No counterpart profile id ever
 *     reaches the client; the row carries e-mails and ids only server-side.
 *
 * The conversation carries no source stamp: the closed source-relation set
 * (migration 20260706210000) has no bridge member, and widening a CHECK
 * constraint is owner-gated SQL — recorded as residue, not faked here.
 *
 * Failure never bounces silently: it lands on the messages list with the
 * existing honest `?notice=cannot_open` restricted state.
 */
export async function openAgencyConnectionConversationAction(
  formData: FormData,
): Promise<void> {
  const connectionId = String(formData.get("connectionId") ?? "");
  const locale = String(formData.get("locale") ?? "lt");
  const cannotOpen = `/${locale}/dashboard/communication?notice=cannot_open`;

  if (!isBridgeUuid(connectionId)) redirect(cannotOpen);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(cannotOpen);

  // The caller's side is the active workspace's company — fail-closed when
  // there is none (a person with no company context is nobody's party).
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") redirect(cannotOpen);

  const { data: row } = await asAny(supabase)
    .from("agency_client_connections")
    .select("id, agency_company_id, client_company_id, status, invited_by, accepted_by")
    .eq("id", connectionId)
    .maybeSingle();

  const connection = row as {
    agency_company_id: string;
    client_company_id: string | null;
    status: string;
    invited_by: string | null;
    accepted_by: string | null;
  } | null;

  const facts = {
    connectionStatus: connection?.status ?? null,
    callerCompanyId: ctx!.companyId,
    agencyCompanyId: connection?.agency_company_id ?? null,
    clientCompanyId: connection?.client_company_id ?? null,
  };
  if (evaluateAgencyConnectionContact(facts) !== "allowed") redirect(cannotOpen);

  const side = agencyConnectionSide(facts);
  const counterpart =
    side === "agency" ? connection!.accepted_by : side === "client" ? connection!.invited_by : null;
  if (!counterpart || counterpart === user!.id) redirect(cannotOpen);

  // Passed only AFTER the gate above held.
  const result = await getOrCreateDirectConversation(
    counterpart,
    locale,
    null,
    "allowed_agency_connection",
  );
  if (!result.ok) redirect(cannotOpen);
  redirect(`/${locale}/dashboard/communication/${result.data.id}`);
}
