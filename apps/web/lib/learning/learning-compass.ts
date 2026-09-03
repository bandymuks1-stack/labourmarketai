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
          status: r.status,
          matchedSkillSlugs: r.matchedSkillSlugs,
          missingSkillSlugs: r.missingSkillSlugs,
        }))
      : [];

  const hasLearnerLink = engagements.some((e) => e.relationshipSlug === "student");
  const availabilityKnown =
    ctx.worker.availability_status !== null && ctx.worker.availability_status !== "unknown";

  const compass = buildLearningCompass({
    professionSlug: ctx.subject.professionSlug ?? null,
    skills: ctx.subject.skills.map((s) => ({ slug: s.uri, evidence: s.evidence })),
    journalEntryCount: journalCount,
    education,
    opportunities,
    availabilityKnown,
  });

  return {
    status: "ok",
    student: isStudentPath({ education, hasLearnerLink }),
    compass,
  };
}
