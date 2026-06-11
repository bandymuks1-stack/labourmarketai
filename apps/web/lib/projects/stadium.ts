import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  getProjectOperations,
  type ProjectOperations,
} from "@/lib/projects/operations";

/**
 * Stadium read service (TASK 07 slice 3 — the live project visualization).
 *
 * Composes ONLY already-RLS'd reads on the existing canonical model:
 *   - getProjectOperations() — the manager-gated operations view (assigned
 *     workers, confirmed skills, open review items, F5 checklist roll-ups)
 *   - worker_professions + professions — each fielded worker's PRIMARY
 *     profession = their position on the pitch (null = honestly unknown)
 *   - journal_entries — TODAY's pulse: entries the manager's session may
 *     read, written today by the assigned workers. A count of real rows
 *     under RLS; degrades to 0 on any error, never fabricated.
 *
 * No migration, no new grant, no fake liveliness (DESIGN_SOUL §1; handoff
 * T07.3: only real data or honest empty states).
 */

export interface StadiumWorkerPosition {
  readonly workerId: string;
  /** Primary profession slug, or null when the worker has not set one. */
  readonly professionSlug: string | null;
}

export interface ProjectStadium {
  readonly ops: ProjectOperations;
  readonly positions: ReadonlyMap<string, string | null>;
  /** Journal entries written TODAY by assigned workers (RLS-readable). */
  readonly entriesToday: number;
}

function dayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getProjectStadium(
  projectId: string,
): Promise<ProjectStadium | null> {
  const ops = await getProjectOperations(projectId);
  if (!ops) return null;

  const supabase = await createClient();
  const workerIds = ops.workers.map((w) => w.workerId);
  const positions = new Map<string, string | null>(
    workerIds.map((id) => [id, null]),
  );
  let entriesToday = 0;

  if (workerIds.length > 0) {
    try {
      const [profRes, todayRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("worker_professions")
          .select("worker_id, professions(slug)")
          .in("worker_id", workerIds)
          .eq("is_primary", true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("journal_entries")
          .select("*", { count: "exact", head: true })
          .in("worker_id", workerIds)
          .is("deleted_at", null)
          .gte("created_at", dayStartIso()),
      ]);
      for (const row of (profRes.data ?? []) as {
        worker_id: string;
        professions: { slug: string | null } | null;
      }[]) {
        positions.set(row.worker_id, row.professions?.slug ?? null);
      }
      if (typeof todayRes.count === "number") entriesToday = todayRes.count;
    } catch {
      // keep nulls/0 — honest degradation
    }
  }

  return { ops, positions, entriesToday };
}
