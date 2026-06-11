import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  CANDIDATE_DRAFT_STATUSES,
  type CandidateDraft,
  type CandidateDraftStatus,
} from "@/lib/candidates/candidate-draft-types";

/**
 * Candidate / provider draft read service (slice candidate-provider-draft-v1).
 *
 * Owner-scoped by RLS (owner_id = auth.uid()) — a manager reads ONLY the drafts
 * they created; no service_role, no cross-owner read. Graceful while the v1
 * migration is not yet applied (relation/column missing → empty, never fake).
 */

const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}
function migMissing(code?: string): boolean {
  return code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;
}

export type CandidateDraftsRead =
  | { kind: "ok"; drafts: CandidateDraft[] }
  | { kind: "needs-migration" };

/** The caller's own candidate/provider drafts (RLS-scoped to owner_id). */
export async function listOwnCandidateDrafts(): Promise<CandidateDraftsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", drafts: [] };

  const res = await asAny(supabase)
    .from("candidate_drafts")
    .select(
      "id, name_or_title, contact, profession_service, language, skills_text, notes, status, project_id, linked_profile_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (res.error) {
    if (migMissing(res.error.code)) return { kind: "needs-migration" };
    return { kind: "ok", drafts: [] };
  }

  type Row = {
    id: string;
    name_or_title: string;
    contact: string | null;
    profession_service: string | null;
    language: string | null;
    skills_text: string | null;
    notes: string | null;
    status: string;
    project_id: string | null;
    linked_profile_id: string | null;
    created_at: string;
  };

  const drafts: CandidateDraft[] = ((res.data ?? []) as Row[]).map((r) => ({
    id: r.id,
    nameOrTitle: r.name_or_title,
    contact: r.contact ?? null,
    professionService: r.profession_service ?? null,
    language: r.language ?? null,
    skillsText: r.skills_text ?? null,
    notes: r.notes ?? null,
    status: (CANDIDATE_DRAFT_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as CandidateDraftStatus)
      : "draft",
    projectId: r.project_id ?? null,
    linkedProfileId: r.linked_profile_id ?? null,
    createdAt: r.created_at,
  }));
  return { kind: "ok", drafts };
}
