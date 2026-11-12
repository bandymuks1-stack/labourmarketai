# Chat alerts: atomic recipient eligibility, v1 (DRAFT, RED, not built)

> **Status: proposal only.** No migration has been created or applied. This is
> a RED change (a new SECURITY DEFINER function and an outbox table), so it
> needs the owner's explicit approval before anyone writes it. It is filed in
> the security model's honest-gaps table:
> [`docs/security/security-model-v1.md` §3](../security/security-model-v1.md).

## Problem

#3224 made every new-message alert re-check eligibility right before each
channel: the bell insert, the e-mail and the push. The re-check runs under
the sender's session (`isLiveParticipant` in
`lib/communication/communication-core.ts`), and the channel runs one request
later. A removal that commits between the two can let one alert through:

- **bell:** the re-check passes, then the `notification_events` insert runs
  after the removal committed;
- **e-mail / push:** the re-check passes, then the provider is called. Once
  the provider has the message it cannot be recalled.

Impact today, from the honest-gaps entry: no thread title, sender, text or
contact data leaves. Only "a message happened, at this time" does. The bell row
is hidden at read time.

## Proposal

### 1. Conditional bell insert in one statement

Add `public.emit_message_received_v1(p_conversation_id uuid, p_recipient uuid,
p_entity_id uuid, p_dedupe_key text, p_metadata jsonb)`:

- `security definer`, `set search_path = public, pg_temp`;
- `execute` granted to `service_role` only. It is called by the emitter that
  writes the bell today;
- body:

  `insert into notification_events (...) select ... where exists (select 1
  from conversation_participants where conversation_id = p_conversation_id
  and profile_id = p_recipient and revoked_at is null)
  on conflict (recipient_profile_id, dedupe_key) do nothing returning id`.

The eligibility check and the insert are then one statement. A concurrent
`revoke_conversation_participant` either commits first, so nothing is
inserted, or after, so the row exists. In the second case the read-time
filter hides it.

### 2. E-mail and push through an outbox

- New table `notification_delivery_outbox(id, event_id, channel, status,
  attempts, created_at, sent_at)`, written by the same definer function in
  the same transaction as the bell row.
- A worker (the existing cron route) claims rows with
  `for update skip locked` and re-runs the participant check **in the same
  transaction** as the claim.
- It marks a row `cancelled_ineligible` when the check fails, and sends
  otherwise.
- Bounded retries: at most 3 attempts with backoff, then `failed`. No
  unbounded retry, which also covers the owner's check 6 for #3226.

Remaining window after this: from the worker's claim to the provider call.
That window is the same size as today, but each step is recorded, and a
removal before the claim is always honoured.

## Tests it would need

- A PG16 two-session race (the pattern of
  `scripts/db-proof/chat-participant-revocation.sh`): a revoke and an emit
  interleaved in both orders give no visible row, or a row hidden at read
  time. The same for the outbox claim.
- `service_role` can execute the function and `authenticated` / `anon`
  cannot. The function never inserts for a revoked recipient.
- A rollback file restores today's emitter path.

## Why not now

The residual risk is low (no content leaves), and the change needs a new
privileged function and a table. Owner decision.
