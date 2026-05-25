-- ════════════════════════════════════════════════════════════════════════
-- 0021 — Communication v1: conversations, participants, messages.
--
-- Pilot tester ↔ admin / worker ↔ company / worker ↔ agency channel.
-- NOT a marketing chat. NOT a public chat. NOT a fake-realtime channel.
--
-- Three tables:
--   - public.conversations         — one row per thread.
--   - public.conversation_participants — m:n (conversation × profile).
--   - public.messages              — append-only message rows.
--
-- Access (RLS, enforced at the DB):
--   - SELECT: only profiles that participate in the conversation (or admin).
--   - INSERT messages: only a participant in the conversation, and only
--     for their own author_id (= auth.uid()).
--   - UPDATE/DELETE messages: none. Append-only.
--   - INSERT participants: only the creator of the conversation OR admin
--     (v1 — group composition stays simple while we learn).
--   - UPDATE participants.last_read_at: each participant for their own row.
--
-- No file uploads in v1 (text only).
-- No `delivered` / `read` / typing-indicator pretence in v1 — only an
--   honest per-participant `last_read_at` timestamp the participant
--   themselves sets when they open the thread.
-- No service_role.
-- Additive only — no DROP / no ALTER drop / no DELETE FROM.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. conversations ───────────────────────────────────────────────────
create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  subject      text check (subject is null or char_length(subject) <= 240),
  -- Kind keeps the schema flexible without exploding the surface in v1.
  kind         text not null default 'direct'
               check (kind in ('direct','support','team')),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_conversations_updated_at
  on public.conversations(updated_at desc);
create index if not exists idx_conversations_created_by
  on public.conversations(created_by);

-- ── 2. conversation_participants ───────────────────────────────────────
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  added_by        uuid references public.profiles(id),
  added_at        timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, profile_id)
);
create index if not exists idx_conversation_participants_profile
  on public.conversation_participants(profile_id, conversation_id);

-- ── 3. messages ────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id       uuid not null references public.profiles(id),
  -- Body cap is permissive but bounded so a single message can't blow
  -- up the row size. Long pastes are still allowed (10k chars ≈ ~3
  -- pages of plain text).
  body            text not null check (char_length(body) between 1 and 10000),
  created_at      timestamptz not null default now()
);
create index if not exists idx_messages_conversation_created
  on public.messages(conversation_id, created_at);
create index if not exists idx_messages_author_created
  on public.messages(author_id, created_at desc);

-- ── 4. RLS helper — is the caller a participant in this conversation? ─
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
security invoker
stable
as $$
  select exists (
    select 1 from public.conversation_participants cp
     where cp.conversation_id = p_conversation_id
       and cp.profile_id = auth.uid()
  );
$$;

-- ── 5. RLS — conversations ────────────────────────────────────────────
alter table public.conversations enable row level security;

create policy conversations_select on public.conversations for select
  using (
    public.is_conversation_participant(id)
    or created_by = auth.uid()
    or public.is_admin()
  );

create policy conversations_insert on public.conversations for insert
  with check (created_by = auth.uid());

-- ── 6. RLS — conversation_participants ───────────────────────────────
alter table public.conversation_participants enable row level security;

create policy conversation_participants_select on public.conversation_participants for select
  using (
    profile_id = auth.uid()
    or public.is_conversation_participant(conversation_id)
    or public.is_admin()
  );

-- Only the conversation creator (or admin) can add participants in v1.
-- This keeps the surface boring while we learn — group composition
-- mutation lives in a future RPC.
create policy conversation_participants_insert on public.conversation_participants for insert
  with check (
    exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.created_by = auth.uid() or public.is_admin())
    )
  );

-- Participants can update ONLY their own row (for last_read_at).
create policy conversation_participants_update on public.conversation_participants for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ── 7. RLS — messages ─────────────────────────────────────────────────
alter table public.messages enable row level security;

create policy messages_select on public.messages for select
  using (
    public.is_conversation_participant(conversation_id)
    or public.is_admin()
  );

create policy messages_insert on public.messages for insert
  with check (
    author_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  );

-- No UPDATE / DELETE policy — messages are append-only.

-- ── 8. Grants ──────────────────────────────────────────────────────────
grant select, insert            on public.conversations              to authenticated;
grant select, insert, update    on public.conversation_participants  to authenticated;
grant select, insert            on public.messages                   to authenticated;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
