# Conversation source relation — migration proposal v1 (OWNER GATE)

Status: PROPOSAL ONLY (quality-train PR E, 2026-07-06). The durable
"this thread is about booking/request/demand X" relation requires a
production schema change — per the stop condition, this document proposes
it instead of improvising. **Nothing here is applied.**

## Conversation caller map (verified today)

Every direct conversation is opened by exactly one of five guard-pinned
sanctioned callers (`lib/guards/contact-permission.test.ts` allowlist):

| Caller | Granting fact (server-verified) | Grant | Subject stored |
|---|---|---|---|
| `lib/communication/open-conversation-action.ts` | resolved relationship (engagement / existing / admin) | resolved | none |
| `lib/communication/request-worker-conversation.ts` | owns demand + shortlisted + contactable (Step 4A) | `allowed_scouting_shortlist` | demand title (120) |
| `lib/marketplace/service-request-conversation.ts` | buyer/provider of ACCEPTED request | `allowed_accepted_service_request` | offering title (120) |
| `lib/communication/contact-interested-worker.ts` | owns demand + worker's own unwithdrawn interest | `allowed_demand_interest` | demand title (120) |
| `lib/booking/booking-conversation.ts` | owner/worker of ACCEPTED booking | `allowed_accepted_booking` | role_text (120) |

Per caller, everything the §8.1 model requires is already hardened:
server-side permission, honest `cannot_open` failure, no counterpart
profile id to the client (identity only via the SECURITY DEFINER
`conversation_counterpart_identities` RPC), unread = real
(other-party message newer than `last_read_at`), abuse caps checked
before every insert.

## What is missing and WHY it needs schema

`public.conversations` stores only `subject` (free text ≤240) — no
source type, no source id. The subject is ambiguous by construction
(a demand title, an offering title and a booking role are
indistinguishable strings), so:

- a thread cannot honestly display "this is about a booking" vs
  "about a service request";
- no link back to the source surface is possible;
- heuristic labelling from subject text was CONSIDERED AND REJECTED —
  a guessed label can be wrong, and a wrong context label is exactly
  the kind of fake UI this project bans.

What ships in PR E instead (no schema): the scope copy no longer
overclaims. The old label said "the subject is the REQUEST title" for
every direct thread — untrue for booking/offering threads. It now says
"the subject is the related work's title" (LT/EN/RU), which is true for
all four subject-passing callers.

## Proposed migration (RED-tier, owner-gated, NOT applied)

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
```

- Written ONLY inside `createConversation` (already the single insert
  path, abuse-caps-pinned) via a new optional
  `sourceHint?: { type, id }` argument passed by the four context
  callers; the generic caller passes nothing.
- Read via a SECURITY DEFINER RPC
  `conversation_source_context(p_conversation_ids uuid[])` returning
  `(conversation_id, source_type, source_title, source_route_hint)` —
  participant-scoped exactly like `conversation_counterpart_identities`;
  raw `source_id` never reaches the client.
- Existing rows stay NULL → UI keeps today's neutral label (honest
  degradation, no backfill possible because subjects are ambiguous —
  a backfill would be guessing).
- Rollback: `alter table ... drop column source_type, drop column source_id;`

## Owner decision needed (smallest form)

"Approve adding nullable `source_type` + `source_id` to
`public.conversations` plus a participant-scoped reader RPC — yes/no?"

If YES → one dedicated migration PR: DRAFT migration + rollback + the
five-caller stamping + list/thread context labels with real link-backs +
guards (each caller stamps its exact type; reader RPC is the only read
path; no raw source ids client-side).
