import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  parseNeedPublicReasons,
  parseNeedPublicState,
  type NeedPublicReason,
  type NeedPublicState,
} from "@/lib/opportunities/public-company-needs-model";

/**
 * OPERATOR QUEUE — needs of companies that are not verified, held by the one
 * database rule (owner decision V-1, 2026-11-12). Reuses the existing admin
 * company-verification surface; reads and writes ONLY through the admin-only
 * SECURITY DEFINER doors, which re-check `is_admin()`:
 *   list_need_public_review_queue_v1()             the held / rejected needs
 *   decide_need_public_review_v1(id, decision, why) approve | reject, bound to
 *                                                  the need's current content
 */
export type NeedPublicReviewRow = {
  readonly requestId: string;
  readonly roleText: string | null;
  readonly title: string | null;
  readonly country: string | null;
  readonly locationLabel: string | null;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly createdAt: string | null;
  readonly state: NeedPublicState;
  readonly reasons: readonly NeedPublicReason[];
};

export type NeedPublicReviewQueue =
  | { readonly kind: "ok"; readonly rows: readonly NeedPublicReviewRow[] }
  | { readonly kind: "error" };

export type NeedPublicDecision = "approved" | "rejected";

export type NeedPublicDecisionResult =
  | { readonly kind: "ok"; readonly state: NeedPublicState | null }
  | { readonly kind: "not-admin" | "invalid" | "not-reviewable" | "not-found" | "error" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export async function listNeedPublicReviewQueue(suppliedClient?: SupabaseClient): Promise<NeedPublicReviewQueue> {
  try {
    const supabase = suppliedClient ?? (await createClient());
    const { data, error } = (await asAny(supabase).rpc("list_need_public_review_queue_v1")) as {
      data: unknown;
      error: { code?: string } | null;
    };
    // No pre-apply fallback (root-cause ratchet): before the migration the
    // queue honestly reads as "could not be read", never as "empty".
    if (error) return { kind: "error" };
    if (!Array.isArray(data)) return { kind: "error" };
    const rows: NeedPublicReviewRow[] = [];
    for (const r of data as Record<string, unknown>[]) {
      const state = parseNeedPublicState(r?.state);
      if (typeof r?.request_id !== "string" || state === null) continue;
      rows.push({
        requestId: r.request_id,
        roleText: str(r.role_text),
        title: str(r.title),
        country: str(r.country),
        locationLabel: str(r.location_label),
        companyId: str(r.company_id),
        companyName: str(r.company_name),
        createdAt: str(r.created_at),
        state,
        reasons: parseNeedPublicReasons(r.reasons),
      });
    }
    return { kind: "ok", rows };
  } catch {
    return { kind: "error" };
  }
}

export async function decideNeedPublicReview(
  requestId: string,
  decision: NeedPublicDecision,
  reason: string | null,
  suppliedClient?: SupabaseClient,
): Promise<NeedPublicDecisionResult> {
  try {
    const supabase = suppliedClient ?? (await createClient());
    const { data, error } = (await asAny(supabase).rpc("decide_need_public_review_v1", {
      p_request_id: requestId,
      p_decision: decision,
      p_reason: reason && reason.trim() !== "" ? reason.trim().slice(0, 500) : null,
    })) as { data: unknown; error: { code?: string; message?: string } | null };
    if (error) {
      if (error.code === "42501") return { kind: "not-admin" };
      if (error.code === "P0002") return { kind: "not-found" };
      if (error.message?.includes("not_reviewable")) return { kind: "not-reviewable" };
      if (error.code === "22023") return { kind: "invalid" };
      return { kind: "error" };
    }
    return { kind: "ok", state: parseNeedPublicState(data) };
  } catch {
    return { kind: "error" };
  }
}
