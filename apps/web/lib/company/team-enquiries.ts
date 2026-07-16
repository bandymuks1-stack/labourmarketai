import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Employer-side team-enquiry read layer (Trust Connect Teams v1, gap 3).
 *
 * The gated read model list_my_team_enquiries_v1 (20260716131000) is the ONLY
 * place an employer sees team details — a bounded availability snapshot for
 * teams the employer has a real enquiry with, never the raw team_details
 * table and never the manager note. No emails, no phones anywhere.
 *
 * Honest degradation: while the owner-gated migration is not applied the RPC
 * probe sees 42883 and this reports needs-migration — the UI shows the honest
 * "prepared, not enabled" state, never a fake empty list.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const RPC_NOT_FOUND_CODE = "42883";

export type MyTeamEnquiryAvailability = {
  readonly availabilityStatus: string;
  readonly availableFrom: string | null;
  readonly accommodationNeeded: boolean;
  readonly transportOwn: boolean;
  readonly maxTripDays: number | null;
};

export type MyTeamEnquiry = {
  readonly id: string;
  readonly teamOrgId: string;
  readonly teamName: string | null;
  readonly status: string;
  readonly message: string;
  readonly startDate: string | null;
  readonly expectedEndDate: string | null;
  readonly createdAt: string;
  /** Bounded snapshot from the enquiry read model; null when the team has
   *  not filled its details (never fabricated). */
  readonly teamAvailability: MyTeamEnquiryAvailability | null;
};

export type MyTeamEnquiriesRead =
  | { readonly status: "ok"; readonly items: readonly MyTeamEnquiry[] }
  | { readonly status: "needs-migration" }
  | { readonly status: "error" };

/** The caller's own enquiries to teams, newest first (RPC-scoped to owner). */
export async function listMyTeamEnquiries(): Promise<MyTeamEnquiriesRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error" };

  const { data, error } = await asAny(supabase).rpc("list_my_team_enquiries_v1");
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { status: "needs-migration" };
    return { status: "error" };
  }
  type Item = {
    id: string;
    team_org_id: string;
    team_name: string | null;
    status: string;
    message: string;
    start_date: string | null;
    expected_end_date: string | null;
    created_at: string;
    team_availability: {
      availability_status: string;
      available_from: string | null;
      accommodation_needed: boolean;
      transport_own: boolean;
      max_trip_days: number | null;
    } | null;
  };
  const items = (((data as { items?: unknown[] } | null)?.items ?? []) as Item[]).map(
    (i) => ({
      id: i.id,
      teamOrgId: i.team_org_id,
      teamName: i.team_name,
      status: i.status,
      message: i.message,
      startDate: i.start_date,
      expectedEndDate: i.expected_end_date,
      createdAt: i.created_at,
      teamAvailability: i.team_availability
        ? {
            availabilityStatus: i.team_availability.availability_status,
            availableFrom: i.team_availability.available_from,
            accommodationNeeded: i.team_availability.accommodation_needed,
            transportOwn: i.team_availability.transport_own,
            maxTripDays: i.team_availability.max_trip_days,
          }
        : null,
    }),
  );
  return { status: "ok", items };
}
