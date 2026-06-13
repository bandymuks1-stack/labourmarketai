import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseStructuredNeed } from "@/lib/market/fit";
import {
  matchWorkerToNeed,
  matchStrengthOrder,
  type MatchNeed,
} from "@/lib/market/match-v1";
import { buildSupplyCandidates } from "@/lib/market/match-subject";
import {
  toScoutSafeCandidate,
  type ScoutSafeCandidate,
  type ShortlistStatus as SafeShortlistStatus,
} from "@/lib/scouting/scout-safe-view";

/**
 * Company scouting (Full Cycle Sprint v1, Slice 3) — the demand→matching→
 * shortlist stage. A company runs the deterministic match-v1 engine over the
 * employer-discoverable worker supply for ONE of ITS OWN structured demands,
 * sees ranked candidates with the "why"/gaps, and shortlists them.
 *
 * RLS: everything is read/written through the caller's session.
 *   - own demands: customer_requests SELECT (profile_id = auth.uid()).
 *   - supply: workers / worker_skills are employer-visible by existing RLS.
 *   - shortlist: demand_shortlist is owner-scoped (owner_id = auth.uid()).
 * No RLS change, no SECURITY DEFINER. Honest empty/needs-structuring states.
 */

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type ShortlistStatus = SafeShortlistStatus;
export const SHORTLIST_STATUSES: readonly ShortlistStatus[] = [
  "saved",
  "interested",
  "not_fit",
  "reviewed",
];

/** Re-export the safe company-facing candidate shape (the ONLY one the UI gets). */
export type { ScoutSafeCandidate } from "@/lib/scouting/scout-safe-view";

export interface CompanyDemand {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly structured: boolean;
  readonly createdAt: string;
}

function buildNeed(row: {
  country: string | null;
  language_requirement: string | null;
  payload: unknown;
}): MatchNeed {
  const structured = parseStructuredNeed(row.payload);
  const languages = (row.language_requirement ?? "")
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    escoSkillUris: structured?.escoSkillUris ?? [],
    country: row.country,
    languages: languages.length > 0 ? languages : undefined,
  };
}

/** The company's own demands (most recent first). */
export async function listCompanyDemands(): Promise<CompanyDemand[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const { data } = await asAny(supabase)
      .from("customer_requests")
      .select("id, title, status, payload, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data ?? []) as {
      id: string;
      title: string | null;
      status: string | null;
      payload: unknown;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      title: r.title ?? "—",
      status: r.status ?? "draft",
      structured: parseStructuredNeed(r.payload) !== null,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export type ScoutResult =
  | { kind: "ok"; demand: CompanyDemand; candidates: ScoutSafeCandidate[] }
  | { kind: "not-found" }
  | { kind: "not-structured"; demand: CompanyDemand }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/** Run scouting for ONE of the company's own demands. */
export async function runScouting(requestId: string): Promise<ScoutResult> {
  if (!requestId) return { kind: "not-found" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-found" };

  // Own demand only (RLS also enforces profile_id = auth.uid()).
  const { data: req, error } = await asAny(supabase)
    .from("customer_requests")
    .select("id, title, status, country, language_requirement, payload, created_at")
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) {
    if (error.code === RELATION_NOT_FOUND || error.code === UNDEFINED_COLUMN) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }
  if (!req) return { kind: "not-found" };

  const demand: CompanyDemand = {
    id: req.id,
    title: req.title ?? "—",
    status: req.status ?? "draft",
    structured: parseStructuredNeed(req.payload) !== null,
    createdAt: req.created_at,
  };
  if (!demand.structured) return { kind: "not-structured", demand };

  const need = buildNeed(req);
  const supply = await buildSupplyCandidates(supabase);

  // Existing shortlist statuses for this demand (owner-scoped).
  const shortlist = new Map<string, ShortlistStatus>();
  try {
    const { data: sl } = await asAny(supabase)
      .from("demand_shortlist")
      .select("worker_id, status")
      .eq("owner_id", user.id)
      .eq("request_id", requestId);
    for (const r of (sl ?? []) as { worker_id: string; status: ShortlistStatus }[]) {
      shortlist.set(r.worker_id, r.status);
    }
  } catch {
    // table absent (pre-apply) → no shortlist statuses yet
  }

  const candidates: ScoutSafeCandidate[] = supply
    .map((c) =>
      toScoutSafeCandidate({
        workerId: c.workerId,
        professionSlug: c.professionSlug,
        subject: c.subject,
        match: matchWorkerToNeed(need, c.subject),
        needCountry: need.country,
        shortlistStatus: shortlist.get(c.workerId) ?? null,
      }),
    )
    // Rank by match strength, then by skill-fit coverage, then confirmed share
    // — all need-context (§19), never a global person score.
    .sort((a, b) => {
      const s = matchStrengthOrder(b.match.status) - matchStrengthOrder(a.match.status);
      if (s !== 0) return s;
      const pa = a.match.skillFit?.pct ?? 0;
      const pb = b.match.skillFit?.pct ?? 0;
      if (pb !== pa) return pb - pa;
      return (
        (b.match.skillFit?.matchedConfirmed ?? 0) -
        (a.match.skillFit?.matchedConfirmed ?? 0)
      );
    });

  return { kind: "ok", demand, candidates };
}

export type ShortlistWriteResult =
  | { kind: "ok"; status: ShortlistStatus }
  | { kind: "invalid" }
  | { kind: "not-owner" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/**
 * Upsert a shortlist decision for the company's own demand. Owner-scoped:
 * the request must belong to the caller (verified) and the row is written with
 * owner_id = auth.uid(), so a company can never touch another's shortlist.
 */
export async function setShortlist(input: {
  requestId: string;
  workerId: string;
  status: ShortlistStatus;
}): Promise<ShortlistWriteResult> {
  if (
    !input.requestId ||
    !input.workerId ||
    !(SHORTLIST_STATUSES as readonly string[]).includes(input.status)
  ) {
    return { kind: "invalid" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-owner" };

  // Verify the demand is the caller's own (RLS would also filter, but we want
  // a clean not-owner signal, not a silent FK error).
  const { data: req } = await asAny(supabase)
    .from("customer_requests")
    .select("id")
    .eq("id", input.requestId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!req) return { kind: "not-owner" };

  const { error } = await asAny(supabase)
    .from("demand_shortlist")
    .upsert(
      {
        owner_id: user.id,
        request_id: input.requestId,
        worker_id: input.workerId,
        status: input.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,request_id,worker_id" },
    );
  if (error) {
    if (error.code === RELATION_NOT_FOUND) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", status: input.status };
}
