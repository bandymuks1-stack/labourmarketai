"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  RESPOND_DECISIONS,
  type DiscoverableOfferingRow,
  type DiscoveryListResult,
  type IncomingListResult,
  type IncomingRequestRow,
  type OutgoingListResult,
  type OutgoingRequestRow,
  type OutgoingRequestSummary,
  type RequestMutateResult,
  type RespondDecision,
} from "@/lib/marketplace/service-requests-shared";

/**
 * P0 Marketplace — service-offering request loop (Phase 1) server actions.
 *
 * Discovery is authenticated + active-only (RLS does the gating). Writes go only
 * through the three SECURITY DEFINER RPCs, which re-check live identity + scope.
 * No payment, no ratings, no fake rows.
 *
 * HONEST DEGRADATION: the migration is owner-applied (RED). Until applied, the
 * table/policy/RPCs are absent — every function returns `needs-migration` and the
 * UI shows a calm "not available yet" state, never an error, never a fake row.
 */

const ABSENT = new Set(["42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);
const UNIQUE_VIOLATION = "23505";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}
function isAbsent(error: { code?: string } | null): boolean {
  return !!error?.code && ABSENT.has(error.code);
}

async function uid(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

function offeringTitle(r: Record<string, unknown>): string | null {
  const o = r.service_offerings as { title?: unknown } | null | undefined;
  return o && typeof o.title === "string" ? o.title : null;
}

/**
 * Minimum-safe requester identity for the provider inbox: maps request id →
 * buyer display name, via the provider-scoped `requester_identities_for_provider`
 * SECURITY DEFINER RPC. Rollout-safe by design — the RPC re-checks provider
 * scope, and if it is absent (not applied yet) or errors, this returns an EMPTY
 * map so the inbox still renders without names (never throws, never a fake name).
 * Only `display_name` ever crosses this boundary.
 */
async function requesterDisplayNames(
  ctx: { supabase: SupabaseClient; userId: string },
  requestIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (requestIds.length === 0) return out;
  const { data, error } = await asAny(ctx.supabase).rpc("requester_identities_for_provider", {
    p_request_ids: requestIds,
  });
  if (error || !Array.isArray(data)) return out;
  for (const row of data as Record<string, unknown>[]) {
    const id = typeof row.request_id === "string" ? row.request_id : null;
    const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (id && name) out.set(id, name);
  }
  return out;
}

/** Active offerings the caller can DISCOVER — excludes the caller's own. */
export async function listDiscoverableOfferings(): Promise<DiscoveryListResult> {
  const ctx = await uid();
  if (!ctx) return { kind: "not-authed" };
  const { data, error } = await asAny(ctx.supabase)
    .from("service_offerings")
    .select(
      "id, title, description, category_slug, location_country, remote, rate_text, provider_id, created_at",
    )
    .eq("status", "active")
    .neq("provider_id", ctx.userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [] };
  }
  const rows: DiscoverableOfferingRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    categorySlug: (r.category_slug as string | null) ?? null,
    locationCountry: (r.location_country as string | null) ?? null,
    remote: r.remote === true,
    rateText: (r.rate_text as string | null) ?? null,
    providerId: String(r.provider_id ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
  return { kind: "ok", rows };
}

/** The caller's own outgoing requests (buyer status view). */
export async function listOutgoingRequests(): Promise<OutgoingListResult> {
  const ctx = await uid();
  if (!ctx) return { kind: "not-authed" };
  const { data, error } = await asAny(ctx.supabase)
    .from("service_offering_requests")
    .select(
      "id, offering_id, status, message, response_note, responded_at, created_at, service_offerings(title)",
    )
    .eq("buyer_id", ctx.userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [] };
  }
  const rows: OutgoingRequestRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    offeringId: String(r.offering_id ?? ""),
    offeringTitle: offeringTitle(r),
    status: (r.status as OutgoingRequestRow["status"]) ?? "sent",
    message: (r.message as string | null) ?? null,
    responseNote: (r.response_note as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  }));
  return { kind: "ok", rows };
}

/** Requests addressed to the caller's offerings (provider inbox). */
export async function listIncomingRequests(): Promise<IncomingListResult> {
  const ctx = await uid();
  if (!ctx) return { kind: "not-authed" };
  const { data, error } = await asAny(ctx.supabase)
    .from("service_offering_requests")
    .select(
      "id, offering_id, status, message, response_note, responded_at, created_at, service_offerings(title)",
    )
    .eq("provider_id", ctx.userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [] };
  }
  const baseRows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    offeringId: String(r.offering_id ?? ""),
    offeringTitle: offeringTitle(r),
    status: (r.status as IncomingRequestRow["status"]) ?? "sent",
    message: (r.message as string | null) ?? null,
    responseNote: (r.response_note as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  }));

  // Minimum-safe requester identity (display name only), via the provider-scoped
  // SECURITY DEFINER RPC. Rollout-safe: if the RPC is absent or errors, we leave
  // every name null and still return the inbox — never a regression, never an
  // error. The RPC re-checks provider scope, so a caller only gets names for
  // their OWN requests.
  const names = await requesterDisplayNames(
    ctx,
    baseRows.map((r) => r.id),
  );
  const rows: IncomingRequestRow[] = baseRows.map((r) => ({
    ...r,
    requesterDisplayName: names.get(r.id) ?? null,
  }));
  return { kind: "ok", rows };
}

/** Buyer requests an active offering (via the SECURITY DEFINER RPC). */
export async function requestServiceOffering(
  offeringId: string,
  message?: string | null,
): Promise<RequestMutateResult> {
  const ctx = await uid();
  if (!ctx) return { kind: "not-authed" };
  if (!offeringId) return { kind: "invalid", field: "offeringId" };
  const cleanMsg = typeof message === "string" ? message.trim().slice(0, 2000) || null : null;

  const { data, error } = await asAny(ctx.supabase).rpc("request_service_offering", {
    p_offering_id: offeringId,
    p_message: cleanMsg,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    if (error.code === UNIQUE_VIOLATION) return { kind: "duplicate" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/service-requests");
  return { kind: "ok", id: typeof data === "string" ? data : undefined };
}

/** Provider accepts/declines an incoming request (via the RPC). */
export async function respondToRequest(
  id: string,
  decision: RespondDecision,
  note?: string | null,
): Promise<RequestMutateResult> {
  const ctx = await uid();
  if (!ctx) return { kind: "not-authed" };
  if (!id) return { kind: "invalid", field: "id" };
  if (!RESPOND_DECISIONS.includes(decision)) return { kind: "invalid", field: "decision" };
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 2000) || null : null;

  const { data, error } = await asAny(ctx.supabase).rpc("respond_service_offering_request", {
    p_id: id,
    p_decision: decision,
    p_note: cleanNote,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/service-requests");
  return { kind: "ok", detail: typeof data === "string" ? data : undefined };
}

/** Buyer withdraws their own pending request (via the RPC). */
export async function withdrawRequest(id: string): Promise<RequestMutateResult> {
  const ctx = await uid();
  if (!ctx) return { kind: "not-authed" };
  if (!id) return { kind: "invalid", field: "id" };

  const { data, error } = await asAny(ctx.supabase).rpc("withdraw_service_offering_request", {
    p_id: id,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/service-requests");
  return { kind: "ok", detail: typeof data === "string" ? data : undefined };
}

/**
 * Count of OPEN incoming requests ('sent') addressed to the caller's offerings —
 * the dashboard's provider next-action signal. Returns 0 on any non-ok state
 * (not-authed / needs-migration / read failure), so the dashboard simply shows
 * no badge rather than an error or a fake count.
 */
export async function getPendingIncomingRequestCount(): Promise<number> {
  const result = await listIncomingRequests();
  if (result.kind !== "ok") return 0;
  return result.rows.filter((r) => r.status === "sent").length;
}

/**
 * Real status counts for the caller's OWN outgoing requests — the buyer's
 * dashboard next-action signal. Returns all-zero on any non-ok state
 * (not-authed / needs-migration / read failure), so the dashboard shows no card
 * rather than an error or a fabricated count. 'withdrawn' is the buyer's own
 * closed intent, so it is intentionally not surfaced as a next action.
 */
export async function getOutgoingRequestSummary(): Promise<OutgoingRequestSummary> {
  const result = await listOutgoingRequests();
  if (result.kind !== "ok") return { sent: 0, accepted: 0, declined: 0 };
  const rows = result.rows;
  return {
    sent: rows.filter((r) => r.status === "sent").length,
    accepted: rows.filter((r) => r.status === "accepted").length,
    declined: rows.filter((r) => r.status === "declined").length,
  };
}
