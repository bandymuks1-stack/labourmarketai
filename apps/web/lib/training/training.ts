import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { listOrganizationMembers } from "@/lib/company/memberships";
import { workerDisplayNamesByProfile } from "@/lib/operations/member-display-names";
import {
  NO_TRAINING_AUTHORITY,
  TRAINING_ASSIGNABLE_RELATIONSHIPS,
  TRAINING_READ_LIMIT,
  deriveTrainingAuthority,
  isTrainingAssignableEngagement,
  isTrainingMigrationMissingCode,
  isValidTrainingAssignmentStatus,
  type CertificationRow,
  type TrainingAssignee,
  type TrainingAssignmentRow,
  type TrainingAuthority,
  type TrainingProgramRow,
} from "@/lib/training/training-model";

/**
 * Training & Certification read service (v1).
 *
 * Reads ONLY the new `training_*` tables with the caller's RLS-scoped
 * client, plus a READ-ONLY join out to the EXISTING `worker_documents`
 * qualification rows for the certification register. Nothing is migrated,
 * copied or rewritten in the worker-document register — it stays canonical
 * for worker-scope documents and this layer only reads it.
 *
 * INTERNAL ONLY: this layer never sends anything anywhere.
 *
 * Honest degradation: while the human-gated migration is not applied the
 * reads see 42P01 and report { kind: "needs-migration" } — the section shows
 * the calm "not enabled yet" state and nothing is faked.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type RawRow = Record<string, unknown>;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The worker-document types the register lists — each has a label under
 *  `documents.types` in every locale. */
const CERTIFICATE_DOCUMENT_TYPES = ["professional_certificate", "health_safety_card"] as const;

const PROGRAM_COLUMNS =
  "id, organization_id, title, description, material_document_id, is_active, created_at";
const ASSIGNMENT_COLUMNS =
  "id, program_id, organization_id, assignee_profile_id, required_by, status, completed_at, completion_note, certificate_document_file_id, issued_on, expires_on, created_at, training_programs(title)";

function toProgram(r: RawRow): TrainingProgramRow {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    materialDocumentId: (r.material_document_id as string | null) ?? null,
    isActive: r.is_active === true,
    createdAt: String(r.created_at),
  };
}

function toAssignment(r: RawRow): TrainingAssignmentRow | null {
  const status = String(r.status ?? "");
  if (!isValidTrainingAssignmentStatus(status)) return null;
  const program = r.training_programs as { title?: string } | null;
  return {
    id: String(r.id),
    programId: String(r.program_id),
    programTitle: String(program?.title ?? ""),
    organizationId: String(r.organization_id),
    assigneeProfileId: String(r.assignee_profile_id),
    requiredBy: (r.required_by as string | null) ?? null,
    status,
    completedAt: (r.completed_at as string | null) ?? null,
    completionNote: (r.completion_note as string | null) ?? null,
    certificateDocumentFileId:
      (r.certificate_document_file_id as string | null) ?? null,
    issuedOn: (r.issued_on as string | null) ?? null,
    expiresOn: (r.expires_on as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export type TrainingOverviewResult =
  | { readonly kind: "not-authed" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" }
  | {
      readonly kind: "ok";
      readonly programs: readonly TrainingProgramRow[];
      /** Assignments the caller may see at all — RLS decides: their own, plus
       *  the org's if they hold a managing role. */
      readonly assignments: readonly TrainingAssignmentRow[];
      /** The caller's own assignments, split out for the personal inbox. */
      readonly mine: readonly TrainingAssignmentRow[];
      readonly viewerProfileId: string;
    };

/** Everything the training section renders, in two bounded reads. */
export async function getTrainingOverview(): Promise<TrainingOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const programs = await asAny(supabase)
    .from("training_programs")
    .select(PROGRAM_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(TRAINING_READ_LIMIT);
  if (programs.error) {
    return isTrainingMigrationMissingCode(programs.error.code)
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }

  const assignments = await asAny(supabase)
    .from("training_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(TRAINING_READ_LIMIT);
  if (assignments.error) {
    return isTrainingMigrationMissingCode(assignments.error.code)
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }

  const rows = ((assignments.data ?? []) as RawRow[])
    .map(toAssignment)
    .filter((r): r is TrainingAssignmentRow => r !== null);

  return {
    kind: "ok",
    programs: ((programs.data ?? []) as RawRow[]).map(toProgram),
    assignments: rows,
    mine: rows.filter((r) => r.assigneeProfileId === user.id),
    viewerProfileId: user.id,
  };
}

/** Distinct organizations the authority read asks about — bounded. */
const AUTHORITY_ORG_LIMIT = 20;

/**
 * The caller's training AUTHORITY: which forms the register may offer.
 *
 * Asks the database the exact predicates the write commands enforce (see
 * `TrainingAuthority` in training-model.ts) instead of re-deriving them from
 * role strings or from whether the organization already has data. The add-a-
 * course target is the same `requireEmployerCompany()` resolution
 * `createTrainingProgramAction` uses. Any failed read fails CLOSED.
 *
 * @param organizationIds the organizations of the courses and managed
 *   assignments the register shows.
 */
export async function getTrainingAuthority(
  organizationIds: readonly string[],
): Promise<TrainingAuthority> {
  const supabase = await createClient();
  const employer = await requireEmployerCompany();
  const employerOrganizationId = employer.ok ? employer.organizationId : null;

  const orgs = [
    ...new Set([
      ...(employerOrganizationId ? [employerOrganizationId] : []),
      ...organizationIds.filter((id) => id.length > 0),
    ]),
  ].slice(0, AUTHORITY_ORG_LIMIT);
  if (orgs.length === 0) return NO_TRAINING_AUTHORITY;

  const yes = async (
    name: string,
    args?: Record<string, unknown>,
  ): Promise<boolean> => {
    const { data, error } = await asAny(supabase).rpc(name, args);
    return !error && data === true;
  };

  const [platformAdmin, ownerAdminPairs, demandPairs] = await Promise.all([
    yes("is_admin"),
    Promise.all(
      orgs.map(async (org) => [org, await yes("org_owner_admin_v1", { p_organization_id: org })] as const),
    ),
    Promise.all(
      orgs.map(async (org) => [org, await yes("has_org_demand_access", { org })] as const),
    ),
  ]);

  return deriveTrainingAuthority({
    employerOrganizationId,
    platformAdmin,
    ownerAdmin: new Map(ownerAdminPairs),
    demandAccess: new Map(demandPairs),
  });
}

export type CertificationRegisterResult =
  | { readonly kind: "not-authed" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" }
  | { readonly kind: "ok"; readonly rows: readonly CertificationRow[] };

/**
 * The certification register: a FILTERED READ over training assignments that
 * genuinely carry certificate evidence, unioned with the EXISTING
 * `worker_documents` qualification rows the caller may already read (RLS
 * decides both halves). Read-only on the worker side — no row is migrated,
 * copied or rewritten, and a document the caller cannot read simply does not
 * appear.
 *
 * ONE ORGANIZATION'S CONTEXT IN ONE WORKSPACE (decision 0024). RLS lets a
 * person who manages several organizations read all of their certificates,
 * so the read is scoped here: the ACTIVE organization's certificates plus the
 * person's OWN (the same rule as "Your training"); with no active
 * organization, only the person's own. The worker-document half is always
 * the person's own records — never another worker's, even for a reader whose
 * RLS would return more.
 *
 * @param activeOrganizationId the organization the active workspace shows,
 *   or null in a personal workspace.
 */
export async function getCertificationRegister(
  activeOrganizationId: string | null,
): Promise<CertificationRegisterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const base = asAny(supabase)
    .from("training_assignments")
    .select(
      "id, organization_id, assignee_profile_id, issued_on, expires_on, certificate_document_file_id, training_programs(title)",
    )
    .not("certificate_document_file_id", "is", null);
  const scoped =
    activeOrganizationId && UUID_RX.test(activeOrganizationId)
      ? base.or(`organization_id.eq.${activeOrganizationId},assignee_profile_id.eq.${user.id}`)
      : base.eq("assignee_profile_id", user.id);
  const trainings = await scoped
    .order("expires_on", { ascending: true, nullsFirst: false })
    .limit(TRAINING_READ_LIMIT);
  if (trainings.error) {
    return isTrainingMigrationMissingCode(trainings.error.code)
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }

  const rows: CertificationRow[] = ((trainings.data ?? []) as RawRow[]).map(
    (r) => {
      const program = r.training_programs as { title?: string } | null;
      return {
        source: "training" as const,
        id: String(r.id),
        label: String(program?.title ?? ""),
        documentTypeSlug: null,
        holderProfileId: String(r.assignee_profile_id),
        issuedOn: (r.issued_on as string | null) ?? null,
        expiresOn: (r.expires_on as string | null) ?? null,
      };
    },
  );

  // READ-ONLY second half: the existing worker-document qualification slugs.
  // A failure here is NOT fatal — the training half is still real; the
  // register simply shows what it could read.
  // Only the person's OWN worker records (see the scope note above).
  const ownWorkers = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .limit(TRAINING_READ_LIMIT);
  const ownWorkerIds = ownWorkers.error
    ? []
    : ((ownWorkers.data ?? []) as RawRow[]).map((r) => String(r.id));
  const docs =
    ownWorkerIds.length === 0
      ? { error: null, data: [] }
      : await asAny(supabase)
          .from("worker_documents")
          .select("id, document_type_slug, valid_from, valid_until")
          .in("worker_id", ownWorkerIds)
          .in("document_type_slug", CERTIFICATE_DOCUMENT_TYPES)
          .limit(TRAINING_READ_LIMIT);
  if (!docs.error) {
    for (const r of (docs.data ?? []) as RawRow[]) {
      const slug = String(r.document_type_slug ?? "");
      if (!(CERTIFICATE_DOCUMENT_TYPES as readonly string[]).includes(slug)) continue;
      rows.push({
        source: "worker_document",
        id: String(r.id),
        label: "",
        documentTypeSlug: slug,
        holderProfileId: user.id,
        issuedOn: (r.valid_from as string | null) ?? null,
        expiresOn: (r.valid_until as string | null) ?? null,
      });
    }
  }

  return { kind: "ok", rows };
}

/**
 * WHO A COURSE CAN BE ASSIGNED TO — the register's picker (owner decision
 * 2026-11-18, registry 11.8). The organization's OWN people, read under the
 * caller's RLS from the same rows the people page lists:
 *   * active governance members (company_memberships, listOrganizationMembers);
 *   * active engagements in the four groups (TRAINING_ASSIGNABLE_RELATIONSHIPS —
 *     members, interns, learners, invited external people), the same
 *     engagement_contexts read as lib/operations/org-members.ts.
 * Only a current link is offered — the same status split and dates as
 * `assign_training_v1` (isTrainingAssignableEngagement: a paused non-learning
 * link counts, a paused intern/student link does not; started, not ended).
 * The RPC re-checks the same rule, so a link that ended after the page loaded
 * is still refused. Names: an owner
 * cannot read another person's `profiles` row, so a missing name falls back to
 * the worker's display name (the one shared fallback) — never an e-mail or id.
 */
export async function getTrainingAssignees(
  organizationId: string,
): Promise<readonly TrainingAssignee[]> {
  if (!UUID_RX.test(organizationId)) return [];
  const supabase = await createClient();
  const [engagements, governance] = await Promise.all([
    asAny(supabase)
      .from("engagement_contexts")
      .select("profile_id, relationship_slug, status, started_at, ended_at, profiles(full_name, email)")
      .eq("organization_id", organizationId)
      .in("status", ["active", "paused"])
      .in("relationship_slug", [...TRAINING_ASSIGNABLE_RELATIONSHIPS])
      .limit(TRAINING_READ_LIMIT),
    listOrganizationMembers(organizationId),
  ]);

  const byProfile = new Map<string, { name: string; relationship: string }>();
  const named = (full: string | null | undefined, email: string | null | undefined) =>
    full?.trim() || (email ? email.split("@")[0]! : "");
  if (governance.kind === "ok") {
    for (const m of governance.members) {
      if (m.status !== "active" || !m.profileId) continue;
      byProfile.set(m.profileId, { name: named(m.fullName, m.email), relationship: m.role });
    }
  }
  if (!engagements.error) {
    const today = new Date().toISOString().slice(0, 10);
    for (const r of (engagements.data ?? []) as RawRow[]) {
      const profileId = (r.profile_id as string | null) ?? null;
      if (!profileId || byProfile.has(profileId)) continue;
      const current = isTrainingAssignableEngagement(
        {
          relationshipSlug: String(r.relationship_slug ?? ""),
          status: String(r.status ?? ""),
          startedAt: (r.started_at as string | null) ?? null,
          endedAt: (r.ended_at as string | null) ?? null,
        },
        today,
      );
      if (!current) continue;
      const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as
        | { full_name?: string | null; email?: string | null }
        | null;
      byProfile.set(profileId, {
        name: named(p?.full_name, p?.email),
        relationship: String(r.relationship_slug ?? ""),
      });
    }
  }

  const unnamed = [...byProfile].filter(([, v]) => !v.name).map(([id]) => id);
  const display = await workerDisplayNamesByProfile(supabase, unnamed);
  return [...byProfile]
    .map(([profileId, v]) => ({
      profileId,
      name: v.name || display.get(profileId) || "—",
      relationship: v.relationship,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
