"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Employer-side team-enquiry server actions (Trust Connect Teams v1, gap 3).
 *
 * Writes go ONLY through the gated state-machine RPCs of 20260716121000:
 * propose (rate-limited, contact-detail-refusing, self-enquiry-blocking) and
 * withdraw (proposer-only, open-only). Accept/decline belongs to the team
 * side (team-brigade-actions.ts) — the proposer can never accept their own
 * enquiry, enforced server-side.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";

export type ProposeTeamEnquiryOutcome =
  | "created"
  | "existing_open" // idempotent create: the existing open enquiry was returned
  | "message_required"
  | "message_too_long"
  | "contact_details_in_message"
  | "invalid_dates"
  | "team_not_found"
  | "not_a_team"
  | "own_team"
  | "not_authorized"
  | "limit_reached"
  | "rate_limited"
  | "needs_migration"
  | "error";

export async function proposeTeamEnquiryAction(input: {
  teamOrgId: string;
  message: string;
  startDate: string | null;
  endDate: string | null;
  locale: string;
}): Promise<{ outcome: ProposeTeamEnquiryOutcome }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error" };

  const { data, error } = await asAny(supabase).rpc("propose_team_enquiry_v1", {
    p_team_org_id: input.teamOrgId,
    p_message: input.message,
    p_start_date: input.startDate,
    p_expected_end_date: input.endDate,
    p_company_organization_id: null,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE || error.code === RELATION_NOT_FOUND_CODE) {
      return { outcome: "needs_migration" };
    }
    return { outcome: "error" };
  }
  const outcome = String(
    (data as { outcome?: string } | null)?.outcome ?? "error",
  );
  const known: readonly ProposeTeamEnquiryOutcome[] = [
    "created",
    "existing_open",
    "message_required",
    "message_too_long",
    "contact_details_in_message",
    "invalid_dates",
    "team_not_found",
    "not_a_team",
    "own_team",
    "not_authorized",
    "limit_reached",
    "rate_limited",
  ];
  if ((known as readonly string[]).includes(outcome)) {
    if (outcome === "created") {
      revalidatePath(`/${input.locale}/dashboard/network`);
    }
    return { outcome: outcome as ProposeTeamEnquiryOutcome };
  }
  return { outcome: "error" };
}

export type WithdrawTeamEnquiryOutcome =
  | "withdrawn"
  | "not_allowed"
  | "not_open"
  | "not_found"
  | "needs_migration"
  | "error";

export async function withdrawTeamEnquiryAction(input: {
  enquiryId: string;
  locale: string;
}): Promise<{ outcome: WithdrawTeamEnquiryOutcome }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error" };

  const { data, error } = await asAny(supabase).rpc("withdraw_team_enquiry_v1", {
    p_enquiry_id: input.enquiryId,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE || error.code === RELATION_NOT_FOUND_CODE) {
      return { outcome: "needs_migration" };
    }
    return { outcome: "error" };
  }
  const code = String(data ?? "");
  if (
    code === "withdrawn" ||
    code === "not_allowed" ||
    code === "not_open" ||
    code === "not_found"
  ) {
    revalidatePath(`/${input.locale}/dashboard/network`);
    return { outcome: code };
  }
  return { outcome: "error" };
}
