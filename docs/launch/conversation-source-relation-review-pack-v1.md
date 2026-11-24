# Conversation source relation — owner review pack v1

Status: DECISION PACKAGE ONLY (docs-only PR, 2026-07-06). Nothing in this
document is applied. No migration file exists for this change. The owner
approves or rejects the proposal in one pass using the decision statement
at the bottom.

Companion to `docs/launch/conversation-source-relation-proposal-v1.md`
(quality-train PR E proposal). This pack adds the verified caller map with
exact file paths, the RLS/privacy constraints, the rollback and test plan,
so no re-research is needed at decision time.

---

## 1. Current caller map (verified against source, 2026-07-06)

### 1.1 The single insert path

Every `public.conversations` row is inserted in exactly one place:

- `apps/web/lib/communication/actions.ts` — `createConversation(...)`
  (insert at `.from("conversations").insert({ subject, kind, created_by })`).
  It enforces, BEFORE the insert: participant fan-out cap, §8.2
  conversation rate cap (default-closed on unreadable counts), and
  `created_by = auth.uid()` via RLS.
  Guard: `apps/web/lib/guards/messaging-abuse-caps.test.ts`
  ("conversations is inserted only by the capped createConversation").

### 1.2 Direct-thread wrapper

- `apps/web/lib/communication/direct-conversation.ts` —
  `getOrCreateDirectConversation(otherProfileId, locale, subject?, grantedPermission?)`.
  Dedupes existing direct threads, applies the §8.1 contact-permission
  gate (default-closed), then calls `createConversation`.

### 1.3 The five sanctioned direct callers (guard-pinned allowlist)

Allowlist pinned by `apps/web/lib/guards/contact-permission.test.ts`
("every getOrCreateDirectConversation caller is on the pinned allowlist"):

| # | Caller (file path) | Server-verified fact | Grant passed | Subject stored |
|---|---|---|---|---|
| 1 | `apps/web/lib/communication/open-conversation-action.ts` | generic relationship resolved server-side (engagement / existing thread / admin) | none (server resolves) | none |
| 2 | `apps/web/lib/communication/request-worker-conversation.ts` | caller owns demand + worker shortlisted + contactable (Step 4A) | `allowed_scouting_shortlist` | demand title (≤120) |
| 3 | `apps/web/lib/marketplace/service-request-conversation.ts` | caller is buyer/provider of an ACCEPTED service request | `allowed_accepted_service_request` | offering title (≤120) |
| 4 | `apps/web/lib/communication/contact-interested-worker.ts` | caller owns demand + worker's own unwithdrawn interest | `allowed_demand_interest` | demand title (≤120) |
| 5 | `apps/web/lib/booking/booking-conversation.ts` | caller is owner/worker of an ACCEPTED booking (see `docs/launch/booking-lifecycle-v1.md`) | `allowed_accepted_booking` | role_text (≤120) |

### 1.4 Non-direct creation

- `apps/web/components/app/support-conversation-launcher.tsx` — creates
  `kind: "support"` threads via `createConversation` directly (subject =
  user-typed support subject). Not a source-relation candidate; support
  threads already carry an honest `scope.support` label.

### 1.5 Where the ambiguity surfaces (read side)

- `apps/web/lib/communication/conversation-display.ts` —
  `describeConversationCard` maps direct + non-empty subject to the
  neutral `scope.demand` key ("About work — the subject is the related
  work's title"), and no subject to `scope.unknown`.
- List page: `apps/web/app/[locale]/dashboard/communication/page.tsx`.
- Thread page: `apps/web/app/[locale]/dashboard/communication/[conversationId]/page.tsx`.
- Counterpart identity comes ONLY from the SECURITY DEFINER RPC
  `conversation_counterpart_identities`
  (migration `supabase/migrations/20260705170000_conversation_counterpart_identity.sql`).

---

## 2. Current limitations

`public.conversations` (migration `supabase/migrations/0021_communication.sql`)
stores only `subject text (≤240)`, `kind`, `created_by`, timestamps —
no source type, no source id. Consequences:

1. **Ambiguous by construction.** A demand title, an offering title and a
   booking role_text are indistinguishable strings. A thread cannot
   honestly say "this is about a booking" vs "about a service request".
2. **No link-back.** The thread cannot link to the booking / service
   request / demand it came from, so users context-switch by memory.
3. **Heuristic labelling was considered and REJECTED** — guessing the
   source from subject text can be wrong, and a wrong context label is
   exactly the fake UI this project bans. The current honest fallback is
   the neutral `scope.demand` copy (LT/EN/RU), pinned by
   `apps/web/lib/guards/conversation-context-honesty.test.ts`.
4. **No backfill is possible.** Existing rows can never be labelled
   retroactively (same ambiguity), so any fix is forward-only.

---

## 3. Proposed columns

Two nullable columns on `public.conversations`:

| Column | Type | Constraint | Meaning |
|---|---|---|---|
| `source_type` | `text` | `check (source_type in ('scouting','accepted_service_request','demand_interest','accepted_booking'))`, nullable | Which sanctioned context caller opened the thread; `NULL` = generic / support / pre-migration |
| `source_id` | `uuid` | nullable, **no FK** (four possible parent tables) | Row id in the source table implied by `source_type`; validated by the reader RPC, never trusted raw |

Write path: ONLY inside `createConversation` (already the single
abuse-caps-pinned insert path) via a new optional
`sourceHint?: { type, id }` argument. Each of the four context callers
(rows 2–5 in §1.3) passes its own exact type; the generic caller (row 1)
and the support launcher pass nothing. A caller can never stamp a type it
does not own — pinned by guard tests (§7).

---

## 4. Proposed reader RPC

One SECURITY DEFINER function, modelled exactly on the existing
`conversation_counterpart_identities`:

```
conversation_source_context(p_conversation_ids uuid[])
  returns table (
    conversation_id   uuid,
    source_type       text,
    source_title      text,   -- resolved live from the source row
    source_route_hint text    -- app-route discriminator, NOT a raw id path
  )
```

Behaviour:

- Participant-scoped at fire time: rows returned only where
  `public.is_conversation_participant(conversation_id)` holds (same
  re-check pattern as the identity RPC).
- Resolves `source_id` against the table implied by `source_type` and
  returns only a display title + a route hint. If the source row is gone
  or unreadable, the conversation row is simply omitted → UI degrades to
  today's neutral label (honest degradation, no fabrication).
- **Raw `source_id` never reaches the client.**
- `search_path` pinned, `stable`, execute REVOKED from `public` and
  `anon`, GRANTED to `authenticated` only.

---

## 5. RLS / privacy constraints (must all hold)

1. No new table-level policy and no policy change on
   `public.conversations` — the columns ride the existing
   participant-scoped SELECT policy (`conversations_select`) and the
   `created_by = auth.uid()` INSERT policy from `0021_communication.sql`.
2. The reader RPC is the ONLY read path for source context; the app never
   selects `source_id` client-side.
3. The RPC's projection leaks no counterpart contact channel, no profile
   id, no raw source id — title + route hint only.
4. Exactly one new SECURITY DEFINER function; execute revoked from
   `public`/`anon`, granted to `authenticated` only (same posture as the
   identity RPC, pinned the same way in tests).
5. Existing rows stay `NULL` forever — no backfill, no guessing.
6. Stamping cannot mint permission: `sourceHint` is attached only after
   the caller's own server-side gate held (the §8.1 grant flow is
   unchanged).

---

## 6. Migration sketch (TEXT ONLY — no file exists, nothing applied)

RED-tier, owner-gated, needs-human-gate. If approved it becomes ONE
dedicated migration PR. Sketch:

```sql
-- 20260706XXXXXX_conversation_source_relation.sql  (DRAFT — needs-human-gate)
alter table public.conversations
  add column source_type text
    check (source_type in
      ('scouting','accepted_service_request','demand_interest','accepted_booking')),
  add column source_id uuid;

comment on column public.conversations.source_type is
  'Which sanctioned caller opened the thread; null = generic/pre-migration.';
comment on column public.conversations.source_id is
  'Row id in the source table implied by source_type; validated by RPC, no FK
   (four possible parent tables).';

-- + create function public.conversation_source_context(p_conversation_ids uuid[])
--   security definer set search_path = public stable
--   (participant re-check at fire time; title + route hint projection only)
-- + revoke all ... from public; revoke all ... from anon;
-- + grant execute ... to authenticated;
```

Properties: additive-only (no drop, no rewrite, nullable columns = no
table lock pain, no default), no data migration, no backfill.

## 7. Rollback sketch (text only)

```sql
-- 20260706XXXXXX_conversation_source_relation.down.sql (DRAFT)
drop function if exists public.conversation_source_context(uuid[]);
alter table public.conversations
  drop column if exists source_type,
  drop column if exists source_id;
```

Rollback is safe at any time: the UI already handles `NULL`/absent
context (today's neutral label), so dropping the columns returns the
product to exactly the current behaviour. No data loss beyond the
stamps themselves.

---

## 8. Tests needed (ship WITH the migration PR, not later)

Extend the existing guard-test pattern (`apps/web/lib/guards/`):

1. **Single write path** — `source_type`/`source_id` are written only
   inside `createConversation`; no other file inserts or updates them
   (extend `messaging-abuse-caps.test.ts`).
2. **Exact stamping** — each of the four context callers passes its own
   exact `sourceHint` type and no other; the generic open action and the
   support launcher pass none (extend `contact-permission.test.ts`
   allowlist assertions).
3. **Migration shape** — the migration file is marked `needs-human-gate`
   + `@human-gate-approved`, adds exactly one SECURITY DEFINER function,
   `search_path`-pinned, revoke public/anon + grant authenticated, no
   policy change, no `using (true)`, no table grants (mirror of the
   `contact-permission.test.ts` §4 block for the identity migration).
4. **Rollback shape** — the down file drops only the function and the two
   columns; no `drop table` / `delete from` / `truncate`.
5. **Reader honesty** — the app-layer resolver calls ONLY
   `conversation_source_context`, degrades to an empty map on error, and
   never forwards a raw `source_id` to the client (mirror of the identity
   resolver guard).
6. **UI honest degradation** — `describeConversationCard` with no source
   context renders exactly today's neutral labels; with context renders
   the typed label + link-back; a stale/missing source row falls back to
   neutral (extend `conversation-context-honesty.test.ts`).
7. **Locale parity** — new context labels exist and are non-empty in
   lt/en/ru, no `[EN]` markers.
8. **E2E RLS probe** — non-participant calling
   `conversation_source_context` gets zero rows (extend
   `apps/web/tests/e2e/chat-visibility-rls.spec.ts`).

---

## 9. Owner decision (exact yes/no statement)

> **"Approve adding nullable `source_type` + `source_id` to
> `public.conversations` plus a participant-scoped SECURITY DEFINER
> reader RPC `conversation_source_context` (title + route hint only, no
> raw ids client-side, existing rows stay NULL, forward-only) — yes/no?"**

- **YES** → one dedicated migration PR containing: the DRAFT
  needs-human-gate migration + rollback (§6–7), the `sourceHint` stamping
  in `createConversation` + the four context callers, list/thread context
  labels with real link-backs, and the full guard set (§8). Owner applies
  the migration manually per the production ledger process
  (`docs/APPLIED_LEDGER.md`).
- **NO** → nothing changes; the honest neutral label
  (`communication.scope.demand`, LT/EN/RU) remains the permanent
  behaviour and this pack is archived as the record of the decision.
