import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemandKind } from "@/lib/demand/market-direction";
import { runScoutingCore, type ScoutingEmployer } from "@/lib/scouting/scouting";
import {
  AUTO_MATCH_MATCHER_VERSION,
  AUTO_MATCH_PAYLOAD_KEY,
  AUTO_MATCH_TOP_N,
  anonymisedResultRef,
  autoMatchInputHash,
  isReceiptCurrent,
  readAutoMatchReceipt,
  type AutoMatchReceipt,
  type AutoMatchStatus,
} from "@/lib/scouting/auto-match-receipt";

/**
 * AUTOMATIC INTERNAL MATCHING ON DEMAND.
 *
 * When a need becomes active (submitted / reopened / its requirement set
 * confirmed) this runs the EXISTING deterministic scouting core (match-v1 over
 * the employer-discoverable workers already in LabourMarket.ai) once, and
 * records a receipt. No AI call, no external source, no message sent to
 * anybody. The result is "relevant candidates in LabourMarket.ai", nothing
 * wider.
 *
 *  - IDEMPOTENT: keyed on sha256(matching fields + matcher version); an
 *    unchanged need is not re-run.
 *  - BOUNDED: the retrieval pool is capped inside scouting (supply-retrieval);
 *    one run per event, no loops, no cron.
 *  - NEVER THROWS, never blocks the publish: every failure becomes a receipt
 *    with status "failed" (or a returned skip), and the caller ignores it.
 *  - PRIVACY: runs through the caller's own RLS-scoped client and the same
 *    gates as the scouting page; the receipt keeps counts and anonymous
 *    per-demand references only: no worker id, no contact data.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient): any => c;

export type AutoMatchOutcome =
  | { kind: "ran"; receipt: AutoMatchReceipt; stored: boolean }
  | {
      kind: "skipped";
      reason: "unchanged" | "not-active" | "not-a-demand" | "not-found" | "no-employer-context";
    }
  | { kind: "failed"; reason: string };

export type AutoMatchTrigger = AutoMatchReceipt["trigger"];

const ROW_COLUMNS =
  "id, title, status, kind, need_summary, role_or_work_type, notes, country, location, language_requirement, payload, profile_id, organization_id";

export async function runAutoMatchForDemand(
  caller: { readonly supabase: SupabaseClient; readonly userId: string },
  employer: Partial<ScoutingEmployer> | null | undefined,
  requestId: string | null | undefined,
  trigger: AutoMatchTrigger,
): Promise<AutoMatchOutcome> {
  try {
    if (!requestId) return { kind: "skipped", reason: "not-found" };
    if (!employer?.organizationId || !employer.companyId || !employer.role) {
      return { kind: "skipped", reason: "no-employer-context" };
    }
    const scoutingEmployer: ScoutingEmployer = {
      companyId: employer.companyId,
      organizationId: employer.organizationId,
      organizationName: employer.organizationName ?? "",
      role: employer.role,
    };

    // Own row or the ACTIVE organization's row only (tenant pin, on top of RLS).
    const { data: row } = await asAny(caller.supabase)
      .from("customer_requests")
      .select(ROW_COLUMNS)
      .eq("id", requestId)
      .maybeSingle();
    if (
      !row ||
      !(row.profile_id === caller.userId || row.organization_id === scoutingEmployer.organizationId)
    ) {
      return { kind: "skipped", reason: "not-found" };
    }
    // Only an ACTIVE need is searched for (never a draft or a closed need), and
    // only a demand for people (an agency offer is not a search).
    if (row.status !== "submitted") return { kind: "skipped", reason: "not-active" };
    if (!isDemandKind(row.kind)) return { kind: "skipped", reason: "not-a-demand" };

    const inputHash = autoMatchInputHash(row);
    if (isReceiptCurrent(readAutoMatchReceipt(row.payload), inputHash)) {
      return { kind: "skipped", reason: "unchanged" };
    }

    const startedAt = new Date().toISOString();
    let status: AutoMatchStatus = "failed";
    let poolSize: number | null = null;
    let poolCapped: boolean | null = null;
    let matchCount: number | null = null;
    let relevantCount: number | null = null;
    let topRefs: string[] = [];
    let errorCode: string | null = null;

    try {
      const result = await runScoutingCore(caller, scoutingEmployer, requestId);
      if (result.kind === "ok") {
        poolSize = result.retrieval.poolSize;
        poolCapped = result.retrieval.capped || result.retrieval.truncatedStages.length > 0;
        matchCount = result.candidates.length;
        const relevant = result.candidates.filter(
          (c) => c.match.status === "strong" || c.match.status === "possible",
        );
        relevantCount = relevant.length;
        // Candidates arrive already ranked by the shared comparator.
        topRefs = relevant
          .slice(0, AUTO_MATCH_TOP_N)
          .map((c) => anonymisedResultRef(requestId, c.workerId));
        status = relevant.length > 0 ? "completed" : "no_candidates";
        // A pool read with unreadable facts is not a trustworthy "none found".
        if (result.retrieval.unreadableFacts.length > 0 && relevant.length === 0) {
          status = "failed";
          errorCode = "facts_unreadable";
          matchCount = null;
          relevantCount = null;
        }
      } else if (result.kind === "not-structured") {
        status = "not_structured";
      } else {
        status = "failed";
        errorCode = result.kind === "error" ? "scouting_error" : result.kind;
      }
    } catch (e) {
      status = "failed";
      errorCode = e instanceof Error ? e.name.slice(0, 40) : "unknown";
      poolSize = poolCapped = matchCount = relevantCount = null;
      topRefs = [];
    }

    const receipt: AutoMatchReceipt = {
      version: 1,
      demandId: requestId,
      organizationId: scoutingEmployer.organizationId,
      inputHash,
      matcherVersion: AUTO_MATCH_MATCHER_VERSION,
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      status,
      poolSize,
      poolCapped,
      matchCount,
      relevantCount,
      topRefs,
      errorCode,
    };
    const stored = await storeReceipt(caller, requestId, receipt);
    return { kind: "ran", receipt, stored };
  } catch (e) {
    return { kind: "failed", reason: e instanceof Error ? e.name : "unknown" };
  }
}

/** Fresh read-merge-write of ONE payload key. Returns false when the row could
 *  not be written (RLS: only the creator updates the row). The run still
 *  happened; the surface just has no stored proof, and says so. */
async function storeReceipt(
  caller: { readonly supabase: SupabaseClient; readonly userId: string },
  requestId: string,
  receipt: AutoMatchReceipt,
): Promise<boolean> {
  try {
    const { data: fresh } = await asAny(caller.supabase)
      .from("customer_requests")
      .select("payload")
      .eq("id", requestId)
      .maybeSingle();
    const base =
      fresh?.payload && typeof fresh.payload === "object" && !Array.isArray(fresh.payload)
        ? (fresh.payload as Record<string, unknown>)
        : {};
    const { data, error } = await asAny(caller.supabase)
      .from("customer_requests")
      .update({ payload: { ...base, [AUTO_MATCH_PAYLOAD_KEY]: receipt } })
      .eq("id", requestId)
      .eq("profile_id", caller.userId)
      .select("id");
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** Read the last stored receipt for the scouting page (RLS-scoped). */
export async function readLastAutoMatchReceipt(
  supabase: SupabaseClient,
  requestId: string,
): Promise<AutoMatchReceipt | null> {
  try {
    const { data } = await asAny(supabase)
      .from("customer_requests")
      .select("payload")
      .eq("id", requestId)
      .maybeSingle();
    return readAutoMatchReceipt(data?.payload);
  } catch {
    return null;
  }
}
