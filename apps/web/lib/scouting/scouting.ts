import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  requireEmployerCompany,
  resolveEmployerCompanyContext,
  type EmployerContextReason,
} from "@/lib/company/employer-company-context";
import { parseStructuredNeed } from "@/lib/market/fit";
import type { NeedSkillSource } from "@/lib/market/need-skills";
import { buildNeedFromRequestRow } from "@/lib/market/need-from-request";
import { matchWorkerToNeed, compareMatches } from "@/lib/market/match-v1";
import { buildSupplyCandidates } from "@/lib/market/match-subject";
import {
  toScoutSafeCandidate,
  type ScoutSafeCandidate,
  type ShortlistStatus as SafeShortlistStatus,
} from "@/lib/scouting/scout-safe-view";
import { freshnessDemotionRank } from "@/lib/scouting/profile-freshness";
import {
  allowlistScoutFilters,
  applyScoutFilters,
  buildScoutFacets,
  EMPTY_SCOUT_FILTERS,
  type ScoutFacets,
  type ScoutFilters,
} from "@/lib/scouting/scout-filters";
import { validateShortlistWrite } from "@/lib/scouting/shortlist-note";

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
  /** How the requirement set was derived for matching (PR4): human
   *  structuring, ESCO bridge, offline text recognition, or profession
   *  expansion. Null ⇒ nothing derivable (honest unstructured). */
  readonly needSource: NeedSkillSource | null;
  readonly createdAt: string;
}

// Canonical demand → MatchNeed derivation now lives in
// lib/market/need-from-request.ts (Wagon 4) so scouting AND the admin
// workbench share the ONE need-assembly path.

/**
 * The active company's demands (most recent first).
 *
 * W8 slice 1 — WORKSPACE GATE. The rows are still keyed on `profile_id`
 * (`customer_requests` has no organization/company column — the W9 structural
 * block recorded in the W8 audit), so this cannot yet filter BY company. What
 * it can do, and now does, is refuse to answer at all unless the caller is
 * really acting for a company right now. Without this gate the same demands
 * rendered in every workspace the person could switch to, which is exactly the
 * "active organization is decorative" defect (audit P0-1).
 *
 * Empty array = no demands OR no company context. Surfaces that need to tell
 * those apart call `resolveEmployerCompanyContext()` and render the reason —
 * see `/dashboard/company/scouting`.
 */
export async function listCompanyDemands(): Promise<CompanyDemand[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  if ((await resolveEmployerCompanyContext()).kind !== "ok") return [];
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
      // List view derives from title only (full derivation runs in
      // runScouting with the whole row); null here just means "open it".
      needSource: parseStructuredNeed(r.payload) !== null ? "human_structured" : null,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export type ScoutResult =
  | {
      kind: "ok";
      demand: CompanyDemand;
      candidates: ScoutSafeCandidate[];
      /** worker_id → interest status for THIS demand (worker-initiated,
       *  internal-only signals; empty until the owner-gated interest table
       *  is applied). Withdrawn signals are never shown. */
      interestByWorker: Record<string, string>;
      /** The facet allowlists derived from the visible (RLS-scoped, bounded)
       *  supply — the ONLY values the filter chips offer (Wagon 1). */
      facets: ScoutFacets;
      /** The filters actually applied after allowlisting (an out-of-supply
       *  probe value is dropped, honestly reflected here). */
      filters: ScoutFilters;
    }
  | { kind: "not-found" }
  | { kind: "not-structured"; demand: CompanyDemand }
  | { kind: "needs-migration" }
  /** W8 slice 1: the caller is not acting for a company right now. Its own
   *  kind, never "not-found" — "you are in your personal space" and "that
   *  demand does not exist" are different truths and must read differently. */
  | { kind: "no-company-context"; reason: EmployerContextReason }
  | { kind: "error"; message: string };

/** Run scouting for ONE of the company's own demands. Optional bounded
 *  facet filters (Wagon 1) only ever NARROW the RLS-scoped supply. */
export async function runScouting(
  requestId: string,
  requestedFilters: ScoutFilters = EMPTY_SCOUT_FILTERS,
): Promise<ScoutResult> {
  if (!requestId) return { kind: "not-found" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-found" };

  // W8 slice 1 — WORKSPACE GATE, before any demand row is read. A deep link
  // carrying another workspace's request id can therefore never resolve from a
  // context that is not acting for a company.
  const employer = await requireEmployerCompany();
  if (!employer.ok) return { kind: "no-company-context", reason: employer.reason };

  // Own demand only (RLS also enforces profile_id = auth.uid()).
  const { data: req, error } = await asAny(supabase)
    .from("customer_requests")
    .select(
      "id, title, status, need_summary, role_or_work_type, notes, country, location, language_requirement, payload, created_at",
    )
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

  // Curated esco_uri → slug bridge (sparse until the owner curates links;
  // matching works on slugs regardless — never blocked on ESCO).
  const escoUriToSlug = new Map<string, string>();
  try {
    const { data: bridge } = await asAny(supabase)
      .from("skills")
      .select("slug, esco_uri")
      .not("esco_uri", "is", null);
    for (const b of (bridge ?? []) as { slug: string | null; esco_uri: string | null }[]) {
      if (b.slug && b.esco_uri) escoUriToSlug.set(b.esco_uri, b.slug);
    }
  } catch {
    // bridge unavailable → slugs-only (still fully functional)
  }

  // Structured market-map location for THIS demand (owner-scoped RLS read;
  // city granularity) — beats the free-text location fallback when present.
  let structuredCity: string | null = null;
  try {
    const { data: loc } = await asAny(supabase)
      .from("company_demand_locations")
      .select("city, location_label, active, updated_at")
      .eq("request_id", requestId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const label = ((loc?.city ?? loc?.location_label ?? "") as string).trim();
    structuredCity = label !== "" ? label : null;
  } catch {
    // table absent in this environment → free-text fallback below
  }

  const { need, source } = buildNeedFromRequestRow(
    structuredCity ? { ...req, location: structuredCity } : req,
    escoUriToSlug,
  );
  const demand: CompanyDemand = {
    id: req.id,
    title: req.title ?? "—",
    status: req.status ?? "draft",
    structured: parseStructuredNeed(req.payload) !== null,
    needSource: source,
    createdAt: req.created_at,
  };
  // Nothing derivable at all (no human structure, nothing recognizable in
  // the text, no detectable profession) → honest unstructured state.
  if (source === null) return { kind: "not-structured", demand };

  const supply = await buildSupplyCandidates(supabase);

  // Worker-initiated interest signals on THIS demand (owner-scoped read via
  // RLS; table absent pre-apply → empty, the view is simply unchanged).
  const interestByWorker: Record<string, string> = {};
  try {
    const { data: ints } = await asAny(supabase)
      .from("demand_interest_signals")
      .select("worker_id, status")
      .eq("request_id", requestId);
    for (const r of (ints ?? []) as { worker_id: string; status: string }[]) {
      if (r.status !== "withdrawn") interestByWorker[r.worker_id] = r.status;
    }
  } catch {
    // owner-gated migration not applied yet → no interest signals
  }

  // Existing shortlist statuses + internal notes for this demand
  // (owner-scoped; the note column existed since 20260612220000 and is now
  // actually read — extension B).
  const shortlist = new Map<string, { status: ShortlistStatus; note: string | null }>();
  try {
    const { data: sl } = await asAny(supabase)
      .from("demand_shortlist")
      .select("worker_id, status, note")
      .eq("owner_id", user.id)
      .eq("request_id", requestId);
    for (const r of (sl ?? []) as {
      worker_id: string;
      status: ShortlistStatus;
      note: string | null;
    }[]) {
      shortlist.set(r.worker_id, { status: r.status, note: r.note ?? null });
    }
  } catch {
    // table absent (pre-apply) → no shortlist statuses yet
  }

  // Facet allowlists come from the visible supply itself; the requested
  // filters are clamped to them (a probe value matching nothing is dropped)
  // and can only NARROW the already-bounded, can_view_worker-scoped list.
  const facets = buildScoutFacets(supply);
  const filters = allowlistScoutFilters(requestedFilters, facets);
  const filteredSupply = applyScoutFilters(supply, filters);

  const candidates: ScoutSafeCandidate[] = filteredSupply
    .map((c) =>
      toScoutSafeCandidate({
        workerId: c.workerId,
        professionSlug: c.professionSlug,
        subject: c.subject,
        match: matchWorkerToNeed(need, c.subject),
        needCountry: need.country,
        shortlistStatus: shortlist.get(c.workerId)?.status ?? null,
        shortlistNote: shortlist.get(c.workerId)?.note ?? null,
        lastActiveBucket: c.lastActiveBucket,
      }),
    )
    // Rank via the SHARED need-context comparator (§19 — strength, coverage,
    // confirmed share, explicit availability; never a global person score).
    // Wagon 1: DORMANT profiles are DEMOTED below the rest first — shown
    // honestly with their freshness badge, never silently excluded.
    .sort(
      (a, b) =>
        freshnessDemotionRank(a.lastActiveBucket) -
          freshnessDemotionRank(b.lastActiveBucket) ||
        compareMatches(a.match, b.match),
    );

  return { kind: "ok", demand, candidates, interestByWorker, facets, filters };
}

export type ShortlistWriteResult =
  | { kind: "ok"; status: ShortlistStatus; note: string | null }
  | { kind: "invalid" }
  /** `not_fit` needs a short reason and neither this write nor the stored
   *  row carries one (extension B — server-enforced, never client-trusted). */
  | { kind: "reason-required" }
  | { kind: "not-owner" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/**
 * Upsert a shortlist decision for the company's own demand. Owner-scoped:
 * the request must belong to the caller (verified) and the row is written with
 * owner_id = auth.uid(), so a company can never touch another's shortlist.
 *
 * Extension B: writes/preserves the EXISTING `note` column (20260612220000 —
 * internal to the company; the worker can never read shortlist rows under
 * demand_shortlist RLS). `note === undefined` keeps the stored note;
 * `not_fit` requires a reason (this write's note or the stored one).
 */
export async function setShortlist(input: {
  requestId: string;
  workerId: string;
  status: ShortlistStatus;
  note?: string | null;
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

  // W8 slice 1 — a WRITE from a context that is not acting for a company is
  // refused before it reaches the demand row. Mapped onto the existing
  // `not-owner` kind on purpose: no second error vocabulary, and the surface
  // already renders it honestly.
  if ((await resolveEmployerCompanyContext()).kind !== "ok") return { kind: "not-owner" };

  // Verify the demand is the caller's own (RLS would also filter, but we want
  // a clean not-owner signal, not a silent FK error).
  const { data: req } = await asAny(supabase)
    .from("customer_requests")
    .select("id")
    .eq("id", input.requestId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!req) return { kind: "not-owner" };

  // Current stored note (own row via RLS) — needed both to preserve it on a
  // note-less write and to satisfy the not_fit reason rule honestly.
  let existingNote: string | null = null;
  try {
    const { data: existing } = await asAny(supabase)
      .from("demand_shortlist")
      .select("note")
      .eq("owner_id", user.id)
      .eq("request_id", input.requestId)
      .eq("worker_id", input.workerId)
      .maybeSingle();
    existingNote = (existing?.note as string | null) ?? null;
  } catch {
    // table absent → the upsert below returns needs-migration
  }

  const validated = validateShortlistWrite({
    status: input.status,
    note: input.note,
    existingNote,
  });
  if (validated.kind === "reason-required") return { kind: "reason-required" };

  const payload: Record<string, unknown> = {
    owner_id: user.id,
    request_id: input.requestId,
    worker_id: input.workerId,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  // Only a provided note touches the column — an omitted note never erases
  // the stored one.
  if (validated.note !== undefined) payload.note = validated.note;

  const { error } = await asAny(supabase)
    .from("demand_shortlist")
    .upsert(payload, { onConflict: "owner_id,request_id,worker_id" });
  if (error) {
    if (error.code === RELATION_NOT_FOUND) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return {
    kind: "ok",
    status: input.status,
    note: validated.note !== undefined ? validated.note : existingNote,
  };
}
