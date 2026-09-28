import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The agency's DELEGATED part of the commercial chain (owner decisions
 * 2026-09-28 A / D; migration 20260928190000). Three reads, each through the
 * relationship that authorises it — never a general read of the client:
 *
 *   agency  — the needs IT drafted for connected clients and whether the
 *             client confirmed them (`list_agency_drafted_needs_v1`);
 *   agency  — the lifecycle of the placements that came from ITS accepted
 *             candidate offers (`list_agency_placements_v1`: statuses and
 *             dates only — no project, journal, hours or other workers);
 *   client  — the drafts an agency prepared for it, awaiting its decision
 *             (its own rows under the unchanged customer_requests policy).
 *
 * Every failure is a named kind, never an empty list pretending "nothing".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(v: unknown): any {
  return v;
}

export interface DraftedNeedRow {
  readonly requestId: string;
  readonly connectionId: string;
  readonly title: string;
  readonly roleText: string | null;
  readonly status: string;
  /** The client confirmed it: the need is theirs and shared on this connection. */
  readonly shared: boolean;
  readonly createdAt: string;
}

export interface PlacementRow {
  readonly offerId: string;
  readonly requestId: string;
  readonly workerId: string;
  readonly offeredAt: string;
  readonly clientDecidedAt: string | null;
  readonly bookingStatus: string | null;
  readonly startDate: string | null;
  readonly expectedEndDate: string | null;
  readonly workerDecidedAt: string | null;
  readonly engagementStatus: string | null;
  readonly engagementEndedAt: string | null;
  readonly assignmentStatus: string | null;
  readonly assignedAt: string | null;
  readonly assignmentEndedAt: string | null;
}

export type ReadState<T> = { kind: "ok"; rows: readonly T[] } | { kind: "error" };

export async function listAgencyDraftedNeeds(): Promise<ReadState<DraftedNeedRow>> {
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc("list_agency_drafted_needs_v1");
    if (error) return { kind: "error" };
    return {
      kind: "ok",
      rows: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        requestId: String(r.request_id),
        connectionId: String(r.connection_id),
        title: String(r.title ?? ""),
        roleText: (r.role_or_work_type as string | null) ?? null,
        status: String(r.status ?? ""),
        shared: r.shared === true,
        createdAt: String(r.created_at ?? ""),
      })),
    };
  } catch {
    return { kind: "error" };
  }
}

export async function listAgencyPlacements(): Promise<ReadState<PlacementRow>> {
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc("list_agency_placements_v1");
    if (error) return { kind: "error" };
    const s = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      kind: "ok",
      rows: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        offerId: String(r.offer_id),
        requestId: String(r.request_id),
        workerId: String(r.worker_id),
        offeredAt: String(r.offered_at ?? ""),
        clientDecidedAt: s(r.client_decided_at),
        bookingStatus: s(r.booking_status),
        startDate: s(r.start_date),
        expectedEndDate: s(r.expected_end_date),
        workerDecidedAt: s(r.worker_decided_at),
        engagementStatus: s(r.engagement_status),
        engagementEndedAt: s(r.engagement_ended_at),
        assignmentStatus: s(r.assignment_status),
        assignedAt: s(r.assigned_at),
        assignmentEndedAt: s(r.assignment_ended_at),
      })),
    };
  } catch {
    return { kind: "error" };
  }
}

/** CLIENT side: drafts prepared for it on these (its own) connections. */
export async function listClientDraftedNeeds(
  connectionIds: readonly string[],
): Promise<ReadState<DraftedNeedRow>> {
  if (connectionIds.length === 0) return { kind: "ok", rows: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase)
      .from("customer_requests")
      .select("id, drafted_via_connection_id, title, role_or_work_type, status, created_at")
      .in("drafted_via_connection_id", [...connectionIds])
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { kind: "error" };
    return {
      kind: "ok",
      rows: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        requestId: String(r.id),
        connectionId: String(r.drafted_via_connection_id),
        title: String(r.title ?? ""),
        roleText: (r.role_or_work_type as string | null) ?? null,
        status: String(r.status ?? ""),
        shared: false,
        createdAt: String(r.created_at ?? ""),
      })),
    };
  } catch {
    return { kind: "error" };
  }
}
