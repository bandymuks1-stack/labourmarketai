import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Institution learners — the participation read for an education
 * institution (Track C slice 1, FIRST REAL ECOSYSTEM USE 2026-09-03).
 *
 * WHAT AN INSTITUTION MAY SEE (owner ruling 2026-08-27, learner visibility
 * least-privilege v1, applied to production): a `student` relationship does
 * NOT grant the institution the employer's view of a worker. So this read
 * touches exactly two things the institution already owns or manages:
 *   1. the student invitations IT sent (`invitations`, RLS: inviter or
 *      organisation manager) — name/e-mail are what the institution typed;
 *   2. the COUNT of active `student` engagement contexts on its organisation
 *      (`engagement_contexts`, RLS: manages_organization) — a number, never a
 *      row of learner data.
 * No workers, journals, skills, CVs or profiles are read here, by design.
 *
 * Honest degradation: any read failure is `unavailable`, never an empty list
 * pretending to be "no learners".
 */

export type LearnerInvitationStatus = "accepted" | "pending" | "declined" | "expired" | "revoked";

export interface LearnerInvitationRow {
  readonly id: string;
  readonly invitedName: string | null;
  readonly invitedEmail: string;
  readonly status: LearnerInvitationStatus;
  readonly createdAt: string;
  readonly acceptedAt: string | null;
}

export type InstitutionLearnersRead =
  | {
      readonly status: "ok";
      readonly connectedCount: number;
      readonly invitations: readonly LearnerInvitationRow[];
      readonly counts: Readonly<Record<LearnerInvitationStatus, number>>;
    }
  | { readonly status: "unavailable" };

/** Pure: collapse the invitation table's status + expiry into the five
 *  participation states the institution acts on. */
export function classifyLearnerInvitation(
  row: { status: string; expiresAt: string | null; acceptedAt: string | null },
  now: Date,
): LearnerInvitationStatus {
  if (row.status === "accepted" || row.acceptedAt) return "accepted";
  if (row.status === "declined") return "declined";
  if (row.status === "revoked") return "revoked";
  if (row.expiresAt && new Date(row.expiresAt).getTime() < now.getTime()) return "expired";
  if (row.status === "expired") return "expired";
  return "pending";
}

export function countByStatus(
  rows: readonly LearnerInvitationRow[],
): Readonly<Record<LearnerInvitationStatus, number>> {
  const counts: Record<LearnerInvitationStatus, number> = {
    accepted: 0,
    pending: 0,
    declined: 0,
    expired: 0,
    revoked: 0,
  };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function readInstitutionLearners(
  organizationId: string,
  now: Date = new Date(),
): Promise<InstitutionLearnersRead> {
  const supabase = await createClient();

  const [inv, ctx] = await Promise.all([
    asAny(supabase)
      .from("invitations")
      .select("id, invited_name, invited_email, status, created_at, expires_at, accepted_at")
      .eq("organization_id", organizationId)
      .eq("relationship_slug", "student")
      .order("created_at", { ascending: false })
      .limit(200),
    asAny(supabase)
      .from("engagement_contexts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("relationship_slug", "student")
      .eq("status", "active"),
  ]);

  if (inv.error || ctx.error) return { status: "unavailable" };

  const invitations: LearnerInvitationRow[] = ((inv.data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({
      id: String(r.id),
      invitedName: (r.invited_name as string | null) ?? null,
      invitedEmail: String(r.invited_email ?? ""),
      status: classifyLearnerInvitation(
        {
          status: String(r.status ?? ""),
          expiresAt: (r.expires_at as string | null) ?? null,
          acceptedAt: (r.accepted_at as string | null) ?? null,
        },
        now,
      ),
      createdAt: String(r.created_at ?? ""),
      acceptedAt: (r.accepted_at as string | null) ?? null,
    }),
  );

  return {
    status: "ok",
    connectedCount: typeof ctx.count === "number" ? ctx.count : 0,
    invitations,
    counts: countByStatus(invitations),
  };
}
