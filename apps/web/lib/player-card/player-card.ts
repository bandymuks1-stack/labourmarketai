import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { listAttentionInstructions } from "@/lib/instructions/instructions";

/**
 * Worker player-card (slice worker-player-card-v1, re-skinned by TASK 07 slice
 * design-soul-scouting-ui-v1) — a calm, worker-first summary of the worker's
 * OWN real dimensions. Read-only, RLS-scoped, and HONEST: every number is a
 * real count of the worker's own rows; on any read error a dimension falls
 * back to 0 / false / empty (never a fabricated value). No fake skills,
 * evidence, confirmations, or verification.
 *
 * TASK 07 additions are additive: verified skills (manager-confirmed
 * worker_skills only) with their platform icons where one exists, real
 * availability, the latest evidence timestamp — all of it the skin of live
 * data (DESIGN_SOUL §1), none of it invented.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** A manager-confirmed skill on the card. Icon is optional (skill_icons row). */
export interface VerifiedSkillBadge {
  readonly slug: string;
  readonly iconSlug: string | null;
}

export interface WorkerPlayerCard {
  displayName: string | null;
  /** Self-declared skill claims (NOT verified). */
  skillsDeclared: number;
  /** Candidate skills the worker added in their own words (needs-clarification,
   *  NOT verified) — from the clarify-capture flow. */
  candidateSkills: number;
  /** Work-journal entries the worker has recorded (their own evidence). */
  evidenceEntries: number;
  /** New unread work/safety instructions needing attention. */
  attentionInstructions: number;
  /** Whether the worker has confirmed their work card. */
  workCardConfirmed: boolean;
  /** Manager-confirmed skills (worker_skills.verified = true) — the ONLY
   *  skills the card may visually celebrate. Empty when none are confirmed. */
  verifiedSkills: VerifiedSkillBadge[];
  /** Manager confirmations on the worker's own journal entries. */
  managerConfirmations: number;
  /** Saved availability status slug (workers.availability_status), or null. */
  availabilityStatus: string | null;
  /** Saved available-from ISO date, or null. */
  availableFrom: string | null;
  /** Primary profession slug for the i18n label, or null. */
  professionSlug: string | null;
  /** ISO timestamp of the newest live journal entry — the latest work proof. */
  latestEvidenceAt: string | null;
}

async function safeCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
): Promise<number> {
  try {
    const { count, error } = await query;
    if (error || typeof count !== "number") return 0;
    return count;
  } catch {
    return 0;
  }
}

/** Verified (manager-confirmed) skills + their icons. [] on any error. */
async function verifiedSkillBadges(
  supabase: SupabaseClient,
  workerId: string,
): Promise<VerifiedSkillBadge[]> {
  try {
    const { data: rows } = await asAny(supabase)
      .from("worker_skills")
      .select("skill_id, skills(slug)")
      .eq("worker_id", workerId)
      .eq("verified", true)
      .limit(12);
    const skills = ((rows ?? []) as {
      skill_id: string | null;
      skills: { slug: string | null } | null;
    }[])
      .map((r) => ({ id: r.skill_id, slug: r.skills?.slug ?? null }))
      .filter((s): s is { id: string; slug: string } => !!s.id && !!s.slug);
    if (skills.length === 0) return [];

    const { data: iconRows } = await asAny(supabase)
      .from("skill_icons")
      .select("skill_id, icon_slug")
      .in(
        "skill_id",
        skills.map((s) => s.id),
      );
    const icons = new Map<string, string>(
      ((iconRows ?? []) as { skill_id: string; icon_slug: string }[]).map(
        (r) => [r.skill_id, r.icon_slug],
      ),
    );
    return skills.map((s) => ({
      slug: s.slug,
      iconSlug: icons.get(s.id) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Manager confirmations on the worker's own entries. 0 on any error. */
async function ownConfirmationsCount(
  supabase: SupabaseClient,
  workerId: string,
): Promise<number> {
  try {
    const { data: entryRows } = await asAny(supabase)
      .from("journal_entries")
      .select("id")
      .eq("worker_id", workerId);
    const ids = ((entryRows ?? []) as { id: string }[]).map((e) => e.id);
    if (ids.length === 0) return 0;
    return await safeCount(
      asAny(supabase)
        .from("journal_entry_confirmations")
        .select("id", { count: "exact", head: true })
        .in("entry_id", ids),
    );
  } catch {
    return 0;
  }
}

export async function getWorkerPlayerCard(): Promise<WorkerPlayerCard | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Profile name + the worker row (id for journal scope, work-card confirmation,
  // real availability for the card).
  const [{ data: profile }, { data: worker }] = await Promise.all([
    asAny(supabase).from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    asAny(supabase)
      .from("workers")
      .select("id, work_card_confirmed_at, availability_status, available_from")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  const workerId: string | null = worker?.id ?? null;

  const [
    skillsDeclared,
    candidateSkills,
    evidenceEntries,
    attention,
    verifiedSkills,
    managerConfirmations,
    professionRow,
    latestEntry,
  ] = await Promise.all([
    safeCount(
      asAny(supabase)
        .from("profile_skill_claims")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id),
    ),
    safeCount(
      asAny(supabase)
        .from("skill_candidate_clarifications")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id),
    ),
    workerId
      ? safeCount(
          asAny(supabase)
            .from("journal_entries")
            .select("*", { count: "exact", head: true })
            .eq("worker_id", workerId),
        )
      : Promise.resolve(0),
    listAttentionInstructions()
      .then((x) => x.length)
      .catch(() => 0),
    workerId
      ? verifiedSkillBadges(supabase, workerId)
      : Promise.resolve([] as VerifiedSkillBadge[]),
    workerId
      ? ownConfirmationsCount(supabase, workerId)
      : Promise.resolve(0),
    workerId
      ? asAny(supabase)
          .from("worker_professions")
          .select("professions(slug)")
          .eq("worker_id", workerId)
          .eq("is_primary", true)
          .maybeSingle()
          .then((r: { data: { professions: { slug: string | null } | null } | null }) => r.data)
          .catch(() => null)
      : Promise.resolve(null),
    workerId
      ? asAny(supabase)
          .from("journal_entries")
          .select("created_at")
          .eq("worker_id", workerId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r: { data: { created_at: string } | null }) => r.data)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    displayName: profile?.full_name ?? null,
    skillsDeclared,
    candidateSkills,
    evidenceEntries,
    attentionInstructions: attention,
    workCardConfirmed: Boolean(worker?.work_card_confirmed_at),
    verifiedSkills,
    managerConfirmations,
    availabilityStatus: worker?.availability_status ?? null,
    availableFrom: worker?.available_from ?? null,
    professionSlug:
      (professionRow?.professions as { slug: string | null } | null)?.slug ??
      null,
    latestEvidenceAt: latestEntry?.created_at ?? null,
  };
}
