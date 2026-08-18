import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  TRAINING_READ_LIMIT,
  isTrainingMigrationMissingCode,
  isValidTrainingAssignmentStatus,
  type CertificationRow,
  type TrainingAssignmentRow,
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
 */
export async function getCertificationRegister(): Promise<CertificationRegisterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const trainings = await asAny(supabase)
    .from("training_assignments")
    .select(
      "id, assignee_profile_id, issued_on, expires_on, certificate_document_file_id, training_programs(title)",
    )
    .not("certificate_document_file_id", "is", null)
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
        holderProfileId: String(r.assignee_profile_id),
        issuedOn: (r.issued_on as string | null) ?? null,
        expiresOn: (r.expires_on as string | null) ?? null,
      };
    },
  );

  // READ-ONLY second half: the existing worker-document qualification slugs.
  // A failure here is NOT fatal — the training half is still real; the
  // register simply shows what it could read.
  const docs = await asAny(supabase)
    .from("worker_documents")
    .select("id, document_type_slug, valid_from, valid_until")
    .in("document_type_slug", ["professional_certificate", "health_safety_card"])
    .limit(TRAINING_READ_LIMIT);
  if (!docs.error) {
    for (const r of (docs.data ?? []) as RawRow[]) {
      rows.push({
        source: "worker_document",
        id: String(r.id),
        label: String(r.document_type_slug ?? ""),
        holderProfileId: null,
        issuedOn: (r.valid_from as string | null) ?? null,
        expiresOn: (r.valid_until as string | null) ?? null,
      });
    }
  }

  return { kind: "ok", rows };
}
