import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  PUBLIC_DEMAND_LIMIT,
  demandCountFor,
  publicDemandRead,
} from "@/lib/market/public-demand";

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
 * counts per profession, no vacancy row) — read through the shared
 * `lib/market/public-demand` rule, which decides whether an absent profession
 * is a measured zero or an unmeasured unknown.
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

/** A learner's own request to join (J-12): the name they typed, never their profile. */
export interface CohortJoinRequestRow {
  readonly profileId: string;
  readonly label: string;
  readonly note: string | null;
  readonly requestedAt: string | null;
}

export interface CohortRow {
  readonly id: string;
  readonly name: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly members: readonly CohortMemberRow[];
  /** Learners may find this group and ask to join; `null` = this database has no join requests yet. */
  readonly joinRequestsOpen: boolean | null;
  readonly requests: readonly CohortJoinRequestRow[];
}

/**
 * ONE MEMBERSHIP ROW, SEVERAL STATES (migration 20261102160000). A join
 * request is the same (cohort, profile) row before the institution decides, so
 * the roster and the request list are split here and nowhere else: only
 * `active` / `left` rows are members; `requested` rows are open requests;
 * `declined` / `withdrawn` rows are history and show in neither. Before that
 * migration a requested row could not exist, and treating an unknown state as
 * `active` would have counted a request as a member.
 *
 * A MEMBER is named by what the institution typed on its own invitation, else
 * the name the learner typed on their request. A REQUEST is named only by what
 * the learner typed on it — the card says exactly that ("typed by the learner,
 * not checked"), so an older invitation name must never stand in for it. Never
 * anything read from the profile.
 */
export function splitCohortMembers(
  rows: ReadonlyArray<Record<string, unknown>>,
  labelByProfile: ReadonlyMap<string, string>,
): { members: CohortMemberRow[]; requests: CohortJoinRequestRow[] } {
  const members: CohortMemberRow[] = [];
  const requests: CohortJoinRequestRow[] = [];
  for (const m of rows) {
    const profileId = String(m.profile_id);
    const status = String(m.status);
    const typed = typeof m.request_label === "string" && m.request_label.trim() ? m.request_label.trim() : null;
    if (status === "active" || status === "left")
      members.push({ profileId, status, label: labelByProfile.get(profileId) ?? typed ?? profileId.slice(0, 8) });
    else if (status === "requested")
      requests.push({
        profileId,
        label: typed ?? profileId.slice(0, 8),
        note: typeof m.request_note === "string" && m.request_note.trim() ? m.request_note.trim() : null,
        requestedAt: typeof m.requested_at === "string" ? m.requested_at : null,
      });
  }
  return { members, requests };
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
      /**
       * Whether the caller may see and change cohort MEMBERSHIP: the
       * institution's own owner / admin / manager (J-12 decider basis,
       * `is_education_cohort_internal_decider_v1`). An external manager reads
       * programmes and cohorts but no membership row, so for them every
       * cohort's `members` / `requests` are empty because they are NOT KNOWN —
       * never "0 members" (SEP-7, UNKNOWN != ZERO). Callers must check this.
       */
      readonly membersVisible: boolean;
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

const COHORT_COLUMNS = "id, program_id, name, starts_on, ends_on, archived_at";
const JOIN_COLUMNS = "join_requests_open, education_cohort_members(profile_id, status, request_label, request_note, requested_at)";

/**
 * Reads the cohorts with the join-request columns, and falls back to the
 * columns every database has when they do not exist yet (42703: migration
 * 20261102160000 not applied). The fallback keeps the whole section working
 * and marks join requests as not available — never as "closed".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readCohorts(supabase: SupabaseClient, programIds: readonly string[]): Promise<any> {
  const query = (columns: string) =>
    asAny(supabase)
      .from("education_cohorts")
      .select(columns)
      .in("program_id", programIds)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(300);
  const full = await query(`${COHORT_COLUMNS}, ${JOIN_COLUMNS}`);
  if (!full.error || full.error.code !== "42703") return full;
  return query(`${COHORT_COLUMNS}, education_cohort_members(profile_id, status)`);
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

  const [cohortsRes, invRes, ctxRes, demandRes, deciderRes] = await Promise.all([
    programIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : readCohorts(supabase, programIds),
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
    asAny(supabase).rpc("count_public_vacancies_by_profession_v1", { p_limit: PUBLIC_DEMAND_LIMIT }),
    asAny(supabase).rpc("is_education_cohort_internal_decider_v1", { p_org: organizationId }),
  ]);
  // A failed or missing answer is "not visible", never "visible with zero".
  const membersVisible = !deciderRes.error && deciderRes.data === true;
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
  // One rule, shared with the learning compass: absence is a zero only when
  // the list came back shorter than the limit it asked for (lib/market/public-demand).
  const demand = demandRes.error
    ? null
    : publicDemandRead(
        (demandRes.data ?? []) as Array<Record<string, unknown>>,
        PUBLIC_DEMAND_LIMIT,
      );

  const cohortsByProgram = new Map<string, CohortRow[]>();
  for (const c of (cohortsRes.data ?? []) as Array<Record<string, unknown>>) {
    const { members, requests } = membersVisible
      ? splitCohortMembers((c.education_cohort_members ?? []) as Array<Record<string, unknown>>, labelByProfile)
      : { members: [], requests: [] };
    const row: CohortRow = {
      id: String(c.id),
      name: String(c.name),
      startsOn: (c.starts_on as string | null) ?? null,
      endsOn: (c.ends_on as string | null) ?? null,
      members,
      joinRequestsOpen: typeof c.join_requests_open === "boolean" ? c.join_requests_open : null,
      requests,
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
      demandCount: demandCountFor(slug, demand),
      cohorts: cohortsByProgram.get(String(p.id)) ?? [],
    };
  });

  const activeStudentProfileIds = new Set<string>(
    ((ctxRes.data ?? []) as Array<Record<string, unknown>>).map((r) => String(r.profile_id)),
  );
  const assignable = eligibleLearners(labelByProfile, activeStudentProfileIds);

  return { status: "ok", programs, assignable, membersVisible };
}
