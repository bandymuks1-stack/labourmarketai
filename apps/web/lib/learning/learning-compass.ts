import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { buildOwnWorkerContext } from "@/lib/opportunities/worker-subject";
import { getWorkerJobRecommendations } from "@/lib/opportunities/recommendations";
import { getOwnWorkerEducation } from "@/lib/worker/worker-education";
import { listMyEngagements } from "@/lib/invitations/network";
import {
  buildLearningCompass,
  isStudentPath,
  type CompassCohort,
  type CompassEducation,
  type CompassOpportunity,
  type LearningCompass,
} from "./learning-compass-model";

/**
 * Learning Compass — server reader (Track C, 2026-09-03).
 *
 * Composes the person's OWN, already RLS-scoped reads: worker context (skills
 * with evidence tier, profession, availability), education rows, the same
 * job recommendations the opportunity board shows, the learner link, and a
 * COUNT of own journal entries. No new table, no new RPC, nothing generated.
 *
 * `student` is decided by `isStudentPath` (a current education row or an
 * active learner link). The caller renders the compass only on that path.
 */

export type LearningCompassRead =
  | { readonly status: "ok"; readonly student: boolean; readonly compass: LearningCompass }
  | { readonly status: "no-worker" }
  | { readonly status: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Same ceiling the institution side uses; the function clamps to 100. */
const DEMAND_LIMIT = 100;

type CohortMembershipRow = {
  cohort_id: string;
  status: string;
  education_cohorts: {
    id: string;
    name: string;
    starts_on: string | null;
    ends_on: string | null;
    organization_id: string;
    archived_at: string | null;
    education_programs: {
      id: string;
      name: string;
      target_profession_slug: string | null;
      education_type_slug: string | null;
      archived_at: string | null;
    } | null;
  } | null;
};

/**
 * The person's OWN active cohort memberships (education programmes / cohorts,
 * migration 20260903120000). RLS: a learner reads only their own membership
 * rows and, through them, exactly the cohort + programme they belong to. The
 * institution's name comes from the person's own student engagement context
 * (`organizationNameById`), so nothing of the institution's is read here.
 *
 * Demand per direction is the same authenticated count the institution sees
 * (`count_public_vacancies_by_profession_v1`, imported public vacancy pool):
 * when the returned list is shorter than the limit it is exhaustive, so an
 * absent direction is a real 0; when it is full, an absent direction is
 * `null` (not measured) — never a made-up zero.
 */
async function readOwnCohorts(
  supabase: SupabaseClient,
  profileId: string,
  organizationNameById: ReadonlyMap<string, string | null>,
): Promise<CompassCohort[]> {
  const res = await asAny(supabase)
    .from("education_cohort_members")
    .select(
      "cohort_id, status, education_cohorts(id, name, starts_on, ends_on, organization_id, archived_at, education_programs(id, name, target_profession_slug, education_type_slug, archived_at))",
    )
    .eq("profile_id", profileId)
    .eq("status", "active")
    .limit(20);
  if (res.error) return [];
  const rows = (res.data ?? []) as CohortMembershipRow[];
  const live = rows.filter(
    (r) => r.education_cohorts && !r.education_cohorts.archived_at && r.education_cohorts.education_programs && !r.education_cohorts.education_programs.archived_at,
  );
  if (live.length === 0) return [];

  const wantsDemand = live.some((r) => r.education_cohorts?.education_programs?.target_profession_slug);
  let demandBySlug: Map<string, number> | null = null;
  let exhaustive = false;
  if (wantsDemand) {
    const demandRes = await asAny(supabase).rpc("count_public_vacancies_by_profession_v1", { p_limit: DEMAND_LIMIT });
    if (!demandRes.error) {
      const list = (demandRes.data ?? []) as Array<{ profession_slug: string; active_vacancies: number | string }>;
      demandBySlug = new Map(list.map((r) => [String(r.profession_slug), Number(r.active_vacancies ?? 0)]));
      exhaustive = list.length < DEMAND_LIMIT;
    }
  }

  return live.map((r) => {
    const c = r.education_cohorts!;
    const p = c.education_programs!;
    const slug = p.target_profession_slug ?? null;
    let demandCount: number | null = null;
    if (slug && demandBySlug) {
      const found = demandBySlug.get(slug);
      demandCount = found !== undefined ? found : exhaustive ? 0 : null;
    }
    return {
      cohortId: c.id,
      cohortName: c.name,
      programName: p.name,
      institutionName: organizationNameById.get(c.organization_id) ?? null,
      targetProfessionSlug: slug,
      educationTypeSlug: p.education_type_slug ?? null,
      startsOn: c.starts_on ?? null,
      endsOn: c.ends_on ?? null,
      demandCount,
    };
  });
}

export async function readLearningCompass(): Promise<LearningCompassRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unavailable" };

  const ctx = await buildOwnWorkerContext(supabase, user.id);
  if (!ctx) return { status: "no-worker" };

  const [educationRead, recs, engagements, journalCount] = await Promise.all([
    getOwnWorkerEducation(),
    getWorkerJobRecommendations({ limit: 5 }).catch(() => ({ kind: "no-worker" as const })),
    listMyEngagements().catch(() => []),
    asAny(supabase)
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", ctx.workerId)
      .is("deleted_at", null)
      .then((r: { count: number | null; error: unknown }) => (r.error ? 0 : (r.count ?? 0)))
      .catch(() => 0),
  ]);

  const education: CompassEducation[] =
    educationRead.kind === "ok"
      ? educationRead.entries.map((e) => ({
          institutionName: e.institutionName,
          programOrField: e.programOrField,
          educationTypeSlug: e.educationTypeSlug,
          isCurrent: e.isCurrent,
        }))
      : [];

  const opportunities: CompassOpportunity[] =
    recs.kind === "ready"
      ? recs.recommendations.map((r) => ({
          requestId: r.requestId,
          roleSlug: r.roleSlug,
          companyName: r.companyName,
          country: r.country,
          opportunityType: r.opportunityType,
          status: r.status,
          matchedSkillSlugs: r.matchedSkillSlugs,
          missingSkillSlugs: r.missingSkillSlugs,
        }))
      : [];

  const hasLearnerLink = engagements.some((e) => e.relationshipSlug === "student");
  const availabilityKnown =
    ctx.worker.availability_status !== null && ctx.worker.availability_status !== "unknown";

  // Cohort membership presupposes an accepted student link to the SAME
  // institution (enforced by `set_education_cohort_member_v1`), so the
  // institution's name is already in the person's own engagement contexts.
  const organizationNameById = new Map<string, string | null>();
  for (const e of engagements) {
    if (e.relationshipSlug === "student" && e.organizationId) {
      organizationNameById.set(e.organizationId, e.organizationName);
    }
  }
  const cohorts = hasLearnerLink ? await readOwnCohorts(supabase, user.id, organizationNameById) : [];

  const compass = buildLearningCompass({
    professionSlug: ctx.subject.professionSlug ?? null,
    skills: ctx.subject.skills.map((s) => ({ slug: s.uri, evidence: s.evidence })),
    journalEntryCount: journalCount,
    education,
    opportunities,
    availabilityKnown,
    cohorts,
  });

  return {
    status: "ok",
    student: isStudentPath({ education, hasLearnerLink }),
    compass,
  };
}
