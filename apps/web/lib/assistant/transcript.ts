"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The assistant_* tables are NOT in the generated DB types until the owner
 * applies the RED migration, so the typed client rejects them at compile time.
 * This minimal structural view keeps the calls type-checked at the shape we
 * actually use while staying honest about the runtime contract: when the
 * relations are absent PostgREST answers with an error and we degrade.
 */
type Row = Record<string, unknown>;
type LooseError = { code?: string; message?: string } | null;
type OneResult = Promise<{ data: Row | null; error: LooseError }>;
type LooseFilter = PromiseLike<{ data: Row[] | null; error: LooseError }> & {
  eq: (col: string, v: unknown) => LooseFilter;
  is: (col: string, v: unknown) => LooseFilter;
  order: (col: string, opts: Record<string, unknown>) => LooseFilter;
  limit: (n: number) => LooseFilter;
  maybeSingle: () => OneResult;
};
type LooseDb = {
  from: (table: string) => {
    select: (cols: string) => LooseFilter;
    insert: (values: Row) => { select: (cols: string) => { single: () => OneResult } };
  };
  rpc: (fn: string, args: Row) => OneResult;
};

/**
 * Assistant transcript persistence — thin server adapter over the owner-gated
 * `assistant_conversations` / `assistant_messages` schema
 * (docs/proposals/assistant-transcript-v1, shipped as a RED draft migration).
 *
 * HONEST DEGRADATION: until the owner applies that migration the tables and
 * the `append_assistant_message` RPC do not exist in production. Every
 * function here then reports `available: false` and the chat stays exactly
 * what it is today — session-only — without claiming anything was saved.
 * Nothing is buffered, faked or retried into a parallel store (doctrine §18).
 *
 * When the migration IS applied, appends go through the RPC only (the tables
 * refuse direct INSERT by RLS; the RPC computes the server-side hash chain).
 */

export type TranscriptMessage = {
  seq: number;
  role: "user" | "assistant";
  kind: string;
  text: string;
};

export type TranscriptLoad =
  | { available: false }
  | { available: true; conversationId: string | null; messages: TranscriptMessage[] };

export type TranscriptAppend =
  | { available: false }
  | { available: true; conversationId: string; seq: number };

/** Load the caller's most recent assistant conversation tail (oldest-first). */
export async function loadAssistantThread(limit = 40): Promise<TranscriptLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { available: false };
  const db = supabase as unknown as LooseDb;

  const conv = await db
    .from("assistant_conversations")
    .select("id")
    .eq("owner_id", user.id)
    .is("hidden_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Any error — including 42P01/PGRST205 while the owner-gated migration is
  // unapplied — degrades to "not available": session-only chat, no claims.
  if (conv.error) return { available: false };
  const convId = (conv.data?.id as string | undefined) ?? null;
  if (!convId) return { available: true, conversationId: null, messages: [] };

  const msgs = await db
    .from("assistant_messages")
    .select("seq, role, kind, original_text")
    .eq("conversation_id", convId)
    .order("seq", { ascending: false })
    .limit(limit);
  if (msgs.error) return { available: false };

  const messages = ((msgs.data ?? []) as unknown as {
    seq: number;
    role: string;
    kind: string;
    original_text: string;
  }[])
    .reverse()
    .map((m) => ({
      seq: m.seq,
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      kind: m.kind,
      text: m.original_text,
    }));
  return { available: true, conversationId: convId, messages };
}

/** Append one turn. Creates the conversation on first append. Returns the
 *  server-assigned seq — the audited event id for this turn. */
export async function appendAssistantTurn(input: {
  conversationId: string | null;
  role: "user" | "assistant";
  kind?: string;
  text: string;
  language: string;
  actionId?: string | null;
  actionStatus?: string | null;
}): Promise<TranscriptAppend> {
  const text = input.text.trim();
  if (!text) return { available: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { available: false };
  const db = supabase as unknown as LooseDb;

  let conversationId = input.conversationId;
  if (!conversationId) {
    const created = await db
      .from("assistant_conversations")
      .insert({ owner_id: user.id })
      .select("id")
      .single();
    if (created.error || !created.data?.id) {
      return { available: false };
    }
    conversationId = created.data.id as string;
  }

  const lang = /^[a-z]{2}$/.test(input.language) ? input.language : "en";
  const appended = await db.rpc("append_assistant_message", {
    p_conversation_id: conversationId,
    p_role: input.role,
    p_kind: input.kind ?? "text",
    p_original_text: text.slice(0, 8000),
    p_original_language: lang,
    p_action_id: input.actionId ?? null,
    p_action_status: input.actionStatus ?? null,
  });
  if (appended.error) return { available: false };

  const row = appended.data as { seq?: number } | null;
  return { available: true, conversationId, seq: row?.seq ?? 0 };
}
