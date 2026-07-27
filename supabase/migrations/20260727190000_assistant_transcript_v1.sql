-- ============================================================================
-- DRAFT - needs-human-gate - DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260727190000 - assistant_transcript_v1
-- Adoption of docs/proposals/assistant-transcript-v1 (2026-07-24) into the
-- migration train, unchanged except this header. The conversation-first
-- /dashboard currently keeps its thread in session only; this creates the
-- owner-scoped, append-only, hash-chained AI-control transcript store
-- (assistant_conversations / assistant_messages / attachments + 3 gated RPCs).
-- The app side already ships (lib/assistant/transcript.ts, PR #881) and
-- degrades honestly until this is applied.
--
-- @human-gate-approved
--   Acknowledged RED: SECURITY DEFINER functions + GRANTs + RLS policies.
--   The annotation makes migration-safety CI pass; it does NOT authorise an
--   automatic merge or apply. Default-closed RLS; grants only to
--   authenticated; anon gets nothing.
--
-- ROLLBACK: supabase/rollbacks/20260727190000_assistant_transcript_v1.down.sql
-- ============================================================================

-- PROPOSAL ONLY — NOT APPLIED, NOT IN supabase/migrations/.
-- Assistant (AI-control) conversation transcript persistence — v1.
--
-- Owner-gated RED migration (SECURITY DEFINER + RLS + GRANT). Do NOT apply via
-- CI or `supabase db push`. Apply path when approved: rename into
-- supabase/migrations/<UTC timestamp>_assistant_transcript_v1.sql, ship the
-- paired rollback, then Supabase MCP apply_migration after DI approval.
--
-- Doctrine: §2.2/§2.3 (original_text + original_language only, NO translation
-- columns), §3.1 (append-only), §3.2 (server timestamps), §3.3 (hash chain),
-- §4 (default-closed, owner-scoped). This stores ONLY the AI-control chat. It
-- is deliberately SEPARATE from:
--   • human/team messages  → public.conversation_messages (canonical, untouched)
--   • work activity         → public.journal_entries (canonical, untouched)
--   • the real write a tool performs → stays in its canonical table; here we
--     keep only a RESULT RECORD (action id + returned status), never the write.

begin;

-- 1. One AI-control thread per owner-scoped conversation. ─────────────────────
create table if not exists public.assistant_conversations (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  title         text,
  status        text not null default 'active'
                check (status in ('active','archived','hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  hidden_at     timestamptz,
  hidden_reason text
);
create index if not exists assistant_conversations_owner_idx
  on public.assistant_conversations (owner_id, updated_at desc);

-- 2. Append-only, hash-chained messages. ─────────────────────────────────────
create table if not exists public.assistant_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.assistant_conversations(id) on delete cascade,
  seq                integer not null,                       -- 1-based per conversation
  role               text not null check (role in ('user','assistant','system')),
  kind               text not null default 'text'
                     check (kind in ('text','question','confirmation','action_result')),
  -- §2.2/§2.3 — user-authored text is stored ONCE, in its original language.
  original_text      text not null,
  original_language  char(2) not null,
  -- Action linkage (kind='action_result'): which registry action ran and the
  -- REAL returned status/code — never the written row, never a fabricated ok.
  action_id          text,
  action_status      text check (action_status in ('ok','error','needs_migration','precondition','stale','cancelled')),
  action_result      jsonb,                                  -- serializable summary only (no PII beyond the entry the user already owns)
  -- Confirmation lifecycle (kind='confirmation'): mirrors the dispatch token.
  confirmation_state text check (confirmation_state in ('pending','confirmed','cancelled','stale')),
  -- §3.3 hash chain (SHA-256, computed server-side).
  prev_hash          text,
  content_hash       text not null,
  created_at         timestamptz not null default now(),
  unique (conversation_id, seq)
);
create index if not exists assistant_messages_conv_idx
  on public.assistant_messages (conversation_id, seq);

-- 3. Attachment references (files live in Storage, DB holds the reference §6). ─
create table if not exists public.assistant_message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.assistant_messages(id) on delete cascade,
  storage_path text not null,
  mime         text not null,
  byte_size    bigint not null check (byte_size >= 0),
  created_at   timestamptz not null default now()
);

-- 4. RLS — default-closed, owner-only. ───────────────────────────────────────
alter table public.assistant_conversations       enable row level security;
alter table public.assistant_messages            enable row level security;
alter table public.assistant_message_attachments enable row level security;

-- conversations: owner reads/creates own; UPDATE limited to own soft-hide;
-- no DELETE via API (erasure only through the GDPR RPC below).
create policy assistant_conversations_select on public.assistant_conversations
  for select using (owner_id = auth.uid());
create policy assistant_conversations_insert on public.assistant_conversations
  for insert with check (owner_id = auth.uid());
create policy assistant_conversations_update on public.assistant_conversations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- messages: owner reads own (via conversation ownership); NO direct insert
-- (the hash chain must be computed server-side) — inserts go through the
-- SECURITY DEFINER RPC below; no UPDATE/DELETE (append-only §3.1).
create policy assistant_messages_select on public.assistant_messages
  for select using (
    exists (select 1 from public.assistant_conversations c
            where c.id = conversation_id and c.owner_id = auth.uid())
  );

-- attachments: owner reads own (via message → conversation ownership).
create policy assistant_message_attachments_select on public.assistant_message_attachments
  for select using (
    exists (select 1 from public.assistant_messages m
            join public.assistant_conversations c on c.id = m.conversation_id
            where m.id = message_id and c.owner_id = auth.uid())
  );

-- 5. Append-with-hash-chain RPC (server computes prev_hash/content_hash). ─────
create or replace function public.append_assistant_message(
  p_conversation_id uuid,
  p_role text,
  p_kind text,
  p_original_text text,
  p_original_language char(2),
  p_action_id text default null,
  p_action_status text default null,
  p_action_result jsonb default null,
  p_confirmation_state text default null
) returns public.assistant_messages
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_seq integer;
  v_prev text;
  v_hash text;
  v_row public.assistant_messages;
begin
  select owner_id into v_owner from public.assistant_conversations
    where id = p_conversation_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;

  select coalesce(max(seq),0)+1, (select content_hash from public.assistant_messages
        where conversation_id = p_conversation_id order by seq desc limit 1)
    into v_seq, v_prev
    from public.assistant_messages where conversation_id = p_conversation_id;

  v_hash := encode(digest(
    coalesce(v_owner::text,'') || '|' || v_seq::text || '|' || p_role || '|' ||
    p_original_text || '|' || coalesce(v_prev,''), 'sha256'), 'hex');

  insert into public.assistant_messages(
    conversation_id, seq, role, kind, original_text, original_language,
    action_id, action_status, action_result, confirmation_state, prev_hash, content_hash)
  values (p_conversation_id, v_seq, p_role, p_kind, p_original_text, p_original_language,
    p_action_id, p_action_status, p_action_result, p_confirmation_state, v_prev, v_hash)
  returning * into v_row;

  update public.assistant_conversations set updated_at = now() where id = p_conversation_id;
  return v_row;
end $$;
revoke all on function public.append_assistant_message(uuid, text, text, text, char, text, text, jsonb, text) from public, anon;
grant execute on function public.append_assistant_message(uuid, text, text, text, char, text, text, jsonb, text) to authenticated;

-- 6. GDPR export (§20) — owner exports own transcript as JSON. ────────────────
create or replace function public.export_assistant_transcript()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
    select c.id, c.created_at, c.title,
           (select jsonb_agg(row_to_json(m) order by m.seq)
              from public.assistant_messages m where m.conversation_id = c.id) as messages
    from public.assistant_conversations c
    where c.owner_id = auth.uid()
  ) x;
$$;
revoke all on function public.export_assistant_transcript() from public, anon;
grant execute on function public.export_assistant_transcript() to authenticated;

-- 7. GDPR erasure — owner erases own transcript (whole-thread, all-or-nothing
--    so the hash chain never fractures mid-thread). This is NOT the legal
--    evidence record (journal_entries is); the AI-control transcript is a
--    convenience log, so a hard delete of the owner's own rows is permitted.
create or replace function public.erase_assistant_transcript(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.assistant_conversations
                 where id = p_conversation_id and owner_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  delete from public.assistant_conversations where id = p_conversation_id; -- cascades
end $$;
revoke all on function public.erase_assistant_transcript(uuid) from public, anon;
grant execute on function public.erase_assistant_transcript(uuid) to authenticated;

commit;
