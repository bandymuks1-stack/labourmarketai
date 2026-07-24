# Proposal — Assistant (AI-control) transcript persistence v1

> **Status: PROPOSAL / DESIGN-ONLY. NOT APPLIED.** Owner-gated RED migration.
> STOP before apply. Not placed in `supabase/migrations/` so `#864` CI stays
> GREEN; applying it is a separate focused owner-gated PR (doctrine §13).

Today the conversation-first `/dashboard` keeps its thread **in session only** —
reload and it resets. This proposal is the minimal, doctrine-compliant model to
persist the **AI-control transcript** as a real product, without becoming a
parallel copy of anything canonical.

## Files + integrity

| File | SHA-256 |
|---|---|
| `20260724_assistant_transcript_v1.sql` | `de0e3ff89a2bff393982dcf1379eac825ef328a501b0a0be1d8794667656497f` |
| `20260724_assistant_transcript_v1.down.sql` | `ea8e83c21ba55eae9de79fcab3e55a8ebc6aa5a736ac148d1012f06215275307` |

Recompute before apply: `sha256sum <file>` must match, or the file was edited.

## The four-way separation (why this is not a parallel structure)

The brief requires clearly separating four record classes. Each keeps its
canonical home; this proposal adds ONLY the first:

| Record class | Home | This proposal |
|---|---|---|
| **AI-control chat** (user ↔ assistant turns) | **NEW** `assistant_conversations` / `assistant_messages` | ✅ adds |
| **Human / team messages** | `conversation_messages` (canonical, migration `0021`) | ❌ untouched |
| **System action results** | the action's own canonical table; here only a **result record** (`kind='action_result'`, `action_id` + `action_status` + serializable `action_result`) — never the write itself | ✅ reference only |
| **Work activity** | `journal_entries` (canonical, `0013`) | ❌ untouched — a work-log confirmed in chat is saved to the journal; the transcript stores only that it happened |

## Schema (see the `.sql`)

- `assistant_conversations` — one owner-scoped AI thread. `owner_id → profiles`, `status`, `created_at/updated_at`, soft-hide (`hidden_at/hidden_reason`).
- `assistant_messages` — **append-only, hash-chained**. `seq` (1-based per conversation), `role`, `kind` (`text|question|confirmation|action_result`), `original_text` + `original_language` (§2.2/§2.3 — **no translation columns**), action linkage, `confirmation_state`, `prev_hash`/`content_hash`.
- `assistant_message_attachments` — Storage reference only (§6): `storage_path`, `mime`, `byte_size`. Files never in the DB.

## RLS matrix (default-closed, §4)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `assistant_conversations` | owner (`owner_id = auth.uid()`) | owner | owner (soft-hide only) | ✗ (erasure RPC) |
| `assistant_messages` | owner via conversation | ✗ direct — only via `append_assistant_message` (server computes the hash chain) | ✗ (append-only §3.1) | ✗ |
| `assistant_message_attachments` | owner via message→conversation | via append flow | ✗ | ✗ |

RPCs (all `SECURITY DEFINER`, `search_path=public`, `execute` revoked from `public`/`anon`, granted to `authenticated`): `append_assistant_message`, `export_assistant_transcript`, `erase_assistant_transcript`.

## Hash chain (§3.3)

`content_hash = SHA-256(owner_id || seq || role || original_text || prev_hash)`,
`prev_hash` = previous message's `content_hash`. Computed **server-side** in
`append_assistant_message` — the client cannot forge the chain (no direct
INSERT). Tampering with any historic row breaks verification from that row on.

## Original / translated text model (§2.2)

Only `original_text` + `original_language` are stored. Translations are **never**
persisted — they are rendered on read and cached at the edge (same rule as
`conversation_messages`). A message the assistant drafts in the user's language
and a recipient's-language rendering are two *views* of one stored original.

## Pending / stale confirmation

`kind='confirmation'` rows carry `confirmation_state ∈ {pending, confirmed,
cancelled, stale}`. This mirrors the live dispatcher's one-time token +
`stateFingerprint`: a confirmation shown against one state that is acted on after
the state changed is recorded `stale` (never silently executed). A `pending`
confirmation that is never acted on stays `pending` — an honest record, not a
fake success.

## PII classification

- `original_text` — **user PII / free text.** The message body.
- `action_result` — serializable summary of an action the user already owns (e.g. saved journal entry id/status). No third-party PII; no contact details.
- `storage_path` — reference to an owner-scoped private bucket object.
- `owner_id` — the subject. No cross-subject data lives here.

## Retention + GDPR

- **Retention:** the AI-control transcript is a **convenience log**, not the legal-evidence record (that is `journal_entries`, §3). Proposed default retention **24 months** rolling per conversation `updated_at`, owner-configurable, documented in the privacy policy (§20/§6 minimalism).
- **Export (§20):** `export_assistant_transcript()` returns the owner's conversations + messages as JSON.
- **Erasure:** `erase_assistant_transcript(conversation_id)` hard-deletes the owner's **whole** thread (all-or-nothing, so the hash chain never fractures mid-thread). Permitted because it is the owner's own convenience log, not the append-only legal evidence — that separation is the point of keeping the journal canonical and untouched.
- **Audit integrity principle:** within retention, the hash chain makes the transcript tamper-evident; erasure is a deliberate whole-thread removal, never a silent per-row edit.

## Test plan (ships with the real migration PR)

1. **RLS isolation** — user B cannot SELECT user A's conversations/messages/attachments (cross-user denied); `append_assistant_message` raises `not_owner` for a non-owner conversation.
2. **Append-only** — direct INSERT/UPDATE/DELETE on `assistant_messages` denied by RLS; only the RPC writes.
3. **Hash chain** — sequential appends produce `prev_hash` continuity; a simulated tampered `original_text` breaks recomputed `content_hash` from that row onward.
4. **Confirmation lifecycle** — pending → confirmed/cancelled/stale transitions recorded; a stale confirmation never drives an execution.
5. **Action result honesty** — `action_result` records the REAL dispatcher outcome; an error status is stored as `error`, never `ok`.
6. **GDPR** — `export_*` returns only the caller's data; `erase_*` removes the whole thread and cascades attachments; both deny non-owners.
7. **migration-safety** — file classifies RED (SECURITY DEFINER + GRANT + RLS) → confirms the human-gate path; rollback recreates a clean drop.

## Apply path (owner, when approved)

1. Copy the `.sql` into `supabase/migrations/<14-digit UTC>_assistant_transcript_v1.sql` and the rollback into `supabase/rollbacks/<same>.down.sql` (§16 naming).
2. Bump the `product-readiness` SPRINT_BASELINE + `ops-bridge-migration` count.
3. Open as **draft** with `needs-human-gate`; post the SQL + RLS diff.
4. Apply via **Supabase MCP `apply_migration`** after DI approval — never `supabase db push`.
5. Verify on prod with an MCP read; record `APPLIED TO PROD` in the ledger.
