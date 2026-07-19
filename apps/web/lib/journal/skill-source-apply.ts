import "server-only";

import {
  reconcileWorkerSkillSources,
  type WorkerSkillRow,
} from "@/lib/journal/skill-source";

/**
 * Apply the worker-side evidence-tier reconcile (Journal Evidence Auto-Recompute
 * v1, Slice A). Runs in the WORKER's session (owns_worker RLS) — NO SECURITY
 * DEFINER, no privilege change. It writes ONLY `worker_skills.source` between
 * self_declared and work_journal, fenced to verified=false rows: it NEVER sets
 * verified and NEVER writes the confirmed tier — promotion to the confirmed
 * tier is the separate owner-gated SECURITY DEFINER path. Best-effort: a
 * failure here never breaks the caller (links remain the source of truth).
 */
export async function applyWorkerSkillSourceReconcile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workerId: string,
): Promise<boolean> {
  // Returns TRUE only when the reconcile fully applied (reads + every
  // update succeeded). Callers that treat it as best-effort may ignore
  // the value; the journal pipeline treats `false` as a REQUIRED-phase
  // failure so it never stamps a pipeline version over a half-applied
  // evidence tier (P1 integrity fix, post-#837 review).
  try {
    const [skillsRes, linksRes] = await Promise.all([
      supabase
        .from("worker_skills")
        .select("skill_id, source, verified")
        .eq("worker_id", workerId),
      supabase
        .from("journal_entry_skills")
        .select("skill_id")
        .eq("worker_id", workerId),
    ]);
    if (skillsRes.error || linksRes.error) return false;
    const skillRows = skillsRes.data;
    const linkRows = linksRes.data;
    const rows = ((skillRows ?? []) as WorkerSkillRow[]).map((r) => ({
      skill_id: r.skill_id,
      source: r.source,
      verified: Boolean(r.verified),
    }));
    const supported = new Set(
      ((linkRows ?? []) as { skill_id: string }[]).map((r) => r.skill_id),
    );
    const updates = reconcileWorkerSkillSources(rows, supported);
    const bySource = new Map<string, string[]>();
    for (const u of updates) {
      const list = bySource.get(u.source) ?? [];
      list.push(u.skill_id);
      bySource.set(u.source, list);
    }
    for (const [source, ids] of bySource) {
      if (ids.length === 0) continue;
      const upd = await supabase
        .from("worker_skills")
        .update({ source, updated_at: new Date().toISOString() })
        .eq("worker_id", workerId)
        .eq("verified", false) // defense-in-depth: never alter a confirmed row
        .in("skill_id", ids);
      if (upd.error) return false;
    }
    return true;
  } catch {
    // best-effort for legacy callers — journal links remain the source of
    // truth; the pipeline reads the boolean and keeps the entry stale.
    return false;
  }
}
