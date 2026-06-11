import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  deriveReviewOrigin,
  deriveReviewResult,
  type ConfirmationRow,
} from "@/lib/journal/review-status";

/**
 * Worker "šiandienos ekranas" read service (TASK 07 slice
 * design-soul-scouting-ui-v1). DESIGN_SOUL §1: the UI is the skin of REAL
 * internal data — every number here is a direct, RLS-scoped read of the
 * worker's own journal chain. Nothing weighted, nothing invented; on any read
 * error a dimension degrades to 0 / null (never a fabricated value).
 *
 * No money fields: pay data is not in the journal chain, so the week summary
 * never shows euros (Realumo principas, doctrine §18).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface TodayScreenData {
  /** Journal entries the worker wrote TODAY (server-day boundary). */
  readonly entriesToday: number;
  /** Own entries with no review decision yet (derived `submitted`). */
  readonly pendingReview: number;
  /** Entries the worker wrote this calendar week (Mon 00:00). */
  readonly weekEntries: number;
  /** DISTINCT days of this week that have at least one entry (real dates). */
  readonly weekDaysWithEntries: number;
  /** Days elapsed this week incl. today (1 = Monday). */
  readonly weekDaysElapsed: number;
  /** Entries whose latest-wins decision is `approved` AND was made this week. */
  readonly weekConfirmedEntries: number;
  /**
   * Sum of EXPLICIT recorded durations (fragment_time metrics, hours/minutes)
   * on this week's approved entries — null when no explicit duration exists.
   * Never a fake total (mirrors review-report's "only when explicit" rule).
   */
  readonly weekConfirmedHours: number | null;
  /**
   * One honest growth suggestion: a core skill of the worker's primary
   * profession that the worker does not hold in worker_skills yet. Null when
   * the data cannot support an honest suggestion (premium empty state).
   */
  readonly skillSuggestion: { readonly slug: string } | null;
}

type EntryRow = {
  id: string;
  created_at: string;
  deleted_at: string | null;
  superseded_by: string | null;
};

type ConfRow = ConfirmationRow & { entry_id: string };

/** Monday 00:00:00 of the current week (server clock). */
function weekStartMs(now: Date): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/** Days elapsed this week incl. today (Mon=1 … Sun=7). */
function weekDaysElapsedNow(): number {
  const day = new Date().getDay();
  return ((day + 6) % 7) + 1;
}

/** Today 00:00:00 (server clock). */
function dayStartMs(now: Date): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function getTodayScreen(
  workerId: string | null,
): Promise<TodayScreenData> {
  const empty: TodayScreenData = {
    entriesToday: 0,
    pendingReview: 0,
    weekEntries: 0,
    weekDaysWithEntries: 0,
    weekDaysElapsed: weekDaysElapsedNow(),
    weekConfirmedEntries: 0,
    weekConfirmedHours: null,
    skillSuggestion: null,
  };
  if (!workerId) return empty;

  const supabase = await createClient();
  const now = new Date();
  const dayStart = dayStartMs(now);
  const weekStart = weekStartMs(now);

  try {
    // The worker's recent live entries (the active record; corrections that
    // were superseded and soft-hidden rows are not part of "today").
    const { data: entryRows } = await asAny(supabase)
      .from("journal_entries")
      .select("id, created_at, deleted_at, superseded_by")
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .is("superseded_by", null)
      .order("created_at", { ascending: false })
      .limit(400);
    const entries: EntryRow[] = Array.isArray(entryRows) ? entryRows : [];

    const entriesToday = entries.filter(
      (e) => Date.parse(e.created_at) >= dayStart,
    ).length;
    const weekEntries = entries.filter(
      (e) => Date.parse(e.created_at) >= weekStart,
    );
    const weekEntryIds = weekEntries.map((e) => e.id);
    const weekDaysWithEntries = new Set(
      weekEntries.map((e) => new Date(e.created_at).toDateString()),
    ).size;

    // Review evidence for ALL fetched entries (append-only rows, latest wins).
    const byEntry = new Map<string, ConfRow[]>();
    if (entries.length > 0) {
      const { data: confRows } = await asAny(supabase)
        .from("journal_entry_confirmations")
        .select("entry_id, confirmation_scope, created_at, confirmer_role")
        .in(
          "entry_id",
          entries.map((e) => e.id),
        );
      for (const row of (confRows ?? []) as ConfRow[]) {
        const list = byEntry.get(row.entry_id) ?? [];
        list.push(row);
        byEntry.set(row.entry_id, list);
      }
    }

    let pendingReview = 0;
    const approvedThisWeek: string[] = [];
    for (const e of entries) {
      const confs = byEntry.get(e.id);
      if (deriveReviewResult(confs) === "submitted") {
        pendingReview += 1;
        continue;
      }
      const origin = deriveReviewOrigin(confs);
      if (
        origin?.result === "approved" &&
        origin.at &&
        Date.parse(origin.at) >= weekStart
      ) {
        approvedThisWeek.push(e.id);
      }
    }

    // Explicit recorded time on this week's approved entries. Only
    // fragment_time rows with a real numeric value in hours/minutes count;
    // when none exist the metric is hidden, never shown as a fake 0.
    let weekConfirmedHours: number | null = null;
    if (approvedThisWeek.length > 0) {
      const { data: metricRows } = await asAny(supabase)
        .from("journal_entry_metrics")
        .select("entry_id, metric_slug, unit_slug, value_numeric")
        .in("entry_id", approvedThisWeek)
        .eq("metric_slug", "fragment_time");
      let sum = 0;
      let found = false;
      for (const m of (metricRows ?? []) as {
        unit_slug: string | null;
        value_numeric: number | null;
      }[]) {
        if (typeof m.value_numeric !== "number") continue;
        if (m.unit_slug === "hours") {
          sum += m.value_numeric;
          found = true;
        } else if (m.unit_slug === "minutes") {
          sum += m.value_numeric / 60;
          found = true;
        }
      }
      if (found) weekConfirmedHours = Math.round(sum * 10) / 10;
    }

    return {
      entriesToday,
      pendingReview,
      weekEntries: weekEntryIds.length,
      weekDaysWithEntries,
      weekDaysElapsed: weekDaysElapsedNow(),
      weekConfirmedEntries: approvedThisWeek.length,
      weekConfirmedHours,
      skillSuggestion: await getSkillSuggestion(supabase, workerId),
    };
  } catch {
    return empty;
  }
}

/**
 * One honest "kelias į daugiau" suggestion from the platform taxonomy: the
 * first core profession skill (display_order) the worker has no worker_skills
 * row for. Real graph data only — no salary promises, no fake demand claims.
 */
async function getSkillSuggestion(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{ slug: string } | null> {
  try {
    const { data: wp } = await asAny(supabase)
      .from("worker_professions")
      .select("profession_id")
      .eq("worker_id", workerId)
      .eq("is_primary", true)
      .maybeSingle();
    const professionId: string | null = wp?.profession_id ?? null;
    if (!professionId) return null;

    const [{ data: psRows }, { data: haveRows }] = await Promise.all([
      asAny(supabase)
        .from("profession_skills")
        .select("skill_id, is_core, display_order, skills(slug)")
        .eq("profession_id", professionId)
        .order("is_core", { ascending: false })
        .order("display_order", { ascending: true })
        .limit(60),
      asAny(supabase)
        .from("worker_skills")
        .select("skill_id")
        .eq("worker_id", workerId),
    ]);

    const have = new Set(
      ((haveRows ?? []) as { skill_id: string | null }[])
        .map((r) => r.skill_id)
        .filter(Boolean),
    );
    for (const row of (psRows ?? []) as {
      skill_id: string;
      skills: { slug: string | null } | null;
    }[]) {
      if (have.has(row.skill_id)) continue;
      const slug = row.skills?.slug;
      if (slug) return { slug };
    }
    return null;
  } catch {
    return null;
  }
}
