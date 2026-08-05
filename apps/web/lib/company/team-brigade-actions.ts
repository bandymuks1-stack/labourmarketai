"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createAndSendInvitations } from "@/lib/invitations/actions";
import {
  createTeamBrigade,
  lookupLinkedWorkerEmail,
  type CreateTeamOutcome,
  type TeamAvailabilityStatus,
} from "./team-brigades";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Server actions for the company-room team/brigade panel (§8.3 + Trust
 * Connect Teams v1).
 *
 * CONSENT RULE (wagon gap 1): owner-initiated team membership goes through a
 * canonical `join_team` INVITATION (20260712200000) — the worker's own accept
 * creates the engagement, so the accept IS the consent. This surface has NO
 * direct membership write anymore; the previous direct-add path was a
 * consent bypass and was removed.
 *
 * Privacy: the invitee's email is looked up server-side from the already
 * RLS-visible company_workers link and handed to the canonical invitation
 * action; neither the email nor the invite link is ever returned to the
 * client from here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";

export async function createTeamAction(
  name: string,
): Promise<{ outcome: CreateTeamOutcome }> {
  const { outcome } = await createTeamBrigade(name);
  // W14 mid-funnel: a team organization was really created (the org spine
  // gained a row). Entity type only — never the team name. Fire-and-forget.
  if (outcome === "created") {
    emitServerFunnelEvent(FUNNEL_EVENTS.organizationCreated, {
      source: "teams",
      metadata: { surface: "company_teams", entity_type: "team" },
    });
  }
  return { outcome };
}

export type TeamInviteOutcome =
  | "sent" // stored + provider acknowledged the email
  | "created" // stored; worker sees it in their in-app invitations
  | "delivery_failed" // stored; email refused — worker still sees it in-app
  | "already_invited"
  | "rate_limited"
  | "limit_reached"
  | "not_authorized"
  | "no_email"
  | "needs_migration"
  | "error";

/**
 * Send the consent invitation: a canonical join_team invitation addressed to
 * a company-linked worker. Membership is created ONLY when the worker
 * accepts it themselves.
 */
export async function inviteWorkerToTeamAction(input: {
  teamId: string;
  workerId: string;
  locale: string;
}): Promise<{ outcome: TeamInviteOutcome }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error" };

  const email = await lookupLinkedWorkerEmail(input.workerId);
  if (!email) return { outcome: "no_email" };

  const result = await createAndSendInvitations({
    emails: email,
    invitationType: "join_team",
    locale: input.locale,
    organizationId: input.teamId,
  });
  if (result.status === "needs-migration") return { outcome: "needs_migration" };
  if (result.status === "not-authed") return { outcome: "error" };

  const first = result.results[0];
  switch (first?.outcome) {
    case "sent":
      return { outcome: "sent" };
    case "created":
      return { outcome: "created" };
    case "delivery_failed":
      return { outcome: "delivery_failed" };
    case "duplicate_pending":
      return { outcome: "already_invited" };
    case "rate_limited":
      return { outcome: "rate_limited" };
    case "limit_reached":
      return { outcome: "limit_reached" };
    case "not_authorized":
      return { outcome: "not_authorized" };
    default:
      return { outcome: "error" };
  }
}

export type SaveTeamDetailsOutcome =
  | "saved"
  | "not_allowed"
  | "not_a_team"
  | "invalid_status"
  | "date_required"
  | "invalid_trip_days"
  | "invalid_size"
  | "invalid_countries"
  | "note_too_long"
  | "needs_migration"
  | "error";

/** Save team-scoped availability / deployable size / destinations /
 *  accommodation / transport via the gated RPC. */
export async function saveTeamDetailsAction(input: {
  teamId: string;
  availabilityStatus: TeamAvailabilityStatus;
  availableFrom: string | null;
  deployableSizeMin: number | null;
  deployableSizeMax: number | null;
  destinationCountries: readonly string[] | null;
  accommodationNeeded: boolean;
  transportOwn: boolean;
  maxTripDays: number | null;
  note: string | null;
}): Promise<{ outcome: SaveTeamDetailsOutcome }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error" };

  const { data, error } = await asAny(supabase).rpc("save_team_details_v1", {
    p_org_id: input.teamId,
    p_availability_status: input.availabilityStatus,
    p_available_from: input.availableFrom,
    p_accommodation_needed: input.accommodationNeeded,
    p_transport_own: input.transportOwn,
    p_max_trip_days: input.maxTripDays,
    p_note: input.note,
    p_deployable_size_min: input.deployableSizeMin,
    p_deployable_size_max: input.deployableSizeMax,
    p_destination_countries: input.destinationCountries,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE || error.code === RELATION_NOT_FOUND_CODE) {
      return { outcome: "needs_migration" };
    }
    return { outcome: "error" };
  }
  const code = String(data ?? "");
  if (
    code === "saved" ||
    code === "not_allowed" ||
    code === "not_a_team" ||
    code === "invalid_status" ||
    code === "date_required" ||
    code === "invalid_trip_days" ||
    code === "invalid_size" ||
    code === "invalid_countries" ||
    code === "note_too_long"
  ) {
    return { outcome: code };
  }
  return { outcome: "error" };
}

export type RespondTeamEnquiryOutcome =
  | "accepted"
  | "declined"
  | "not_allowed"
  | "not_open"
  | "not_found"
  | "needs_migration"
  | "error";

/** Team-leader accept/decline of an enquiry via the gated state-machine RPC. */
export async function respondTeamEnquiryAction(input: {
  enquiryId: string;
  decision: "accepted" | "declined";
}): Promise<{ outcome: RespondTeamEnquiryOutcome }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error" };

  const { data, error } = await asAny(supabase).rpc("respond_team_enquiry_v1", {
    p_enquiry_id: input.enquiryId,
    p_decision: input.decision,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE || error.code === RELATION_NOT_FOUND_CODE) {
      return { outcome: "needs_migration" };
    }
    return { outcome: "error" };
  }
  const code = String(data ?? "");
  if (
    code === "accepted" ||
    code === "declined" ||
    code === "not_allowed" ||
    code === "not_open" ||
    code === "not_found"
  ) {
    return { outcome: code };
  }
  return { outcome: "error" };
}
