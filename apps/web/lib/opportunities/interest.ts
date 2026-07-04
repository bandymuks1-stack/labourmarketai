import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { matchWorkerToNeed } from "@/lib/market/match-v1";
import { isApprovedRouteRow } from "./opportunity-fit";
import { needFromRoleText } from "./opportunity-need";
import { buildOwnWorkerContext } from "./worker-subject";
import {
  buildMatchSnapshot,
  cleanInterestNote,
  type InterestStatus,
} from "./interest-snapshot";

/**
 * Worker express-interest flows (Worker Express Interest slice, 2026-07-04).
 *
 * INTERNAL SIGNAL ONLY: a row in demand_interest_signals. Nothing here sends
 * anything anywhere — no email, no messaging, no webhook, no external call of
 * any kind (guard-pinned). The demand's owning company sees the signal on its
 * own scouting view through RLS; the worker keeps full control of their row.
 *
 * VISIBILITY RULE: a worker can only express interest in a demand they can
 * currently SEE — validated by re-running the exact board pipeline
 * (list_open_demand_for_workers RPC + the default-closed approved-route
 * filter). No parallel visibility logic.
 *
 * Table absent (migration not applied yet) → every flow returns
 * "needs-migration" and the UI simply does not offer the action. Never a
 * dead button, never a fake state.
 */

const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type InterestWriteResult =
  | { kind: "ok"; status: InterestStatus }
  | { kind: "invalid" }
  | { kind: "no-worker" }
  | { kind: "not-visible" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/** Express interest in a worker-visible demand. Idempotent: repeating the
 *  action refreshes the snapshot and keeps status=interested. */
export async function expressInterest(input: {
  requestId: string;
  note?: string | null;
}): Promise<InterestWriteResult> {
  if (!input.requestId) return { kind: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

  const ctx = await buildOwnWorkerContext(supabase, user.id);
  if (!ctx) return { kind: "no-worker" };

  // The demand must be visible through the SAME gate the board uses.
  let visibleRow: Record<string, unknown> | null = null;
  try {
    const { data, error } = await asAny(supabase).rpc("list_open_demand_for_workers");
    if (error || !Array.isArray(data)) return { kind: "not-visible" };
    visibleRow =
      (data as Record<string, unknown>[]).find(
        (r) => String(r.id) === input.requestId && isApprovedRouteRow(r),
      ) ?? null;
  } catch {
    return { kind: "not-visible" };
  }
  if (!visibleRow) return { kind: "not-visible" };

  // Canonical match at click time — the ONE shared pipeline.
  const { need, source } = needFromRoleText(
    (visibleRow.role_text as string | null) ?? null,
    (visibleRow.country as string | null) ?? null,
  );
  const match = matchWorkerToNeed(need, ctx.subject);
  const snapshot = buildMatchSnapshot(match, source);

  const { error } = await asAny(supabase)
    .from("demand_interest_signals")
    .upsert(
      {
        request_id: input.requestId,
        worker_id: ctx.workerId,
        status: "interested",
        note: cleanInterestNote(input.note),
        match_snapshot: snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "worker_id,request_id" },
    );
  if (error) {
    if (error.code === RELATION_NOT_FOUND) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", status: "interested" };
}

/** Withdraw own interest (row stays — honest history, §3-friendly). */
export async function withdrawInterest(input: {
  requestId: string;
}): Promise<InterestWriteResult> {
  if (!input.requestId) return { kind: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };
  const ctx = await buildOwnWorkerContext(supabase, user.id);
  if (!ctx) return { kind: "no-worker" };

  const { error } = await asAny(supabase)
    .from("demand_interest_signals")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("worker_id", ctx.workerId)
    .eq("request_id", input.requestId);
  if (error) {
    if (error.code === RELATION_NOT_FOUND) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", status: "withdrawn" };
}

export interface MyInterestSignals {
  /** request_id → status. Empty when the table is not applied yet. */
  readonly byRequest: ReadonlyMap<string, InterestStatus>;
  /** False until the owner-gated migration is applied. */
  readonly available: boolean;
}

/** The worker's own interest map (for the board's button states). */
export async function listMyInterestSignals(
  supabase: SupabaseClient,
  workerId: string,
): Promise<MyInterestSignals> {
  try {
    const { data, error } = await asAny(supabase)
      .from("demand_interest_signals")
      .select("request_id, status")
      .eq("worker_id", workerId);
    if (error) return { byRequest: new Map(), available: false };
    const byRequest = new Map<string, InterestStatus>();
    for (const r of (data ?? []) as { request_id: string; status: InterestStatus }[]) {
      byRequest.set(r.request_id, r.status);
    }
    return { byRequest, available: true };
  } catch {
    return { byRequest: new Map(), available: false };
  }
}

/** Interest signals on the company's OWN demand (RLS also enforces this;
 *  the explicit ownership check gives a clean signal, mirroring setShortlist). */
export async function listDemandInterestForCompany(
  requestId: string,
): Promise<
  | { kind: "ok"; byWorker: ReadonlyMap<string, InterestStatus> }
  | { kind: "not-owner" }
  | { kind: "needs-migration" }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-owner" };
  const { data: req } = await asAny(supabase)
    .from("customer_requests")
    .select("id")
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!req) return { kind: "not-owner" };

  try {
    const { data, error } = await asAny(supabase)
      .from("demand_interest_signals")
      .select("worker_id, status")
      .eq("request_id", requestId);
    if (error) return { kind: "needs-migration" };
    const byWorker = new Map<string, InterestStatus>();
    for (const r of (data ?? []) as { worker_id: string; status: InterestStatus }[]) {
      if (r.status !== "withdrawn") byWorker.set(r.worker_id, r.status);
    }
    return { kind: "ok", byWorker };
  } catch {
    return { kind: "needs-migration" };
  }
}
