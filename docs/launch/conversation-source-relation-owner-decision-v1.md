# Conversation source relation — owner decision sheet v1

Status: OWNER DECISION REQUIRED (docs-only, 2026-07-06). One page, one
yes/no. Deep reference (verified caller map, full migration/rollback
sketch, test plan):
`docs/launch/conversation-source-relation-review-pack-v1.md` (merged as
PR #661). Nothing here creates or applies any migration.

---

## 1. Current limitation (plain language)

A conversation row stores only a free-text subject. A thread opened from
a booking, a service request, a demand shortlist or a demand interest all
look identical — the app cannot honestly say which one it came from, and
cannot link back to it. The UI therefore shows a deliberately neutral
"About work" label (guessing from the subject text was considered and
rejected as fake UI). Existing rows can never be labelled retroactively;
any fix is forward-only.

## 2. Proposed relation fields

Two nullable columns on `public.conversations`, additive-only:

| Column | Type | Notes |
|---|---|---|
| `source_type` | `text`, nullable | CHECK-constrained to `scouting` / `accepted_service_request` / `demand_interest` / `accepted_booking`; `NULL` = generic / support / pre-migration |
| `source_id` | `uuid`, nullable | Row id in the table implied by `source_type`; no FK (four possible parents); validated by the reader RPC, never trusted raw |

Write path stays the single abuse-caps-pinned `createConversation`; each
of the four sanctioned context callers stamps only its own exact type.

## 3. Reader RPC purpose

One participant-scoped SECURITY DEFINER RPC,
`conversation_source_context(p_conversation_ids uuid[])`, modelled on the
existing `conversation_counterpart_identities`. It returns only a display
title + an app-route hint per conversation the caller actually
participates in. Raw `source_id` never reaches the client; a missing or
unreadable source row is simply omitted and the UI degrades to today's
neutral label.

## 4. Privacy / RLS constraints (all six must hold)

1. No new or changed RLS policy on `public.conversations` — the columns
   ride the existing participant-scoped SELECT + `created_by = auth.uid()`
   INSERT policies.
2. The RPC is the ONLY read path for source context; the app never
   selects `source_id` client-side.
3. RPC projection leaks nothing beyond title + route hint — no contact
   channels, no profile ids, no raw source ids.
4. Exactly one new SECURITY DEFINER function; EXECUTE revoked from
   `public`/`anon`, granted to `authenticated` only; `search_path` pinned.
5. Existing rows stay `NULL` forever — no backfill, no guessing.
6. Stamping cannot mint permission: `sourceHint` is attached only after
   the caller's own server-side gate already held.

## 5. Risk if NOT implemented / benefit if implemented

- **NOT implemented:** threads stay ambiguous by construction — users
  context-switch by memory, and the neutral "About work" label is the
  permanent ceiling on messaging clarity. No safety or privacy risk; it
  is purely a product-quality limitation.
- **Implemented:** new threads get an honest, typed context label with a
  real link-back to the booking / service request / demand they came
  from, with zero widening of RLS and honest degradation everywhere.

---

## 6. THE DECISION (verbatim from the review pack §9)

> **"Approve adding nullable `source_type` + `source_id` to
> `public.conversations` plus a participant-scoped SECURITY DEFINER
> reader RPC `conversation_source_context` (title + route hint only, no
> raw ids client-side, existing rows stay NULL, forward-only) — yes/no?"**

---

## 7. If YES — exact command to hand to an agent

Paste this to a fresh agent session:

```
Execute the conversation source relation migration PR for
C:\Users\Mano\Documents\labourmarketai (pnpm monorepo, app in apps/web).

Branch: feat/conversation-source-relation-v1 (isolated worktree from
origin/main).

Scope — ONE dedicated migration PR, exactly per
docs/launch/conversation-source-relation-review-pack-v1.md §6-8:
1. Migration supabase/migrations/<ts>_conversation_source_relation.sql
   following the §6 sketch (two nullable columns + CHECK on source_type,
   column comments, conversation_source_context SECURITY DEFINER RPC:
   participant re-check at fire time, title + route-hint projection only,
   search_path=public pinned, stable, revoke public/anon, grant
   authenticated). Header marks it needs-human-gate (RED-class:
   SECURITY DEFINER + GRANT) — do NOT add @human-gate-approved yourself.
2. Paired rollback supabase/rollbacks/<ts>_conversation_source_relation.down.sql
   per §7 (drop function + drop the two columns only).
3. sourceHint stamping in createConversation + the four context callers
   (request-worker-conversation, service-request-conversation,
   contact-interested-worker, booking-conversation); generic open action
   and support launcher pass nothing.
4. List/thread context labels with real link-backs; honest degradation
   to today's neutral label when context is absent; lt/en/ru parity.
5. The full §8 guard set (single write path, exact stamping, migration
   shape, rollback shape, reader honesty, UI honest degradation, locale
   parity, e2e RLS probe).
6. Run pnpm typecheck && pnpm lint && pnpm check:primary-route-smoke and
   the guard tests. Open the PR as DRAFT with the needs-human-gate
   marker. Do NOT merge and do NOT apply anything to the database.

Human-gate flow (mirror PR #653 / 20260706150000_privacy_request_intake):
owner reviews the draft, adds the `-- @human-gate-approved` line to the
migration file (with tier + review note), PR is merged, THEN the
migration is applied manually via Supabase MCP apply_migration to prod
project gorgitwvdzxbnaxhrsrw (never supabase db push), verified
post-apply, and recorded in docs/APPLIED_LEDGER.md. Until applied the
app must degrade honestly (missing RPC => neutral label, no errors).
```

## 8. If NO — exact "do not implement" note

> **DO NOT IMPLEMENT** the conversation source relation. Park
> `docs/launch/conversation-source-relation-review-pack-v1.md` as the
> archived record of this decision. The honest neutral label
> (`communication.scope.demand`, LT/EN/RU) remains the permanent
> behaviour; no `source_type`/`source_id` columns, no
> `conversation_source_context` RPC, no stamping code. Revisit trigger:
> only if real users report confusing threads they cannot trace back to
> a booking / service request / demand (support signal, not agent
> initiative) — then re-open THIS decision sheet, not a new proposal.

---

Decision record: ☐ YES ☐ NO — decided by ______ on ______.
