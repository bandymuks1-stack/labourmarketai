import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Work-instructions read service (slice work-instructions-v1).
 *
 * Instructions are `conversation_messages` flagged `is_instruction`, so every
 * read goes through the EXISTING participant-scoped RLS (0021): a worker sees an
 * instruction ONLY in a conversation they participate in; a manager sees only
 * their own threads. No cross-thread / cross-company leakage; no service_role.
 *
 * Honest by construction: there is no translation service yet, so v1 returns the
 * ORIGINAL text + an honest `translationStatus` ('unavailable'); the original is
 * never replaced.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type InstructionRead =
  | { kind: "ok"; instructions: WorkerInstruction[] }
  | { kind: "needs-migration" };

export interface WorkerInstruction {
  id: string;
  conversationId: string;
  /** The ORIGINAL instruction text — always the source of truth. */
  originalText: string;
  originalLanguage: string | null;
  /** Derived translation; null in v1 (no translation service yet). */
  translatedText: string | null;
  translationStatus: "unavailable" | "pending" | "available";
  createdAt: string;
  authorName: string | null;
}

function migMissing(code?: string): boolean {
  return (
    code === RPC_NOT_FOUND ||
    code === UNDEFINED_COLUMN ||
    code === RELATION_NOT_FOUND
  );
}

/** Instructions addressed to the current worker (RLS-scoped to their threads). */
export async function listWorkerInstructions(): Promise<InstructionRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", instructions: [] };

  const res = await asAny(supabase)
    .from("conversation_messages")
    .select(
      "id, conversation_id, body, original_language, translated_text, translation_status, created_at, author_id, author:profiles!conversation_messages_author_id_fkey(full_name)",
    )
    .eq("is_instruction", true)
    .neq("author_id", user.id) // instructions TO the worker, not ones they sent
    .order("created_at", { ascending: false })
    .limit(100);

  if (res.error) {
    if (migMissing(res.error.code)) return { kind: "needs-migration" };
    return { kind: "ok", instructions: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (res.data ?? []) as any[];
  const instructions: WorkerInstruction[] = rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    originalText: r.body,
    originalLanguage: r.original_language ?? null,
    translatedText: r.translated_text ?? null,
    translationStatus: (r.translation_status ?? "unavailable") as
      | "unavailable"
      | "pending"
      | "available",
    createdAt: r.created_at,
    authorName:
      (r.author as { full_name: string | null } | null)?.full_name ?? null,
  }));
  return { kind: "ok", instructions };
}

export interface ManagedWorker {
  profileId: string;
  name: string;
}

/** Workers the caller manages (active roster link to a company/agency they own).
 *  Used to populate the manager's "Nurodymas darbuotojui" picker. RLS-scoped. */
export async function listManagedWorkers(): Promise<ManagedWorker[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const select =
    "worker:workers!inner(profile_id, display_name, profiles!inner(full_name))";

  const [cw, aw] = await Promise.all([
    asAny(supabase)
      .from("company_workers")
      .select(select)
      .eq("status", "active"),
    asAny(supabase).from("agency_workers").select(select).eq("status", "active"),
  ]);

  const out = new Map<string, ManagedWorker>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collect = (rows: any[] | null | undefined) => {
    for (const r of rows ?? []) {
      const w = r.worker as {
        profile_id: string | null;
        display_name: string | null;
        profiles: { full_name: string | null } | null;
      } | null;
      if (!w?.profile_id) continue;
      out.set(w.profile_id, {
        profileId: w.profile_id,
        name: w.profiles?.full_name ?? w.display_name ?? w.profile_id.slice(0, 8),
      });
    }
  };
  if (!cw.error) collect(cw.data);
  if (!aw.error) collect(aw.data);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
