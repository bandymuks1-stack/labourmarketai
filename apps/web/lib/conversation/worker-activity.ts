import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Worker activity + completeness read model (Phase B journal / continuity).
 *
 * A human-readable activity view is derived from the worker's OWN canonical
 * rows (RLS-appropriate: `audit_logs` is admin-only, so the user-facing journal
 * reads the same events from the tables the worker owns). No parallel store, no
 * conversation transcript, no PII beyond the worker's own data. Events are
 * deterministically deduped (one row per kind+day) and ordered newest-first.
 */

export type ActivityEvent = {
  /** i18n key under conversation.journal.events.* */
  key: string;
  /** ISO timestamp (server-stored). */
  at: string;
  /** Optional bounded count for pluralized copy. */
  count?: number;
};

export type WorkerActivity = {
  completenessPct: number; // 0..100
  stepsDone: number;
  stepsTotal: number;
  events: ActivityEvent[];
};

const EMPTY: WorkerActivity = { completenessPct: 0, stepsDone: 0, stepsTotal: 5, events: [] };

/** Coarse day bucket for dedupe (YYYY-MM-DD from an ISO string). */
function day(iso: string | null | undefined): string {
  return (iso ?? "").slice(0, 10);
}

export async function getWorkerActivity(userId: string): Promise<WorkerActivity> {
  const supabase = await createClient();
  try {
    const { data: worker } = await supabase
      .from("workers")
      .select("id, availability_status")
      .eq("profile_id", userId)
      .maybeSingle();
    const workerId = worker?.id as string | undefined;

    const { data: profile } = await supabase
      .from("profiles")
      .select("profile_text")
      .eq("id", userId)
      .maybeSingle();

    const [skills, languages, education, achievements, engagements] = await Promise.all([
      supabase.from("profile_skill_claims").select("id, created_at").eq("profile_id", userId).order("created_at", { ascending: false }).limit(20),
      workerId
        ? supabase.from("worker_languages").select("lang, created_at").eq("worker_id", workerId).order("created_at", { ascending: false }).limit(10)
        : Promise.resolve({ data: [] as { lang: string; created_at: string }[] }),
      supabase.from("worker_education").select("id, created_at").eq("profile_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("worker_achievements").select("id, created_at").eq("profile_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("engagement_contexts").select("id, created_at, title").eq("profile_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);

    const skillRows = (skills.data ?? []) as { id: string; created_at: string }[];
    const langRows = (languages.data ?? []) as { lang: string; created_at: string }[];
    const eduRows = (education.data ?? []) as { id: string; created_at: string }[];
    const achRows = (achievements.data ?? []) as { id: string; created_at: string }[];
    const engRows = (engagements.data ?? []) as { id: string; created_at: string; title: string | null }[];

    // Completeness — 5 honest checkpoints from real presence.
    const checks = [
      Boolean((profile?.profile_text as string | null)?.trim()),
      skillRows.length > 0,
      langRows.length > 0,
      Boolean(worker?.availability_status),
      engRows.length > 0,
    ];
    const stepsDone = checks.filter(Boolean).length;
    const completenessPct = Math.round((stepsDone / checks.length) * 100);

    // Activity — one event per kind+day, newest-first, capped.
    const raw: ActivityEvent[] = [];
    if (langRows[0]) raw.push({ key: "languageAdded", at: langRows[0].created_at, count: langRows.length });
    if (eduRows[0]) raw.push({ key: "educationAdded", at: eduRows[0].created_at, count: eduRows.length });
    if (achRows[0]) raw.push({ key: "achievementAdded", at: achRows[0].created_at, count: achRows.length });
    if (engRows[0]) raw.push({ key: "workHistoryAdded", at: engRows[0].created_at, count: engRows.length });
    if (skillRows[0]) raw.push({ key: "skillsConfirmed", at: skillRows[0].created_at, count: skillRows.length });

    const seen = new Set<string>();
    const events = raw
      .filter((e) => {
        const k = `${e.key}:${day(e.at)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 6);

    return { completenessPct, stepsDone, stepsTotal: checks.length, events };
  } catch {
    return EMPTY;
  }
}
