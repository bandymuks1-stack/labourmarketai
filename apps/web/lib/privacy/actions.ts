"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  PRIVACY_REQUEST_NOTE_MAX,
  isPrivacyRequestType,
  type PrivacyRequestType,
} from "@/lib/privacy/privacy-request-model";

/**
 * Privacy self-service v1 — server actions (quality-train PR G).
 *
 * submitPrivacyRequest calls the DRAFT SECURITY DEFINER RPC
 * submit_privacy_request_v1. HONEST DEGRADATION: until the owner applies
 * the migration the RPC is absent — the action returns
 * kind:"needs-migration" and the UI shows a calm "not available yet"
 * state, never a fake success. Nothing here deletes ANYTHING — an
 * account-deletion request is a request row a human reviews.
 */

// PostgREST: function/table absent → 42883/42P01/PGRST202/PGRST204.
const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type PrivacyRequestActionResult =
  | { kind: "ok"; requestId: string }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "too-many-open" }
  | { kind: "invalid" }
  | { kind: "error" };

export async function submitPrivacyRequest(input: {
  type: PrivacyRequestType;
  note?: string | null;
}): Promise<PrivacyRequestActionResult> {
  if (!isPrivacyRequestType(input.type)) return { kind: "invalid" };
  const note = (input.note ?? "").trim().slice(0, PRIVACY_REQUEST_NOTE_MAX);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc(
    "submit_privacy_request_v1",
    { p_request_type: input.type, p_note: note || null },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    if (/too_many_open/.test(error.message ?? "")) return { kind: "too-many-open" };
    if (/invalid_privacy_request_type|note_too_long/.test(error.message ?? "")) {
      return { kind: "invalid" };
    }
    return { kind: "error" };
  }
  return { kind: "ok", requestId: String(data) };
}

export interface MyPrivacyRequestRow {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

/** The caller's OWN privacy-request rows (RLS: profile_id = auth.uid()).
 *  Empty list on any missing-data state — never a fabricated queue. */
export async function listMyPrivacyRequests(): Promise<MyPrivacyRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await asAny(supabase)
    .from("customer_requests")
    .select("id, status, created_at, payload")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[])
    .filter((r) => r.payload && typeof r.payload.privacy_request_type === "string")
    .map((r) => ({
      id: r.id as string,
      type: r.payload.privacy_request_type as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
}
