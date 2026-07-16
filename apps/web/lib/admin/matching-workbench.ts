import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  parseAgencyOffers,
  parseStructuredNeed,
  type AgencyOfferMark,
  type StructuredNeed,
} from "@/lib/market/fit";
import { buildNeedFromRequestRow } from "@/lib/market/need-from-request";
import { buildSupplyCandidates } from "@/lib/market/match-subject";
import type { MatchNeed, MatchSubject } from "@/lib/market/match-v1";
import type { NeedSkillSource } from "@/lib/market/need-skills";
import {
  emptyTeamMatchInput,
  type TeamMatchInputV1,
} from "@/lib/market/team-match-contract";

/**
 * Phase 3.2 Human-Run Matching Workbench — data layer.
 *
 * Marketplace v1 heart per the canonical product plan §8: a HUMAN sees open
 * demand (`customer_requests`, the ONE canonical intake — doctrine §17) next
 * to the worker supply, decides, and records the decision + a feedback note.
 * No automatic matching, no scoring, no ranking — the worker list is ordered
 * by recency only and every recorded match is a human decision.
 *
 * READ side: user-scoped client; customer_requests SELECT RLS (0028) and
 * workers/worker_skills/journal RLS (0001/0013) give a real admin session
 * every row; a non-admin sees only their own. The page is additionally gated
 * by requireSuperadmin.
 *
 * WRITE side: recordHumanMatch uses the EXISTING admin UPDATE RLS on
 * customer_requests (0028: `profile_id = auth.uid() or is_admin()`), so NO
 * migration and NO new table is needed: the decision is appended to
 * `payload.match_log` (append-only array inside the existing jsonb column),
 * the feedback note lands in `manual_review_note`, and the request moves
 * through the EXISTING status ladder. Degrades to needs-migration when the
 * consolidation columns (42703) or table (42P01) are absent.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Statuses the workbench may set — a human review outcome, never 'draft'
 *  (owner-only) and never a silent close. */
export type WorkbenchStatus = "in_review" | "needs_followup" | "approved";

export const WORKBENCH_STATUSES: readonly WorkbenchStatus[] = [
  "in_review",
  "needs_followup",
  "approved",
];

/** Open demand statuses shown on the board. */
const OPEN_STATUSES = ["submitted", "in_review", "needs_followup"] as const;

export interface MatchLogEntry {
  readonly worker_id: string;
  readonly worker_name: string | null;
  readonly note: string | null;
  readonly status_set: WorkbenchStatus;
  readonly decided_by: string;
  /** Server-side ISO timestamp (Next server action, not client-supplied). */
  readonly decided_at: string;
  /** Honest provenance marker — every entry is a human decision. */
  readonly decided_via: "human";
}

export interface DemandRow {
  readonly id: string;
  /** Requester's profiles.id — the messaging identity for the
   *  "message requester" entry point (Workstream B). */
  readonly profileId: string | null;
  readonly title: string;
  readonly kind: string | null;
  readonly needSummary: string | null;
  readonly country: string | null;
  readonly location: string | null;
  readonly roleOrWorkType: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly duration: string | null;
  readonly languageRequirement: string | null;
  readonly notes: string | null;
  readonly status: string;
  readonly manualReviewNote: string | null;
  /** Free-form per-kind fields the author actually typed (payload minus our
   *  match_log) — rendered as-is, never invented. */
  readonly payloadFields: ReadonlyArray<{ key: string; value: string }>;
  readonly matchLog: readonly MatchLogEntry[];
  readonly createdAt: string;
  /** §19 structured need (payload.structured_need) — null until a HUMAN
   *  structures the request; nothing is ever invented for old rows. */
  readonly structuredNeed: StructuredNeed | null;
  /** S5 "galim pasiūlyti" agency proposal marks (payload.agency_offers). */
  readonly agencyOffers: readonly AgencyOfferMark[];
  /** Wagon 4: the canonical MatchNeed derived by the SAME path scouting uses
   *  (buildNeedFromRequestRow). Null when nothing is derivable — the page
   *  then keeps its honest unstructured state, nothing invented. */
  readonly matchNeed: MatchNeed | null;
  /** How the requirement set was derived (human/bridged/recognized/expanded). */
  readonly needSource: NeedSkillSource | null;
}

export interface SupplyWorkerRow {
  readonly id: string;
  /** profiles.id — the messaging identity for "start conversation". */
  readonly profileId: string | null;
  readonly displayName: string | null;
  readonly headline: string | null;
  readonly availabilityStatus: string | null;
  readonly availableFrom: string | null;
  readonly locationCountry: string | null;
  readonly preferredCountries: readonly string[];
  readonly experienceYears: number | null;
  readonly professionSlugs: readonly string[];
  /** Self-declared skills — honest label, never "verified". */
  readonly skillsDeclared: number;
  /** worker_skills rows with verified=true (manager-confirmed path). */
  readonly skillsConfirmed: number;
  /** Journal evidence — real counts, 0 is a plain 0. */
  readonly journalEntries: number;
  readonly managerConfirmations: number;
  /** The subject's C set for §19 fit: ESCO URIs from curated worker_skills
   *  (verified flag = manager-confirmed) + approved candidate_skills
   *  mappings (always declared, never verified). */
  readonly escoSkills: ReadonlyArray<{ uri: string; verified: boolean }>;
  /** Wagon 4: the canonical match-v1 subject assembled by the SAME read
   *  layer scouting uses (buildSupplyCandidates). Null when the worker was
   *  not in the assembled supply window — honest, never fabricated. */
  readonly subject: MatchSubject | null;
}

export type WorkbenchListResult =
  | {
      kind: "ok";
      demand: readonly DemandRow[];
      supply: readonly SupplyWorkerRow[];
      /** Viewer-locale labels (EN fallback) for every structured-need ESCO
       *  skill URI — so the fit basis names skills, not raw URIs. */
      escoLabelsByUri: Readonly<Record<string, string>>;
    }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type RecordMatchResult =
  | { kind: "ok" }
  | { kind: "not-admin" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

function isMatchLogEntry(v: unknown): v is MatchLogEntry {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as MatchLogEntry).worker_id === "string" &&
    typeof (v as MatchLogEntry).decided_at === "string"
  );
}

function parseMatchLog(payload: unknown): MatchLogEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const log = (payload as { match_log?: unknown }).match_log;
  if (!Array.isArray(log)) return [];
  return log.filter(isMatchLogEntry);
}

function payloadFields(
  payload: unknown,
): Array<{ key: string; value: string }> {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>)
    .filter(([k, v]) => k !== "match_log" && v !== null && v !== "")
    .filter(([, v]) => typeof v !== "object")
    .map(([key, value]) => ({ key, value: String(value) }));
}

export async function listWorkbench(
  locale: string = "en",
): Promise<WorkbenchListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", demand: [], supply: [], escoLabelsByUri: {} };

  const { data: requests, error } = await asAny(supabase)
    .from("customer_requests")
    .select(
      "id, profile_id, title, kind, need_summary, country, location, role_or_work_type, team_size, start_period, duration, language_requirement, notes, status, manual_review_note, payload, created_at",
    )
    .in("status", [...OPEN_STATUSES])
    .order("created_at", { ascending: false });
  if (error) {
    if (
      error.code === RELATION_NOT_FOUND_CODE ||
      error.code === UNDEFINED_COLUMN_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }

  // Curated esco_uri → slug bridge — the SAME derivation input scouting
  // uses, so the workbench engine results cannot drift from scouting's.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const demand: DemandRow[] = ((requests ?? []) as any[]).map((r) => {
    const derived = buildNeedFromRequestRow(
      {
        title: (r.title as string | null) ?? null,
        need_summary: (r.need_summary as string | null) ?? null,
        role_or_work_type: (r.role_or_work_type as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        country: (r.country as string | null) ?? null,
        location: (r.location as string | null) ?? null,
        language_requirement: (r.language_requirement as string | null) ?? null,
        payload: r.payload,
      },
      escoUriToSlug,
    );
    return {
    id: r.id as string,
    profileId: (r.profile_id as string | null) ?? null,
    title: (r.title as string) ?? "—",
    kind: (r.kind as string | null) ?? null,
    needSummary: (r.need_summary as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    roleOrWorkType: (r.role_or_work_type as string | null) ?? null,
    teamSize: (r.team_size as number | null) ?? null,
    startPeriod: (r.start_period as string | null) ?? null,
    duration: (r.duration as string | null) ?? null,
    languageRequirement: (r.language_requirement as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: (r.status as string) ?? "submitted",
    manualReviewNote: (r.manual_review_note as string | null) ?? null,
    payloadFields: payloadFields(r.payload),
    matchLog: parseMatchLog(r.payload),
    createdAt: r.created_at as string,
    structuredNeed: parseStructuredNeed(r.payload),
    agencyOffers: parseAgencyOffers(r.payload),
    matchNeed: derived.source !== null ? derived.need : null,
    needSource: derived.source,
    };
  });

  // ── Supply: workers + honest signal counts (recency order, NO ranking) ──
  const { data: workers, error: wErr } = await asAny(supabase)
    .from("workers")
    .select(
      "id, profile_id, display_name, headline, availability_status, available_from, current_location_country, preferred_countries, experience_years, created_at",
    )
    .order("created_at", { ascending: false });
  if (wErr) return { kind: "error", message: wErr.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerRows = (workers ?? []) as any[];
  const workerIds = workerRows.map((w) => w.id as string);

  const professionsByWorker = new Map<string, string[]>();
  const declaredByWorker = new Map<string, number>();
  const confirmedByWorker = new Map<string, number>();
  const entriesByWorker = new Map<string, number>();
  const confirmationsByWorker = new Map<string, number>();
  /** worker_id → (esco_uri → verified). */
  const escoByWorker = new Map<string, Map<string, boolean>>();

  if (workerIds.length > 0) {
    const [profs, skills, entries] = await Promise.all([
      asAny(supabase)
        .from("worker_professions")
        .select("worker_id, professions ( slug )")
        .in("worker_id", workerIds),
      asAny(supabase)
        .from("worker_skills")
        .select("worker_id, verified, skills ( esco_uri )")
        .in("worker_id", workerIds),
      asAny(supabase)
        .from("journal_entries")
        .select("id, worker_id")
        .in("worker_id", workerIds),
    ]);

    for (const p of (profs.data ?? []) as {
      worker_id: string;
      professions: { slug: string } | null;
    }[]) {
      const slug = p.professions?.slug;
      if (!slug) continue;
      const list = professionsByWorker.get(p.worker_id) ?? [];
      list.push(slug);
      professionsByWorker.set(p.worker_id, list);
    }
    for (const s of (skills.data ?? []) as {
      worker_id: string;
      verified: boolean;
      skills: { esco_uri: string | null } | null;
    }[]) {
      declaredByWorker.set(
        s.worker_id,
        (declaredByWorker.get(s.worker_id) ?? 0) + 1,
      );
      if (s.verified) {
        confirmedByWorker.set(
          s.worker_id,
          (confirmedByWorker.get(s.worker_id) ?? 0) + 1,
        );
      }
      // C set (§19): only ESCO-curated skills can join a fit computation.
      const uri = s.skills?.esco_uri;
      if (uri) {
        const list = escoByWorker.get(s.worker_id) ?? new Map<string, boolean>();
        // verified wins if the same URI appears twice.
        list.set(uri, (list.get(uri) ?? false) || s.verified);
        escoByWorker.set(s.worker_id, list);
      }
    }

    const entryRows = (entries.data ?? []) as { id: string; worker_id: string }[];
    const workerByEntry = new Map<string, string>();
    for (const e of entryRows) {
      entriesByWorker.set(
        e.worker_id,
        (entriesByWorker.get(e.worker_id) ?? 0) + 1,
      );
      workerByEntry.set(e.id, e.worker_id);
    }
    if (entryRows.length > 0) {
      const { data: confs } = await asAny(supabase)
        .from("journal_entry_confirmations")
        .select("entry_id")
        .in(
          "entry_id",
          entryRows.map((e) => e.id),
        );
      for (const c of (confs ?? []) as { entry_id: string }[]) {
        const wid = workerByEntry.get(c.entry_id);
        if (!wid) continue;
        confirmationsByWorker.set(
          wid,
          (confirmationsByWorker.get(wid) ?? 0) + 1,
        );
      }
    }
  }

  // Approved candidate-skill mappings join the C set as DECLARED (never
  // verified) — the mapping is an admin-curated fact, the skill stays
  // self-declared until a manager confirms real work (§7 / §19 c).
  const profileToWorker = new Map<string, string>();
  for (const w of workerRows) {
    if (w.profile_id) profileToWorker.set(w.profile_id as string, w.id as string);
  }
  if (profileToWorker.size > 0) {
    try {
      const { data: candRows } = await asAny(supabase)
        .from("candidate_skills")
        .select("profile_id, mapped_esco_uri")
        .eq("status", "approved")
        .not("mapped_esco_uri", "is", null)
        .in("profile_id", [...profileToWorker.keys()]);
      for (const c of (candRows ?? []) as {
        profile_id: string;
        mapped_esco_uri: string | null;
      }[]) {
        const wid = profileToWorker.get(c.profile_id);
        if (!wid || !c.mapped_esco_uri) continue;
        const list = escoByWorker.get(wid) ?? new Map<string, boolean>();
        if (!list.has(c.mapped_esco_uri)) list.set(c.mapped_esco_uri, false);
        escoByWorker.set(wid, list);
      }
    } catch {
      // table absent → C stays curated-skills-only (honest subset)
    }
  }

  // Wagon 4: canonical match-v1 subjects from the ONE supply read layer
  // (lib/market/match-subject.ts — the same assembler scouting uses), so the
  // workbench engine results carry identical explanation codes. A worker
  // outside the assembled window keeps subject=null (honest, no engine row).
  const subjectByWorker = new Map<string, MatchSubject>();
  try {
    for (const c of await buildSupplyCandidates(supabase)) {
      subjectByWorker.set(c.workerId, c.subject);
    }
  } catch {
    // supply assembler unavailable → engine section degrades honestly
  }

  const supply: SupplyWorkerRow[] = workerRows.map((w) => ({
    id: w.id as string,
    profileId: (w.profile_id as string | null) ?? null,
    displayName: (w.display_name as string | null) ?? null,
    headline: (w.headline as string | null) ?? null,
    availabilityStatus: (w.availability_status as string | null) ?? null,
    availableFrom: (w.available_from as string | null) ?? null,
    locationCountry: (w.current_location_country as string | null) ?? null,
    preferredCountries: (w.preferred_countries as string[] | null) ?? [],
    experienceYears: (w.experience_years as number | null) ?? null,
    professionSlugs: professionsByWorker.get(w.id as string) ?? [],
    skillsDeclared: declaredByWorker.get(w.id as string) ?? 0,
    skillsConfirmed: confirmedByWorker.get(w.id as string) ?? 0,
    journalEntries: entriesByWorker.get(w.id as string) ?? 0,
    managerConfirmations: confirmationsByWorker.get(w.id as string) ?? 0,
    escoSkills: [...(escoByWorker.get(w.id as string) ?? new Map()).entries()]
      .map(([uri, verified]) => ({ uri, verified: Boolean(verified) }))
      .sort((a, b) => a.uri.localeCompare(b.uri)),
    subject: subjectByWorker.get(w.id as string) ?? null,
  }));

  // Viewer-locale labels for every structured-need URI (EN fallback) so the
  // fit basis names skills, never raw URIs (§2 slug→JSON spirit).
  const needUris = [
    ...new Set(demand.flatMap((d) => d.structuredNeed?.escoSkillUris ?? [])),
  ];
  const escoLabelsByUri: Record<string, string> = {};
  if (needUris.length > 0) {
    try {
      const { data: skillRows } = await asAny(supabase)
        .from("esco_skills")
        .select("id, esco_uri")
        .in("esco_uri", needUris);
      const idToUri = new Map(
        ((skillRows ?? []) as { id: string; esco_uri: string }[]).map((r) => [
          r.id,
          r.esco_uri,
        ]),
      );
      if (idToUri.size > 0) {
        const { data: labelRows } = await asAny(supabase)
          .from("esco_labels")
          .select("concept_id, label, locale")
          .eq("concept_type", "skill")
          .eq("label_type", "preferred")
          .in("locale", locale === "en" ? ["en"] : [locale, "en"])
          .in("concept_id", [...idToUri.keys()]);
        for (const r of (labelRows ?? []) as {
          concept_id: string;
          label: string;
          locale: string;
        }[]) {
          const uri = idToUri.get(r.concept_id);
          if (!uri) continue;
          // viewer locale wins over the en fallback
          if (!escoLabelsByUri[uri] || r.locale === locale) {
            escoLabelsByUri[uri] = r.label;
          }
        }
      }
    } catch {
      // labels stay URIs — degraded but honest
    }
  }

  return { kind: "ok", demand, supply, escoLabelsByUri };
}

/**
 * Record a HUMAN match decision on a request. Append-only into
 * payload.match_log + feedback note + status move — existing columns, existing
 * admin RLS, no migration. The RLS UPDATE policy (0028) is the authority
 * check: a non-admin updating someone else's request matches 0 rows.
 */
export async function recordHumanMatch(input: {
  requestId: string;
  workerId: string;
  note: string | null;
  status: WorkbenchStatus;
}): Promise<RecordMatchResult> {
  if (!(WORKBENCH_STATUSES as readonly string[]).includes(input.status)) {
    return { kind: "invalid" };
  }
  if (!input.requestId || !input.workerId) return { kind: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-admin" };

  // Resolve the worker honestly (name for the log; must exist).
  const { data: worker, error: wErr } = await asAny(supabase)
    .from("workers")
    .select("id, display_name")
    .eq("id", input.workerId)
    .maybeSingle();
  if (wErr) return { kind: "error", message: wErr.message };
  if (!worker) return { kind: "not-found" };

  const { data: existing, error: rErr } = await asAny(supabase)
    .from("customer_requests")
    .select("id, payload")
    .eq("id", input.requestId)
    .maybeSingle();
  if (rErr) {
    if (
      rErr.code === RELATION_NOT_FOUND_CODE ||
      rErr.code === UNDEFINED_COLUMN_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: rErr.message };
  }
  if (!existing) return { kind: "not-found" };

  const payload =
    existing.payload && typeof existing.payload === "object"
      ? { ...(existing.payload as Record<string, unknown>) }
      : {};
  const log = parseMatchLog(payload);
  const entry: MatchLogEntry = {
    worker_id: input.workerId,
    worker_name: (worker.display_name as string | null) ?? null,
    note: input.note?.trim() || null,
    status_set: input.status,
    decided_by: user.id,
    decided_at: new Date().toISOString(),
    decided_via: "human",
  };
  const nextPayload = { ...payload, match_log: [...log, entry] };

  const { data: updated, error: uErr } = await asAny(supabase)
    .from("customer_requests")
    .update({
      status: input.status,
      manual_review_note: input.note?.trim() || null,
      payload: nextPayload,
    })
    .eq("id", input.requestId)
    .select("id");
  if (uErr) return { kind: "error", message: uErr.message };
  // RLS silently filters rows the caller may not update — 0 rows means the
  // caller is not the owner/admin for this request.
  if (!updated || updated.length === 0) return { kind: "not-admin" };
  return { kind: "ok" };
}

// ── Wagon 4: team read for team-target demands ──────────────────────────────
//
// TEMPORARY ADAPTER (integration control addendum 2026-07-16): the CANONICAL
// team read model returning TeamMatchInputV1 belongs to Wagon 2 (separate
// branch). Until that lands and this PR is rebased onto it, this thin adapter
// fills the FROZEN contract shape (lib/market/team-match-contract.ts) with
// what the existing rails legitimately expose — identity + active member
// count — and leaves every other contract field an honest "not stated". The
// matching layer itself NEVER reads these tables; it consumes the contract
// (plus member subjects from the canonical supply read layer, which the
// superadmin workbench may legitimately hold).

export interface TeamForMatching {
  readonly name: string;
  /** The frozen Wagon-2 contract value this adapter could honestly fill. */
  readonly input: TeamMatchInputV1;
  /** Member workers.id list (engagement_contexts 'employee' → workers by
   *  profile_id). Members without a worker row are counted but unmatchable. */
  readonly memberWorkerIds: readonly string[];
}

export type TeamMatchingRead =
  | { kind: "ok"; teams: readonly TeamForMatching[] }
  /** The admin session cannot read team membership server-side (RLS) — the
   *  page shows the honest "team members not readable" state. */
  | { kind: "unreadable" };

/**
 * Read team/brigade orgs + their members for the matching workbench —
 * READ-ONLY, over the EXISTING rails (organizations organization_type='team',
 * engagement_contexts 'employee' — the same paths lib/company/team-brigades.ts
 * uses, without the owner filter; the caller's RLS is the authority). Any
 * error → "unreadable" (never a fabricated roster).
 */
export async function listTeamsForMatching(): Promise<TeamMatchingRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unreadable" };

  const { data: orgRows, error: orgError } = await asAny(supabase)
    .from("organizations")
    .select("id, display_name, legal_name, created_at")
    .eq("organization_type", "team")
    .order("created_at", { ascending: true })
    .limit(50);
  if (orgError) return { kind: "unreadable" };
  const teams = (orgRows ?? []) as {
    id: string;
    display_name: string | null;
    legal_name: string | null;
  }[];
  if (teams.length === 0) return { kind: "ok", teams: [] };

  const { data: ecRows, error: ecError } = await asAny(supabase)
    .from("engagement_contexts")
    .select("organization_id, profile_id")
    .in("organization_id", teams.map((t) => t.id))
    .eq("relationship_slug", "employee")
    .eq("status", "active");
  if (ecError) return { kind: "unreadable" };
  const memberProfilesByTeam = new Map<string, string[]>();
  const allProfileIds = new Set<string>();
  for (const r of (ecRows ?? []) as {
    organization_id: string | null;
    profile_id: string | null;
  }[]) {
    if (!r.organization_id || !r.profile_id) continue;
    const list = memberProfilesByTeam.get(r.organization_id) ?? [];
    list.push(r.profile_id);
    memberProfilesByTeam.set(r.organization_id, list);
    allProfileIds.add(r.profile_id);
  }

  const workerByProfile = new Map<string, string>();
  if (allProfileIds.size > 0) {
    const { data: workerRows, error: wError } = await asAny(supabase)
      .from("workers")
      .select("id, profile_id")
      .in("profile_id", [...allProfileIds]);
    if (wError) return { kind: "unreadable" };
    for (const w of (workerRows ?? []) as {
      id: string;
      profile_id: string | null;
    }[]) {
      if (w.profile_id) workerByProfile.set(w.profile_id, w.id);
    }
  }

  return {
    kind: "ok",
    teams: teams.map((t) => {
      const profiles = memberProfilesByTeam.get(t.id) ?? [];
      return {
        name:
          (t.display_name ?? "").trim() || (t.legal_name ?? "").trim() || "—",
        // Everything this adapter cannot honestly derive stays "not stated"
        // per the contract — Wagon 2's read model fills the rest.
        input: emptyTeamMatchInput(t.id, profiles.length),
        memberWorkerIds: profiles
          .map((p) => workerByProfile.get(p))
          .filter((w): w is string => !!w)
          .sort(),
      };
    }),
  };
}
