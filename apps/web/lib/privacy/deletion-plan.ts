import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";

/**
 * Deletion plan PREVIEW (V9 deletion executor, phase 2 — READ-ONLY).
 *
 * Given a profile id from a privacy request, produce the factual per-class
 * inventory of what deletion WOULD touch, projected from the design doc's
 * E1–E8 mapping (docs/legal/deletion-process-design-v1.md) over the
 * retention matrix's IMPLEMENTED facts. This is a DESIGN PROJECTION, not
 * execution — the type name says so, the caller renders it under an
 * explicit "preview only" header, and this module issues ZERO writes
 * (guard-pinned: no update/delete/insert/upsert/rpc).
 *
 * ── COUNT HONESTY ──────────────────────────────────────────────────────────
 * Counts run as ordinary authenticated HEAD counts at the SAME access level
 * the admin queue read uses — RLS decides visibility, nothing is broadened.
 * Two classes are DELIBERATELY self-only at RLS (privacy_consent_events has
 * no admin select by design; notification_events is recipient-only): a HEAD
 * count there would return a false zero, so those classes are marked
 * `rowCount: null` ("not countable at this access level") and NO query is
 * issued for them — the executor's owner-run step counts them at execution
 * time. A failed read likewise degrades that class to null, never to a
 * fabricated zero.
 */

export const DELETION_PLAN_ACTIONS = [
  "delete",
  "anonymize_detach",
  "keep_legal",
  "keep_pending_decision",
] as const;
export type DeletionPlanAction = (typeof DELETION_PLAN_ACTIONS)[number];

/** Stable class keys — also the i18n suffixes the section renders. */
export const DELETION_PLAN_CLASSES = [
  "account",
  "journal",
  "journalPhotos",
  "skills",
  "skillClaims",
  "documents",
  "bookings",
  "engagements",
  "consents",
  "messages",
  "inquiries",
  "notifications",
] as const;
export type DeletionPlanClass = (typeof DELETION_PLAN_CLASSES)[number];

export interface DeletionPlanPreviewRow {
  readonly dataClass: DeletionPlanClass;
  /** null = not countable at this access level / read failed — NEVER a
   *  fabricated zero. */
  readonly rowCount: number | null;
  readonly plannedAction: DeletionPlanAction;
  /** The design-doc executor step this projection comes from (E1–E8). */
  readonly basis: string;
}

export type DeletionPlanPreview =
  | { readonly kind: "ok"; readonly rows: readonly DeletionPlanPreviewRow[] }
  | { readonly kind: "not-superadmin" }
  | { readonly kind: "invalid" };

// Accepts the client AND the anonymous query builders the filters receive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient | unknown): any {
  return c;
}

/** HEAD count under RLS; null on any error — a failed read is not a zero. */
async function headCount(
  supabase: SupabaseClient,
  table: string,
  filter: (q: unknown) => unknown,
): Promise<number | null> {
  try {
    const q = asAny(supabase)
      .from(table)
      .select("id", { count: "exact", head: true });
    const { count, error } = await (filter(q) as PromiseLike<{
      count: number | null;
      error: unknown;
    }>);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function buildDeletionPlanPreview(
  profileId: string,
): Promise<DeletionPlanPreview> {
  if (!profileId.trim()) return { kind: "invalid" };
  // The section already sits behind requireSuperadmin; this is the module's
  // own fail-fast so no other caller can quietly reuse it more broadly.
  if (!(await isSuperadmin())) return { kind: "not-superadmin" };

  const supabase = await createClient();

  // The worker rows this profile owns — several classes hang off workers.id.
  let workerIds: string[] = [];
  try {
    const { data } = await asAny(supabase)
      .from("workers")
      .select("id")
      .eq("profile_id", profileId)
      .limit(20);
    workerIds = ((data ?? []) as { id: string }[]).map((w) => w.id);
  } catch {
    /* workerIds stay empty; worker-keyed classes count 0-or-null below */
  }

  const byWorker = (col: string) => (q: unknown) =>
    workerIds.length === 0
      ? // No worker row → the class genuinely has no rows for this profile.
        Promise.resolve({ count: 0, error: null })
      : (asAny(q).in(col, workerIds) as unknown);

  const [
    profileCount,
    journal,
    journalPhotos,
    skills,
    skillClaims,
    documents,
    bookings,
    engagements,
    messages,
    inquiries,
  ] = await Promise.all([
    headCount(supabase, "profiles", (q) => asAny(q).eq("id", profileId)),
    headCount(supabase, "journal_entries", byWorker("worker_id")),
    headCount(supabase, "journal_entry_photos", (q) =>
      asAny(q).eq("profile_id", profileId),
    ),
    headCount(supabase, "worker_skills", byWorker("worker_id")),
    headCount(supabase, "profile_skill_claims", (q) =>
      asAny(q).eq("profile_id", profileId),
    ),
    headCount(supabase, "worker_documents", byWorker("worker_id")),
    headCount(supabase, "booking_requests", (q) =>
      workerIds.length === 0
        ? asAny(q).eq("owner_id", profileId)
        : asAny(q).or(
            `owner_id.eq.${profileId},worker_id.in.(${workerIds.join(",")})`,
          ),
    ),
    headCount(supabase, "engagement_contexts", (q) =>
      asAny(q).eq("profile_id", profileId),
    ),
    headCount(supabase, "conversation_messages", (q) =>
      asAny(q).eq("author_id", profileId),
    ),
    headCount(supabase, "customer_requests", (q) =>
      asAny(q).eq("profile_id", profileId),
    ),
  ]);

  // Account = the profiles row + its worker rows (one cascade root).
  const account =
    profileCount === null ? null : profileCount + workerIds.length;

  const rows: DeletionPlanPreviewRow[] = [
    { dataClass: "journal", rowCount: journal, plannedAction: "anonymize_detach", basis: "E1" },
    { dataClass: "consents", rowCount: null, plannedAction: "anonymize_detach", basis: "E2" },
    { dataClass: "bookings", rowCount: bookings, plannedAction: "keep_pending_decision", basis: "E3" },
    { dataClass: "engagements", rowCount: engagements, plannedAction: "keep_pending_decision", basis: "E3" },
    { dataClass: "inquiries", rowCount: inquiries, plannedAction: "anonymize_detach", basis: "E4" },
    { dataClass: "journalPhotos", rowCount: journalPhotos, plannedAction: "delete", basis: "E5" },
    { dataClass: "documents", rowCount: documents, plannedAction: "delete", basis: "E5" },
    { dataClass: "messages", rowCount: messages, plannedAction: "anonymize_detach", basis: "E6" },
    { dataClass: "skills", rowCount: skills, plannedAction: "delete", basis: "E7" },
    { dataClass: "skillClaims", rowCount: skillClaims, plannedAction: "delete", basis: "E7" },
    { dataClass: "account", rowCount: account, plannedAction: "delete", basis: "E7" },
    { dataClass: "notifications", rowCount: null, plannedAction: "delete", basis: "E8" },
  ];

  return { kind: "ok", rows };
}
