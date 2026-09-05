import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getWorkerSkillRows } from "@/lib/data/worker-core";
import { listMyDocuments, type DocumentsListResult } from "@/lib/documents/readiness";
import { loadWorkerOpportunities } from "@/lib/opportunities/load-worker-opportunities";
import {
  getOwnWorkerId,
  getWorkerProjectView,
  listOwnReadinessItems,
  LEDGER_READINESS_STATUSES,
} from "@/lib/projects/worker-project-access";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";
import { getOwnWorkerLanguages } from "@/lib/worker/worker-languages";
import {
  deriveRequirementLedger,
  REQUIREMENT_LEDGER_CANDIDATE_LIMIT,
  REQUIREMENT_LEDGER_ROUTES,
  type LedgerServiceOffering,
  type LedgerTrainingProgram,
  type RequirementLedger,
  type RequirementLedgerContext,
} from "@/lib/player-card/requirement-ledger";

/**
 * REQUIREMENT LEDGER — server composition (frozen design contract §5 P3).
 *
 * `loadRequirementLedger({ personId, context })` composes EXISTING canonical
 * reads under the caller's own RLS (never the service role) and hands them to
 * the pure deriver. Reused reads, nothing re-derived:
 *   - `listMyDocuments`            the documents page's read (own documents +
 *                                  the country requirement matrix + availability);
 *   - `listOwnReadinessItems`      the person's own checklist rows (pwri_select
 *                                  admits exactly the caller's rows);
 *   - `getWorkerProjectView`       the caller's own assignment + the project facts;
 *   - `getWorkerSkillRows`         the ONE request-cached `worker_skills` read;
 *   - `getOwnWorkerLanguages`      the person's self-stated languages;
 *   - `loadWorkerOpportunities`    the gated board (the engine's matched /
 *                                  missing slugs for one demand);
 *   - `skillsForProfession`        the static profession → skills mirror.
 * Resolution candidates are BOUNDED reads (≤ 20 rows per source, indexed
 * filters): `training_programs` (RLS: the person's own organizations),
 * `training_assignments` (the person's own), `service_offerings` (active,
 * this country or remote). `marketplace_listings` is deliberately NOT read:
 * its category set (accommodation / premises / vehicle / tools / equipment /
 * machinery / safety_equipment) is the TARGET scope the frozen contract keeps
 * out of the pilot (§1.6) — there is no P0 category to read.
 *
 * Person scope: the ledger is readable ONLY for the caller's own worker row.
 * Any other `personId` is answered with `not-own`, never with a partial read.
 *
 * Scale (owner constraint §1b): every read is bounded and keyed on the
 * caller's own ids; the shared person reads are request-cached so several
 * contexts on one page cost one read each; no N+1.
 */

export type RequirementLedgerResult =
  | { readonly kind: "ok"; readonly ledger: RequirementLedger }
  | { readonly kind: "no-worker" }
  | { readonly kind: "not-own" }
  | { readonly kind: "no-context" };

const RELATION_MISSING = new Set(["42P01", "42703", "42883", "PGRST202"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const cachedDocuments = cache(async (): Promise<DocumentsListResult> => {
  try {
    return await listMyDocuments();
  } catch {
    return { kind: "error", message: "documents read failed" };
  }
});

const cachedLanguages = cache(async () => {
  try {
    return await getOwnWorkerLanguages();
  } catch {
    return { kind: "needs-migration" as const };
  }
});

/** Training programmes visible to the person (RLS) + whether each is already
 *  assigned to them. `null` when the human-gated tables are absent. */
const cachedTrainingCandidates = cache(async (profileId: string): Promise<LedgerTrainingProgram[] | null> => {
  const supabase = await createClient();
  const programs = await asAny(supabase)
    .from("training_programs")
    .select("id, title, description")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(REQUIREMENT_LEDGER_CANDIDATE_LIMIT);
  if (programs.error) return RELATION_MISSING.has(programs.error.code) ? null : [];
  const rows = (programs.data ?? []) as { id: string; title: string; description: string | null }[];
  if (rows.length === 0) return [];
  const mine = await asAny(supabase)
    .from("training_assignments")
    .select("program_id")
    .eq("assignee_profile_id", profileId)
    .in(
      "program_id",
      rows.map((r) => r.id),
    )
    .limit(REQUIREMENT_LEDGER_CANDIDATE_LIMIT);
  const assigned = new Set<string>(((mine.data ?? []) as { program_id: string }[]).map((r) => r.program_id));
  return rows.map((r) => ({ id: r.id, title: r.title, description: r.description ?? null, assignedToMe: assigned.has(r.id) }));
});

/** Active service offerings for this country (or remote). `null` when the
 *  table is absent in this environment. */
const cachedServiceCandidates = cache(async (country: string | null): Promise<LedgerServiceOffering[] | null> => {
  const supabase = await createClient();
  let q = asAny(supabase)
    .from("service_offerings")
    .select("id, title, description, category_slug, location_country, remote, rate_text")
    .eq("status", "active");
  q = country ? q.or(`location_country.eq.${country},remote.eq.true`) : q;
  const res = await q.order("created_at", { ascending: false }).limit(REQUIREMENT_LEDGER_CANDIDATE_LIMIT);
  if (res.error) return RELATION_MISSING.has(res.error.code) ? null : [];
  return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    categorySlug: (r.category_slug as string | null) ?? null,
    rateText: (r.rate_text as string | null) ?? null,
    remote: r.remote === true,
    country: (r.location_country as string | null) ?? null,
  }));
});

const cachedOpportunities = cache(async () => {
  try {
    return await loadWorkerOpportunities();
  } catch {
    return { kind: "no-worker" as const };
  }
});

/**
 * The person's OWN project ledgers for a bounded set of projects (the
 * instructions page's consumer): resolves the caller's worker id once and
 * loads one ledger per project through `loadRequirementLedger`; the shared
 * person reads are request-cached, so k projects cost k checklist reads + one
 * of each shared read. A project whose read does not answer is simply absent.
 */
export const OWN_PROJECT_LEDGERS_LIMIT = 5;

export async function loadOwnProjectLedgers(
  projects: readonly { readonly projectId: string; readonly conversationId?: string | null }[],
): Promise<Map<string, RequirementLedger>> {
  const out = new Map<string, RequirementLedger>();
  const distinct = new Map<string, string | null>();
  for (const p of projects) if (!distinct.has(p.projectId)) distinct.set(p.projectId, p.conversationId ?? null);
  const entries = [...distinct.entries()].slice(0, OWN_PROJECT_LEDGERS_LIMIT);
  if (entries.length === 0) return out;
  const personId = await getOwnWorkerId();
  if (!personId) return out;
  const results = await Promise.all(
    entries.map(([projectId, conversationId]) =>
      loadRequirementLedger({ personId, context: { kind: "project", projectId, conversationId } }).catch(() => null),
    ),
  );
  results.forEach((r, i) => {
    if (r && r.kind === "ok") out.set(entries[i][0], r.ledger);
  });
  return out;
}

export async function loadRequirementLedger(args: {
  /** The person's worker id — must be the caller's own. */
  readonly personId: string;
  readonly context: RequirementLedgerContext;
}): Promise<RequirementLedgerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };
  const ownWorkerId = await getOwnWorkerId();
  if (!ownWorkerId) return { kind: "no-worker" };
  if (args.personId !== ownWorkerId) return { kind: "not-own" };

  const { context } = args;
  const now = new Date();

  // ── What is required, by context ────────────────────────────────────────
  let country: string | null = null;
  let contextLabel: string | null = null;
  let checklistItems: { itemKey: string; label: string; status: (typeof LEDGER_READINESS_STATUSES)[number] }[] = [];
  let requiredSkillSlugs: readonly string[] = [];
  let requiredLanguages: { code: string; level: string | null }[] = [];
  let availabilityRequired = false;
  let askHref: string = REQUIREMENT_LEDGER_ROUTES.messages;

  if (context.kind === "project") {
    const view = await getWorkerProjectView(context.projectId);
    if (!view) return { kind: "no-context" };
    country = view.project?.country ?? null;
    contextLabel = view.project?.title ?? null;
    const items = await listOwnReadinessItems(ownWorkerId, [context.projectId], { statuses: LEDGER_READINESS_STATUSES });
    checklistItems = items.map((i) => ({ itemKey: i.itemKey, label: i.label, status: i.status }));
    if (context.conversationId) askHref = `${REQUIREMENT_LEDGER_ROUTES.messages}/${context.conversationId}`;
  } else if (context.kind === "opportunity") {
    const board = await cachedOpportunities();
    if (board.kind !== "ready") return { kind: "no-context" };
    const card = board.opportunities.find((c) => c.need.id === context.requestId);
    if (!card) return { kind: "no-context" };
    country = card.need.country ?? null;
    contextLabel = card.need.roleText ?? null;
    const fit = card.match.skillFit;
    requiredSkillSlugs = fit ? [...fit.matchedUris, ...fit.missingUris] : [];
    requiredLanguages = (card.structured?.requirements?.languages ?? []).map((l) => ({ code: l.lang, level: l.level ?? null }));
    availabilityRequired = true;
  } else {
    country = context.country ? context.country.toUpperCase() : null;
    contextLabel = context.professionSlug;
    requiredSkillSlugs = skillsForProfession(context.professionSlug);
    availabilityRequired = true;
  }

  // ── What the person has — own rows, request-cached ──────────────────────
  const [docs, skillRows, langs, training, services] = await Promise.all([
    cachedDocuments(),
    getWorkerSkillRows(),
    cachedLanguages(),
    cachedTrainingCandidates(user.id).catch(() => null),
    cachedServiceCandidates(country).catch(() => null),
  ]);

  const ledger = deriveRequirementLedger({
    context,
    contextLabel,
    country,
    now,
    checklistItems,
    countryRequirements: docs.kind === "ok" ? docs.requirements : [],
    requiredSkillSlugs,
    requiredLanguages,
    availabilityRequired,
    documents: docs.kind === "ok" ? docs.documents : null,
    ownSkills: skillRows
      .filter((r) => Boolean(r.skills?.slug))
      .map((r) => ({ slug: r.skills?.slug as string, verified: r.verified === true })),
    ownLanguages: langs.kind === "ok" ? langs.languages.map((l) => ({ lang: l.lang, level: l.level })) : null,
    availabilitySet: docs.kind === "ok" ? docs.availabilitySet : null,
    trainingPrograms: training,
    serviceOfferings: services,
    hrefs: {
      journal: REQUIREMENT_LEDGER_ROUTES.journal,
      profile: REQUIREMENT_LEDGER_ROUTES.profile,
      ask: askHref,
    },
  });
  return { kind: "ok", ledger };
}
