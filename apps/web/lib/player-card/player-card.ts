import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { listAttentionInstructions } from "@/lib/instructions/instructions";

/**
 * Worker player-card (slice worker-player-card-v1) — a calm, worker-first summary
 * of the worker's OWN real dimensions. Read-only, RLS-scoped, and HONEST: every
 * number is a real count of the worker's own rows; on any read error a dimension
 * falls back to 0 / false (never a fabricated value). No fake skills, evidence,
 * confirmations, or verification.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface WorkerPlayerCard {
  displayName: string | null;
  /** Self-declared skill claims (NOT verified). */
  skillsDeclared: number;
  /** Work-journal entries the worker has recorded (their own evidence). */
  evidenceEntries: number;
  /** New unread work/safety instructions needing attention. */
  attentionInstructions: number;
  /** Whether the worker has confirmed their work card. */
  workCardConfirmed: boolean;
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

export async function getWorkerPlayerCard(): Promise<WorkerPlayerCard | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Profile name + the worker row (id for journal scope, work-card confirmation).
  const [{ data: profile }, { data: worker }] = await Promise.all([
    asAny(supabase).from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    asAny(supabase)
      .from("workers")
      .select("id, work_card_confirmed_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  const workerId: string | null = worker?.id ?? null;

  const [skillsDeclared, evidenceEntries, attention] = await Promise.all([
    safeCount(
      asAny(supabase)
        .from("profile_skill_claims")
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
  ]);

  return {
    displayName: profile?.full_name ?? null,
    skillsDeclared,
    evidenceEntries,
    attentionInstructions: attention,
    workCardConfirmed: Boolean(worker?.work_card_confirmed_at),
  };
}
