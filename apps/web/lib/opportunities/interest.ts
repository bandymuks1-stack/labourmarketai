import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { matchWorkerToNeed } from "@/lib/market/match-v1";
import { emitDemandInterestNotification } from "@/lib/notifications/event-emitters";
import { isApprovedRouteRow, safeApprovedCompanyName } from "./opportunity-fit";
import { needFromDemandRow } from "./opportunity-need";
import { buildOwnWorkerContext } from "./worker-subject";
import {
  buildInterestCvStash,
  buildMatchSnapshot,
  buildSnapshotContext,
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
 * v5 (2026-08-19): a successful express ALSO writes a durable in-product
 * notification for the demand owner (`notification_events`). Still nothing
 * leaves the platform — a durable row is the same bell the scouting view
 * already answers to, and its recipient is exactly whom the signal's RLS
 * policy already admits. Four real signals sat unheard before this existed.
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
  /** Optional registered CV template id for the tailored-CV stash (extension
   *  C). Unknown/absent → the default registry template. */
  cvTemplate?: string | null;
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
  //
  // W10 P0-1: derived from the server-re-read ROW, so the snapshot stored
  // against this interest is computed from the same structured demand the
  // board showed. Previously both sides built the need from `role_text` alone,
  // which meant the snapshot recorded a match that had never evaluated the
  // engagement form, licence or pay the worker had just read on the card.
  const { need, source } = needFromDemandRow(visibleRow);
  const match = matchWorkerToNeed(need, ctx.subject);
  const nowIso = new Date().toISOString();
  // Canonical Ideas Integration v1: the snapshot additionally stashes
  //   context — the demand facts the worker SAW (already worker-visible
  //     through the gated board RPC; lets "Mano susidomėjimai" honestly name
  //     a demand after it closes), and
  //   cv — the tailored-CV reference {template, need_id, tailored_at}
  //     (extension C: application package v1 — a reference only; the CV
  //     itself stays the read-time deterministic /cv?need= render).
  // Both live INSIDE the existing worker-writable match_snapshot jsonb — no
  // schema change, no new disclosure.
  const snapshot = {
    ...buildMatchSnapshot(match, source),
    context: buildSnapshotContext({
      roleText: (visibleRow.role_text as string | null) ?? null,
      country: (visibleRow.country as string | null) ?? null,
      locationLabel: (visibleRow.location_label as string | null) ?? null,
      companyName: safeApprovedCompanyName(visibleRow),
    }),
    cv: buildInterestCvStash({
      cvTemplate: input.cvTemplate,
      needId: input.requestId,
      nowIso,
    }),
  };

  // `select("id")` is not decoration: the durable notification is keyed on the
  // SIGNAL row id, which is what makes one worker's interest in one demand a
  // single event. Keying it on the request id instead would notify the owner
  // about the FIRST worker only, and keying it on nothing would re-notify on
  // every idempotent re-express. The row comes back under the worker's own
  // RLS policy (`demand_interest_signals_worker_all`) — no widened read.
  const { data: signalRow, error } = await asAny(supabase)
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
    )
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === RELATION_NOT_FOUND) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }

  // THE SIGNAL NOW REACHES SOMEONE. Fire-and-forget, after the domain write
  // succeeded and never in front of it: a worker's interest must not fail to
  // record because its notification could not be written (the booking/absence
  // precedent). Recipient resolution lives entirely in the emitter, off the
  // signal's own rows.
  const signalId = (signalRow as { id?: string } | null)?.id ?? null;
  if (signalId) void emitDemandInterestNotification(signalId);

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

/** One of the worker's OWN interest rows (RLS: own worker_id only) with the
 *  stored snapshot — the raw material for the "Mano susidomėjimai" list. */
export interface MyInterestRow {
  readonly requestId: string;
  readonly status: InterestStatus;
  /** The stored match_snapshot jsonb (context/cv parsed by pure readers). */
  readonly matchSnapshot: unknown;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface MyInterestSignals {
  /** request_id → status. Empty when the table is not applied yet. */
  readonly byRequest: ReadonlyMap<string, InterestStatus>;
  /** The worker's own rows, newest activity first — INDEPENDENT of current
   *  board visibility (a signal on a closed demand still appears; the view
   *  layer labels it honestly). Empty when the table is not applied yet. */
  readonly rows: readonly MyInterestRow[];
  /** False until the owner-gated migration is applied. */
  readonly available: boolean;
}

/** The worker's own interest signals (board button states + the aggregated
 *  own-signals list). ONE query, own rows only (worker_id filter + RLS). */
export async function listMyInterestSignals(
  supabase: SupabaseClient,
  workerId: string,
): Promise<MyInterestSignals> {
  try {
    const { data, error } = await asAny(supabase)
      .from("demand_interest_signals")
      .select("request_id, status, match_snapshot, created_at, updated_at")
      .eq("worker_id", workerId)
      .order("updated_at", { ascending: false });
    if (error) return { byRequest: new Map(), rows: [], available: false };
    const byRequest = new Map<string, InterestStatus>();
    const rows: MyInterestRow[] = [];
    for (const r of (data ?? []) as {
      request_id: string;
      status: InterestStatus;
      match_snapshot: unknown;
      created_at: string | null;
      updated_at: string | null;
    }[]) {
      byRequest.set(r.request_id, r.status);
      rows.push({
        requestId: r.request_id,
        status: r.status,
        matchSnapshot: r.match_snapshot ?? null,
        createdAt: r.created_at ?? null,
        updatedAt: r.updated_at ?? null,
      });
    }
    return { byRequest, rows, available: true };
  } catch {
    return { byRequest: new Map(), rows: [], available: false };
  }
}

export type AcknowledgeResult =
  | { kind: "ok"; status: InterestStatus }
  | { kind: "invalid" }
  | { kind: "not-owner" }
  | { kind: "no-signal" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/**
 * Company acknowledgement of a worker's interest signal (PR7): sets
 * 'reviewed' or 'contacted' through the gated SECURITY DEFINER RPC
 * `acknowledge_demand_interest` (ownership + status whitelist + withdrawn
 * immutability are enforced INSIDE the function, never trusted to the
 * client). INTERNAL state only — nothing is sent anywhere.
 */
export async function acknowledgeInterest(input: {
  requestId: string;
  workerId: string;
  status: string;
}): Promise<AcknowledgeResult> {
  if (!input.requestId || !input.workerId) return { kind: "invalid" };
  if (input.status !== "reviewed" && input.status !== "contacted") {
    return { kind: "invalid" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-owner" };

  try {
    const { data, error } = await asAny(supabase).rpc("acknowledge_demand_interest", {
      p_request_id: input.requestId,
      p_worker_id: input.workerId,
      p_status: input.status,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "42501") return { kind: "not-owner" };
      if (code === "42883" || code === RELATION_NOT_FOUND) {
        return { kind: "needs-migration" }; // RPC not applied yet
      }
      return { kind: "error", message: error.message };
    }
    if (data !== true) return { kind: "no-signal" };
    return { kind: "ok", status: input.status as InterestStatus };
  } catch {
    return { kind: "needs-migration" };
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

  // Stage A workspace gate: this is an EMPLOYER read of demand-chain signals
  // — it requires a resolved company workspace via the ONE canonical resolver
  // (fail-closed to the module's established `not-owner` shape). The
  // row-ownership check below stays: gate = surface, ownership = row.
  const employer = await requireEmployerCompany();
  if (!employer.ok) return { kind: "not-owner" };

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
