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
  /** The project the instruction is scoped to (20260609140000); null = roster-level. */
  projectId: string | null;
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
      "id, conversation_id, project_id, body, original_language, translated_text, translation_status, created_at, author_id, author:profiles!conversation_messages_author_id_fkey(full_name)",
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
    projectId: (r.project_id as string | null) ?? null,
    authorName:
      (r.author as { full_name: string | null } | null)?.full_name ?? null,
  }));
  return { kind: "ok", instructions };
}

/**
 * Instructions that need the user's attention NOW — instructions addressed to
 * them that they have not opened yet (created after their last_read_at for that
 * conversation). Real data only: an empty result means there is genuinely
 * nothing to attend to (the caller shows an honest empty state, never a fake
 * count or fake urgency). Drives the "Reikia jūsų dėmesio" block inside
 * "Kas dabar svarbu / Mano pranešimai".
 */
export async function listAttentionInstructions(): Promise<WorkerInstruction[]> {
  const read = await listWorkerInstructions();
  if (read.kind !== "ok" || read.instructions.length === 0) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const parts = await asAny(supabase)
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("profile_id", user.id);
  if (parts.error) return [];

  const lastRead = new Map<string, string | null>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (parts.data ?? []) as any[])
    lastRead.set(p.conversation_id, p.last_read_at ?? null);

  return read.instructions.filter((ins) => {
    const lr = lastRead.get(ins.conversationId);
    if (lr == null) return true; // never opened → needs attention
    return Date.parse(ins.createdAt) > Date.parse(lr);
  });
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

  // LEFT join on `profiles` — same reason as lib/projects/operations.ts: an
  // employer cannot read another person's profile row, so `!inner` emptied the
  // whole picker. The join only supplies an optional display name that already
  // falls back to `display_name` and then to an id prefix.
  const select =
    "worker:workers!inner(profile_id, display_name, profiles(full_name))";

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

/**
 * The people's ANSWERS to the manager's instructions on ONE project (owner
 * contract §11/§12 — the readiness answer shows what the person said, so the
 * manager can mark the row received without leaving the chat). Three
 * bounded reads under the caller's RLS (`conversation_messages_select` =
 * participant only; the caller reads their own instructions and the direct
 * threads they are in): the caller's instructions on this project (index
 * `project_id`), the threads' other participant, the newest non-instruction
 * message by that person AFTER the latest instruction. Text is the first
 * line, truncated; never the whole thread. Empty on any failure.
 */
export interface InstructionReply {
  readonly workerProfileId: string;
  readonly text: string;
  readonly at: string;
  readonly instructionAt: string;
}

export const PROJECT_INSTRUCTION_REPLIES_LIMIT = 40;

export async function listProjectInstructionReplies(projectId: string): Promise<Map<string, InstructionReply>> {
  const out = new Map<string, InstructionReply>();
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return out;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return out;
  const ins = await asAny(supabase)
    .from("conversation_messages")
    .select("conversation_id, created_at")
    .eq("project_id", projectId)
    .eq("is_instruction", true)
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(PROJECT_INSTRUCTION_REPLIES_LIMIT);
  if (ins.error || !ins.data || ins.data.length === 0) return out;
  const latestInstruction = new Map<string, string>();
  for (const r of ins.data as { conversation_id: string; created_at: string }[]) {
    if (!latestInstruction.has(r.conversation_id)) latestInstruction.set(r.conversation_id, r.created_at);
  }
  const convIds = [...latestInstruction.keys()];
  const [parts, replies] = await Promise.all([
    asAny(supabase).from("conversation_participants").select("conversation_id, profile_id").in("conversation_id", convIds),
    asAny(supabase)
      .from("conversation_messages")
      .select("conversation_id, author_id, body, created_at")
      .in("conversation_id", convIds)
      .eq("is_instruction", false)
      .neq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PROJECT_INSTRUCTION_REPLIES_LIMIT),
  ]);
  if (parts.error || replies.error) return out;
  const personByConv = new Map<string, string>();
  for (const p of (parts.data ?? []) as { conversation_id: string; profile_id: string }[]) {
    if (p.profile_id !== user.id) personByConv.set(p.conversation_id, p.profile_id);
  }
  for (const m of (replies.data ?? []) as { conversation_id: string; author_id: string; body: string | null; created_at: string }[]) {
    const person = personByConv.get(m.conversation_id);
    const since = latestInstruction.get(m.conversation_id);
    if (!person || !since || m.author_id !== person || out.has(person)) continue;
    if (Date.parse(m.created_at) <= Date.parse(since)) continue;
    const text = (m.body ?? "").split("\n")[0].trim().slice(0, 120);
    out.set(person, { workerProfileId: person, text, at: m.created_at, instructionAt: since });
  }
  return out;
}
