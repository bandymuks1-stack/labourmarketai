import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Body for POST /api/workers/:id/skills — replaces the worker's full set. */
export const saveSkillsSchema = z.object({
  skillIds: z.array(z.string().uuid()).max(100),
});

export const uuidSchema = z.string().uuid();

/**
 * Confirms `workerId` is a worker row owned by `userId` (workers.profile_id =
 * auth user). M1 = owner-only. M2: a manager with explicit permission on the
 * worker would also pass here — add that branch then. RLS (`owns_worker`)
 * double-guards every query regardless.
 */
export async function ownsWorker(
  supabase: ServerSupabase,
  workerId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("workers")
    .select("id")
    .eq("id", workerId)
    .eq("profile_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Skill ids linked to a profession (the allowlist for that worker). */
export async function professionSkillIds(
  supabase: ServerSupabase,
  professionId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("profession_skills")
    .select("skill_id")
    .eq("profession_id", professionId);
  return new Set((data ?? []).map((r) => r.skill_id));
}

/** The worker's primary profession id, or null if none set yet. */
export async function primaryProfessionId(
  supabase: ServerSupabase,
  workerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("worker_professions")
    .select("profession_id")
    .eq("worker_id", workerId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.profession_id ?? null;
}
