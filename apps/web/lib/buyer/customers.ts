import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Customer/Buyer entity service (Stage 2 PR 1).
 *
 * Mirrors the agency / company persistence shape:
 *   - getOwnCustomer() reads public.customers for the current user.
 *   - saveCustomerSetup() wraps the public.save_customer_setup RPC,
 *     which is idempotent (upserts the row and ensures the
 *     'customer' profile_roles entry).
 *
 * Privacy / safety:
 *   - Every call goes through the user-scoped supabase client. RLS
 *     limits SELECT/UPDATE to (profile_id = auth.uid()) OR admin.
 *   - INSERT is performed exclusively by the SECURITY DEFINER RPC;
 *     direct INSERT via `authenticated` is blocked at the policy
 *     level.
 *   - Gracefully returns kind: "needs-migration" when migration 0026
 *     is not yet applied to production (Postgres 42P01 for the
 *     table, 42883 for the RPC).
 */

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type CustomerType =
  | "individual"
  | "small_business"
  | "nonprofit"
  | "other";

export type ContactPreference = "email" | "phone" | "platform_message";

export type ReviewStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "needs_followup";

export interface CustomerRow {
  readonly id: string;
  readonly profileId: string;
  readonly contactName: string | null;
  readonly customerType: CustomerType;
  readonly country: string | null;
  readonly market: string | null;
  readonly needSummary: string | null;
  readonly contactPreference: ContactPreference;
  readonly reviewStatus: ReviewStatus;
  readonly manualReviewNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CustomerReadResult =
  | { kind: "ok"; row: CustomerRow | null }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export interface SaveCustomerInput {
  readonly contactName: string;
  readonly customerType: CustomerType;
  readonly country?: string;
  readonly market?: string;
  readonly needSummary?: string;
  readonly contactPreference: ContactPreference;
  readonly manualReviewNote?: string;
}

export type SaveCustomerResult =
  | { kind: "ok"; customerId: string }
  | { kind: "needs-migration" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

export async function getOwnCustomer(): Promise<CustomerReadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", row: null };
  const { data, error } = await asAny(supabase)
    .from("customers")
    .select(
      "id, profile_id, contact_name, customer_type, country, market, need_summary, contact_preference, review_status, manual_review_note, created_at, updated_at",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  if (!data) return { kind: "ok", row: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  return {
    kind: "ok",
    row: {
      id: r.id as string,
      profileId: r.profile_id as string,
      contactName: (r.contact_name as string | null) ?? null,
      customerType: r.customer_type as CustomerType,
      country: (r.country as string | null) ?? null,
      market: (r.market as string | null) ?? null,
      needSummary: (r.need_summary as string | null) ?? null,
      contactPreference: r.contact_preference as ContactPreference,
      reviewStatus: r.review_status as ReviewStatus,
      manualReviewNote: (r.manual_review_note as string | null) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    },
  };
}

export async function saveCustomerSetup(
  input: SaveCustomerInput,
): Promise<SaveCustomerResult> {
  const contact = input.contactName.trim();
  if (contact.length < 2 || contact.length > 200) {
    return {
      kind: "invalid",
      message: "Contact name must be between 2 and 200 characters.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("save_customer_setup", {
    p_contact_name: contact,
    p_customer_type: input.customerType,
    p_country: input.country?.trim() || null,
    p_market: input.market?.trim() || null,
    p_need_summary: input.needSummary?.trim() || null,
    p_contact_preference: input.contactPreference,
    p_manual_review_note: input.manualReviewNote?.trim() || null,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", customerId: data as string };
}
