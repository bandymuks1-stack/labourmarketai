import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Customer/Buyer demand request service (Stage 2).
 *
 * Backed by public.customer_requests + public.save_customer_request
 * RPC (migration 0028). Gracefully returns kind: "needs-migration"
 * when the table/RPC are absent (42P01 / 42883).
 *
 * Privacy / safety:
 *   - User-scoped supabase client only. RLS limits SELECT/UPDATE to
 *     `profile_id = auth.uid() OR is_admin()`.
 *   - INSERT routes through the SECURITY DEFINER RPC.
 *   - Admin-only status promotions ('in_review', 'needs_followup',
 *     'approved', 'closed') are silently downgraded to 'submitted'
 *     inside the RPC when invoked by a non-admin owner.
 */

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type CustomerRequestStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "needs_followup"
  | "approved"
  | "closed";

export interface CustomerRequestRow {
  readonly id: string;
  readonly profileId: string;
  readonly customerId: string | null;
  readonly title: string;
  readonly needSummary: string | null;
  readonly country: string | null;
  readonly location: string | null;
  readonly roleOrWorkType: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly duration: string | null;
  readonly languageRequirement: string | null;
  readonly notes: string | null;
  /** Per-type fields with no dedicated column (the dashboard demand form stores
   *  role / location / skills / urgency / notes here via submit_demand_request). */
  readonly payload: Record<string, unknown> | null;
  readonly status: CustomerRequestStatus;
  readonly manualReviewNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CustomerRequestsListResult =
  | { kind: "ok"; rows: readonly CustomerRequestRow[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export interface SaveCustomerRequestInput {
  readonly requestId?: string | null;
  readonly title: string;
  readonly needSummary?: string;
  readonly country?: string;
  readonly location?: string;
  readonly roleOrWorkType?: string;
  readonly teamSize?: number;
  readonly startPeriod?: string;
  readonly duration?: string;
  readonly languageRequirement?: string;
  readonly notes?: string;
  readonly status?: CustomerRequestStatus;
}

export type SaveCustomerRequestResult =
  | { kind: "ok"; requestId: string }
  | { kind: "needs-migration" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

function mapRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  r: any,
): CustomerRequestRow {
  return {
    id: r.id as string,
    profileId: r.profile_id as string,
    customerId: (r.customer_id as string | null) ?? null,
    title: r.title as string,
    needSummary: (r.need_summary as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    roleOrWorkType: (r.role_or_work_type as string | null) ?? null,
    teamSize: (r.team_size as number | null) ?? null,
    startPeriod: (r.start_period as string | null) ?? null,
    duration: (r.duration as string | null) ?? null,
    languageRequirement: (r.language_requirement as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    payload:
      r.payload && typeof r.payload === "object"
        ? (r.payload as Record<string, unknown>)
        : null,
    status: r.status as CustomerRequestStatus,
    manualReviewNote: (r.manual_review_note as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listOwnCustomerRequests(): Promise<CustomerRequestsListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", rows: [] };
  const { data, error } = await asAny(supabase)
    .from("customer_requests")
    .select(
      "id, profile_id, customer_id, title, need_summary, country, location, role_or_work_type, team_size, start_period, duration, language_requirement, notes, payload, status, manual_review_note, created_at, updated_at",
    )
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => mapRow(r));
  return { kind: "ok", rows };
}

export async function saveCustomerRequest(
  input: SaveCustomerRequestInput,
): Promise<SaveCustomerRequestResult> {
  const title = input.title.trim();
  if (title.length === 0 || title.length > 200) {
    return {
      kind: "invalid",
      message: "Title must be 1-200 characters.",
    };
  }
  // Bounded free text: these land in bare `text` columns (0028) with no
  // DB-side cap. Mirrors the title cap above.
  const FIELD_CAPS: Array<[string, string | null | undefined, number]> = [
    ["need_summary", input.needSummary, 4000],
    ["country", input.country, 100],
    ["location", input.location, 200],
    ["role_or_work_type", input.roleOrWorkType, 200],
    ["start_period", input.startPeriod, 100],
    ["duration", input.duration, 200],
    ["language_requirement", input.languageRequirement, 200],
    ["notes", input.notes, 4000],
  ];
  for (const [field, value, cap] of FIELD_CAPS) {
    if (value && value.trim().length > cap) {
      return {
        kind: "invalid",
        message: `${field} must be at most ${cap} characters.`,
      };
    }
  }
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("save_customer_request", {
    p_request_id: input.requestId ?? null,
    p_title: title,
    p_need_summary: input.needSummary?.trim() || null,
    p_country: input.country?.trim() || null,
    p_location: input.location?.trim() || null,
    p_role_or_work_type: input.roleOrWorkType?.trim() || null,
    p_team_size: input.teamSize ?? null,
    p_start_period: input.startPeriod?.trim() || null,
    p_duration: input.duration?.trim() || null,
    p_language_requirement: input.languageRequirement?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_status: input.status ?? "draft",
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", requestId: data as string };
}
