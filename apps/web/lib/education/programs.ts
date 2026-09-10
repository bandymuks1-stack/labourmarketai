import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Education programmes / cohorts — institution-side read (Track C slice 2,
 * migration 20260903120000, RED batch B).
 *
 * Reads only what the institution owns: its programmes, cohorts and
 * membership PAIRS (cohort, profile), plus the names/e-mails it typed itself
 * on the invitations those learners accepted (`invitations.accepted_by_
 * profile_id` → `invited_name`). No learner journal, skills or profile is
 * read (least-privilege ruling 2026-08-27). Demand per programme comes from
 * `count_public_vacancies_by_profession_v1` (authenticated callers only;
 * counts per profession, no vacancy row).
 *
 * Honest degradation (batch 20260903120000 is applied in production):
 * `unavailable` on any other failure — never an empty list pretending.
 */

export interface CohortMemberRow {
  readonly profileId: string;
  readonly status: "active" | "left";
  /** The name the institution typed on the accepted invitation, else the e-mail. */
  readonly label: string;
}

export interface CohortRow {
  readonly id: string;
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly members: readonly CohortMemberRow[];
}

export interface ProgramRow {
  readonly id: string;
  readonly name: string;
  readonly targetProfessionSlug: string | null;
  readonly educationTypeSlug: string | null;
  readonly description: string | null;
  /** Active public vacancies for the target profession (imported market data). */
  readonly demandCount: number | null;
  readonly cohorts: readonly CohortRow[];
}

/** A learner the institution may assign: accepted its student invitation. */
export interface AssignableLearner {
  readonly profileId: string;
  readonly label: string;
}

/**
 * WHO MAY ACTUALLY BE PUT IN A COHORT.
 *
 * `set_education_cohort_member_v1` admits a profile only while an ACTIVE
 * `student` engagement context links it to this organisation — membership
 * never creates a relationship the learner did not accept. The offered list
 * used to come from accepted INVITATIONS alone, and an invitation row is
 * permanent: once a learner's student relationship ended, their name stayed
 * in the dropdown forever and choosing it raised `not_a_linked_learner`
 * (42501), which the action surface renders as "forbidden". The product
 * offered a name and then refused its own offer.
 *
 * The two sources are kept in their proper roles rather than merged:
 *   · ELIGIBILITY is the canonical relationship (`engagement_contexts`,
 *     `status = 'active'`) — the exact predicate the RPC enforces;
 *   · the LABEL is still only what the institution typed on the invitation
 *     it sent, so the least-privilege ruling of 2026-08-27 is untouched. A
 *     person the institution cannot already name is not named here.
 *
 * Both halves are required, so this is an INTERSECTION. A learner with a
 * live relationship but no invitation the institution can read stays out:
 * inventing a label for them would disclose more than the ruling allows,
 * and the count in the learners section — which is a count, not a roster —
 * remains the honest place that person is visible.
 */
export function eligibleLearners(
  labelByProfile: ReadonlyMap<string, string>,
  activeStudentProfileIds: ReadonlySet<string>,
): readonly AssignableLearner[] {
  const out: AssignableLearner[] = [];
  for (const [profileId, label] of labelByProfile) {
    if (activeStudentProfileIds.has(profileId)) out.push({ profileId, label });
  }
  return out;
}

export type InstitutionProgramsRead =
  | {
      readonly status: "ok";
      readonly programs: readonly ProgramRow[];
      readonly assignable: readonly AssignableLearner[];
    }
  | { readonly status: "unavailable" };

const MISSING = new Set(["42P01", "PGRST205", "42883", "PGRST202"]);
export function isMissingSchemaCode(code: string | undefined | null): boolean {
  return !!code && MISSING.has(code);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function readInstitutionPrograms(organizationId: string): Promise<InstitutionProgramsRead> {
  const supabase = await createClient();

  const programsRes = await asAny(supabase)
    .from("education_programs")
    .select("id, name, target_profession_slug, education_type_slug, description, archived_at")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (programsRes.error) {
    return { status: "unavailable" };
  }
  const programRows = (programsRes.data ?? []) as Array<Record<string, unknown>>;
  const programIds = programRows.map((p) => String(p.id));

  const [cohortsRes, invRes, ctxRes, demandRes] = await Promise.all([
    programIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : asAny(supabase)
          .from("education_cohorts")
          .select("id, program_id, name, starts_on, ends_on, archived_at, education_cohort_members(profile_id, status)")
          .in("program_id", programIds)
          .is("archived_at", null)
          .order("created_at", { ascending: true })
          .limit(300),
    asAny(supabase)
      .from("invitations")
      .select("accepted_by_profile_id, invited_name, invited_email")
      .eq("organization_id", organizationId)
      .eq("relationship_slug", "student")
      .eq("status", "accepted")
      .not("accepted_by_profile_id", "is", null)
      .limit(500),
    // The eligibility half. RLS on `engagement_contexts` already admits
    // `manages_organization(organization_id)`, which is the same authority
    // the learners section uses for its COUNT of these rows — so reading the
    // profile ids of THIS organisation's active students widens nothing.
    asAny(supabase)
      .from("engagement_contexts")
      .select("profile_id")
      .eq("organization_id", organizationId)
      .eq("relationship_slug", "student")
      .eq("status", "active")
      .limit(500),
    asAny(supabase).rpc("count_public_vacancies_by_profession_v1", { p_limit: 100 }),
  ]);
  // A failed eligibility read is `unavailable`, not an empty dropdown: an
  // empty list here reads as "this institution has no learners", which is a
  // different and false statement (SEP-7, UNKNOWN != ZERO).
  if (cohortsRes.error || invRes.error || ctxRes.error) return { status: "unavailable" };

  const labelByProfile = new Map<string, string>();
  for (const r of (invRes.data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.accepted_by_profile_id);
    if (!labelByProfile.has(pid)) {
      labelByProfile.set(pid, String(r.invited_name ?? r.invited_email ?? pid.slice(0, 8)));
    }
  }
  const demandBySlug = new Map<string, number>();
  if (!demandRes.error) {
    for (const r of (demandRes.data ?? []) as Array<Record<string, unknown>>) {
      demandBySlug.set(String(r.profession_slug), Number(r.active_vacancies ?? 0));
    }
  }

  const cohortsByProgram = new Map<string, CohortRow[]>();
  for (const c of (cohortsRes.data ?? []) as Array<Record<string, unknown>>) {
    const members = ((c.education_cohort_members ?? []) as Array<Record<string, unknown>>).map((m) => ({
      profileId: String(m.profile_id),
      status: (String(m.status) === "left" ? "left" : "active") as "active" | "left",
      label: labelByProfile.get(String(m.profile_id)) ?? String(m.profile_id).slice(0, 8),
    }));
    const row: CohortRow = {
      id: String(c.id),
      name: String(c.name),
      startsOn: (c.starts_on as string | null) ?? null,
      endsOn: (c.ends_on as string | null) ?? null,
      members,
    };
    const key = String(c.program_id);
    cohortsByProgram.set(key, [...(cohortsByProgram.get(key) ?? []), row]);
  }

  const programs: ProgramRow[] = programRows.map((p) => {
    const slug = (p.target_profession_slug as string | null) ?? null;
    return {
      id: String(p.id),
      name: String(p.name),
      targetProfessionSlug: slug,
      educationTypeSlug: (p.education_type_slug as string | null) ?? null,
      description: (p.description as string | null) ?? null,
      demandCount: slug && !demandRes.error ? (demandBySlug.get(slug) ?? 0) : null,
      cohorts: cohortsByProgram.get(String(p.id)) ?? [],
    };
  });

  const activeStudentProfileIds = new Set<string>(
    ((ctxRes.data ?? []) as Array<Record<string, unknown>>).map((r) => String(r.profile_id)),
  );
  const assignable = eligibleLearners(labelByProfile, activeStudentProfileIds);

  return { status: "ok", programs, assignable };
}
