import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import {
  getPrimaryProfessionSlug,
  getWorkerCoreRow,
  getWorkerSkillRows,
  type WorkerSkillRow,
} from "@/lib/data/worker-core";
import { listAttentionInstructions } from "@/lib/instructions/instructions";
import {
  deriveDocumentStatus,
  listMyDocuments,
} from "@/lib/documents/readiness";
import { getOwnWorkHistory } from "./work-history";
import type { WorkHistoryEntry } from "./work-history-model";
import {
  deriveEvidenceTimeline,
  deriveSkillEvidence,
  type EvidenceMonth,
  type SkillEvidenceBar,
} from "./evidence-visuals";

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
  /** ALL declared skills — the deduped union of free-text
   *  `profile_skill_claims` AND catalogued `worker_skills` rows (skills truth
   *  contract, RC3). Production finding F9: the dashboard used to count ONLY
   *  profile_skill_claims while the journal-supported number counted ONLY
   *  worker_skills — two different populations presented as one, so "19
   *  skills / 2 supported" was structurally incoherent. Every surface must
   *  read THIS builder; journalSupportedSkills is a subset of this number. */
  skillsDeclared: number;
  /** Skills whose evidence tier is `work_journal` (worker_skills.source) —
   *  backed by journal entries, stronger than self-declared, NOT yet
   *  manager-confirmed. The middle rung of the honest evidence ladder. */
  journalSupportedSkills: number;
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
  /** §5.2 LOCATION — the worker's own stated country code (ISO-2), or null.
   *  Country precision only: the card never implies an address. */
  locationCountry: string | null;
  /** §5.2 DOCUMENTS — real counts from the worker's OWN document records.
   *  `null` when the documents surface is unavailable for this account
   *  (honest absence, never a zeroed-out fake summary). */
  documents: { total: number; expiring: number } | null;
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
  /**
   * Real work history from the canonical `engagement_contexts` spine (W5) —
   * WHERE the work happened, which the card previously could not say. Newest
   * first, own data only, bounded. Empty means "no engagements recorded",
   * which is a fact; it is never padded with an example.
   */
  workHistory: readonly WorkHistoryEntry[];
  /**
   * §5.2 VISUALIZATION DATA — the owner's audit requires the card to show
   * graphs, skill projections and evidence relationships, not a list of
   * textual statistics. Both series are counts of the worker's OWN rows:
   *
   *  - `evidenceTimeline`: live `journal_entries` per calendar month over the
   *    trailing window. A month with nothing logged is a real 0.
   *  - `skillEvidence`: per catalogued skill, how many of the worker's own
   *    journal entries are linked to it (`journal_entry_skills`), with the
   *    honest evidence tier. A declared skill with no evidence keeps 0 —
   *    that gap is exactly what the card must make visible.
   *
   * Both are `[]` on any read error (honest absence), never fabricated.
   */
  evidenceTimeline: readonly EvidenceMonth[];
  skillEvidence: readonly SkillEvidenceBar[];
}

/** Trailing window of the evidence timeline, in calendar months. */
export const EVIDENCE_TIMELINE_MONTHS = 12;

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

/**
 * ONE declared-skills population (RC3): the deduped union of the worker's
 * free-text claims (`profile_skill_claims.normalized_label`) and catalogued
 * `worker_skills` (canonical `skills.slug`; `skill_id` as last resort).
 * Dedup key = lowercased, whitespace-collapsed label, so a claim that
 * mirrors a catalogued skill is counted once. 0 on any read error — never
 * inferred.
 *
 * P0 nav-performance fix: the catalogued half previously issued its own
 * `worker_skills` select asking for the legacy localized skills name
 * columns — columns that do NOT exist (the ESCO taxonomy dropped them), so
 * the query 400-ed on EVERY navigation and catalogued skills silently never
 * counted. It now consumes the request-cached core skill rows and labels by
 * canonical slug.
 */
async function declaredSkillsUnionCount(
  supabase: SupabaseClient,
  profileId: string,
  skillRows: readonly WorkerSkillRow[],
): Promise<number> {
  const norm = (s: string): string =>
    s.toLowerCase().replace(/\s+/g, " ").trim();
  const labels = new Set<string>();
  try {
    const { data: claims } = await asAny(supabase)
      .from("profile_skill_claims")
      .select("normalized_label")
      .eq("profile_id", profileId);
    for (const c of (claims ?? []) as { normalized_label: string | null }[]) {
      if (c.normalized_label) labels.add(norm(c.normalized_label));
    }
  } catch {
    /* keep whatever we have — honest degradation */
  }
  for (const r of skillRows) {
    const label = r.skills?.slug ?? r.skill_id;
    if (label) labels.add(norm(String(label)));
  }
  return labels.size;
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

/**
 * §5.2 EVIDENCE TIMELINE — the `created_at` of the worker's own LIVE journal
 * entries inside the trailing window. Returns the raw timestamps; the pure
 * deriver buckets them, so the shape is unit-testable. [] on any error.
 */
async function journalEntryTimestamps(
  supabase: SupabaseClient,
  workerId: string,
  windowStart: Date,
): Promise<string[]> {
  try {
    const { data, error } = await asAny(supabase)
      .from("journal_entries")
      .select("created_at")
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error || !Array.isArray(data)) return [];
    return (data as { created_at: string | null }[])
      .map((r) => r.created_at)
      .filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/**
 * §5.2 SKILL EVIDENCE — the worker's own `journal_entry_skills` links, resolved
 * to catalogue slugs. This is the evidence RELATIONSHIP the audit asks for:
 * which recorded work actually backs which skill. [] on any error.
 */
async function journalSkillLinkSlugs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{ slug: string | null }[]> {
  try {
    const { data, error } = await asAny(supabase)
      .from("journal_entry_skills")
      .select("skills(slug)")
      .eq("worker_id", workerId)
      .limit(2000);
    if (error || !Array.isArray(data)) return [];
    return (data as { skills: { slug: string | null } | null }[]).map((r) => ({
      slug: r.skills?.slug ?? null,
    }));
  } catch {
    return [];
  }
}

/** Request-deduped (React cache): several profile-page sections read the same
 *  card in one render pass; the queries run once per request. */
export const getWorkerPlayerCard = cache(async (): Promise<WorkerPlayerCard | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // P0 nav-performance: the profile name comes from the request-cached
  // session-profile reader (shared with the auth-shell layout and the
  // overview page — was an independent `profiles` SELECT here), and the
  // worker row + skill rows come from THE canonical request-cached core
  // readers (@/lib/data/worker-core) shared with every other per-navigation
  // consumer — this module previously issued its own `workers` select plus
  // three separate `worker_skills` queries per navigation.
  const [session, worker, skillRows, workHistory] = await Promise.all([
    getSessionProfile(),
    getWorkerCoreRow(),
    getWorkerSkillRows(),
    // W5: the engagement spine, request-cached like every other core read, so
    // the four card consumers still cost ONE computation per request.
    getOwnWorkHistory(),
  ]);
  const profile = session.profile;

  const workerId: string | null = worker?.id ?? null;

  // ONE clock read for both visualization series, so the window and the
  // buckets can never disagree inside a single render.
  const now = new Date();
  const timelineWindowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (EVIDENCE_TIMELINE_MONTHS - 1), 1),
  );

  const [
    skillsDeclared,
    journalSupportedSkills,
    candidateSkills,
    evidenceEntries,
    attention,
    verifiedSkills,
    managerConfirmations,
    professionSlug,
    latestEntry,
    documents,
    entryTimestamps,
    skillLinks,
  ] = await Promise.all([
    // RC3 skills truth: ONE declared population (claims ∪ catalogued skills).
    declaredSkillsUnionCount(supabase, user.id, workerId ? skillRows : []),
    // work_journal-tier skills (real `source` column, migration 0010) —
    // the same truth as the old `.eq("source", "work_journal")` head count,
    // now derived from the ONE cached worker_skills read instead of a
    // second per-navigation query. 0 without a worker row — never inferred.
    Promise.resolve(
      workerId
        ? skillRows.filter((r) => r.source === "work_journal").length
        : 0,
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
    // Primary profession from the ONE cached profession read (was its own
    // `is_primary = true` select — one of 4 identical ones per navigation).
    workerId ? getPrimaryProfessionSlug() : Promise.resolve(null),
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
    // §5.2 DOCUMENTS — the worker's OWN records through the documents
    // surface's own reader (metadata only, never a file). Any non-ok state
    // (disabled / no worker / needs-migration / error) yields null so the
    // card says nothing rather than showing a fabricated "0 documents".
    listMyDocuments()
      .then((res) => {
        if (res.kind !== "ok") return null;
        const now = new Date();
        // The SAME pure deriver the documents surface uses — the card and
        // that page can never disagree about a document's state.
        const statuses = res.documents.map((d) => deriveDocumentStatus(d, now));
        return {
          total: statuses.filter((st) => st === "ready" || st === "expiring").length,
          expiring: statuses.filter((st) => st === "expiring").length,
        };
      })
      .catch(() => null),
    // §5.2 visualization series — real rows only, [] without a worker row.
    workerId
      ? journalEntryTimestamps(supabase, workerId, timelineWindowStart)
      : Promise.resolve([] as string[]),
    workerId
      ? journalSkillLinkSlugs(supabase, workerId)
      : Promise.resolve([] as { slug: string | null }[]),
  ]);

  return {
    displayName: profile?.full_name ?? null,
    skillsDeclared,
    journalSupportedSkills,
    candidateSkills,
    evidenceEntries,
    attentionInstructions: attention,
    workCardConfirmed: Boolean(worker?.work_card_confirmed_at),
    verifiedSkills,
    managerConfirmations,
    availabilityStatus: worker?.availability_status ?? null,
    availableFrom: worker?.available_from ?? null,
    professionSlug: professionSlug ?? null,
    latestEvidenceAt: latestEntry?.created_at ?? null,
    workHistory,
    locationCountry: worker?.current_location_country ?? null,
    documents,
    // §5.2 — geometry comes from the pure derivers, so what the chart draws is
    // exactly what the unit tests assert.
    evidenceTimeline: deriveEvidenceTimeline(
      entryTimestamps,
      now,
      EVIDENCE_TIMELINE_MONTHS,
    ),
    skillEvidence: deriveSkillEvidence(
      skillLinks,
      (workerId ? skillRows : []).map((r) => ({
        slug: r.skills?.slug ?? r.skill_id,
        verified: r.verified,
        source: r.source,
      })),
    ),
  };
});
