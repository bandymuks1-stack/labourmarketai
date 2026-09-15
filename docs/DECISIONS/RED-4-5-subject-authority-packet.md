# RED #4 + RED #5 — one owner decision packet

**State: PREPARED, NOT APPLIED.** Owner PREPARE approval 2026-09-15. Applying
to production needs a separate explicit approval and goes through Supabase MCP
`apply_migration` — never `supabase db push`.

Artefacts:

| | |
|---|---|
| Migration | `supabase/migrations/20260915180000_subject_contest_and_clash_receipt.sql` |
| Rollback | `supabase/rollbacks/20260915180000_subject_contest_and_clash_receipt.down.sql` |
| Guard | `apps/web/lib/guards/red-subject-authority-migration.test.ts` (24 assertions) |
| Static gate | `migration-safety` → STRUCTURAL-GREEN, RISK-ACKNOWLEDGED, RED-class |

**Why one packet.** Both are the same root problem: *a person is the subject of
a record somebody else controls, and the database gives them no way to say
anything about it.* One migration, one decision, one rollback.

---

## RED #4 — the subject may contest evidence written about them

**BLOCKED JOURNEY.** WORKER → evidence/history. An organisation imports work
history about a person (`organization_evidence_records`). The person can *read*
it — the SELECT policy already admits a linked subject — and can do nothing
else. If the record is wrong about them, the product's answer today is silence.

**EXACT CHANGE.** One RLS INSERT policy on `organization_evidence_events`,
plus one partial unique index.

```sql
create policy "organization_evidence_events_subject_dispute"
  on public.organization_evidence_events
  for insert to authenticated
  with check (
    event_type = 'disputed'
    and actor_profile_id      = auth.uid()
    and actor_role            is null
    and actor_organization_id is null
    and replacement_record_id is null
    and not public.manages_organization(organization_id)
    and exists (
      select 1 from public.organization_evidence_records r
        join public.organization_people op on op.id = r.organization_person_id
       where r.id  = organization_evidence_events.record_id
         and r.organization_id  = organization_evidence_events.organization_id
         and op.organization_id = organization_evidence_events.organization_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'));

create unique index if not exists organization_evidence_events_one_dispute_per_actor
  on public.organization_evidence_events (record_id, actor_profile_id)
  where event_type = 'disputed';
```

**WHY REQUIRED.** Nothing smaller works. `event_type = 'disputed'` is *already*
in the table's CHECK and the subject can *already* read these events — the only
missing piece is the authority to write one. The two existing INSERT policies
are `_attest` (organisation managers) and `_verify` (a third-party verifier
organisation); the person the record is about matches neither, and no
combination of application code can grant what RLS refuses.

**EXISTING ALTERNATIVE? None that is honest.** The three considered:

| Alternative | Why rejected |
|---|---|
| Let the subject write `event_type = 'corrected'` instead | A correction implies a replacement record, and the subject has no INSERT on `organization_evidence_records`. It would be a correction that corrects nothing. |
| Route the dispute through an organisation manager | That is the opposite of subject authority: the party being contested decides whether the contest exists. |
| Keep it in application state / a support inbox | Invents a second record of the same fact, outside the audit log the SELECT policy already exposes to both parties. |

**AUTHORITY / PRIVACY EFFECT.**

| Actor | Before | After |
|---|---|---|
| Org manager | INSERT any event except `independently_verified`; SELECT | unchanged |
| Third-party verifier org | INSERT `independently_verified`; SELECT | unchanged |
| **Linked subject** | **SELECT only** | **SELECT + INSERT exactly one `disputed` event per record** |
| Unlinked person | nothing | nothing |
| Anyone | no UPDATE, no DELETE on either table | **no UPDATE, no DELETE on either table** |

Privacy: no new disclosure. The policy reads only rows the caller can already
SELECT, and the dispute is visible to exactly the parties the existing SELECT
policy already admits. Provenance is retained: `actor_profile_id` is the caller,
stated not defaulted. Employer impersonation is impossible twice over — the
table CHECK forces `actor_role IS NULL` for `disputed`, and the policy also
forces `actor_organization_id IS NULL` and refuses a caller who manages the
organisation.

**No ability to alter the underlying employer evidence.** `organization_evidence
_records` has no UPDATE and no DELETE policy, this migration adds none, and
`replacement_record_id IS NULL` closes the one field that could point the record
somewhere else. A contest sits *beside* the record. It never edits it.

**UNKNOWN stays UNKNOWN.** A disputed record does not become false; an
un-disputed record does not become agreed.

---

## RED #5 — a person may knowingly accept a calendar clash, on the record

**BLOCKED JOURNEY.** WORKER → accept/decline → calendar/commitment.
`respond_booking_request_v3` raises `23P01 Conflicting accepted booking for
these dates` when the dates overlap an existing accepted booking. The guard is
right by default. But the worker who *has* decided — a half-day edge, two sites
they can genuinely cover, an arrangement made off-platform — has no path at all.
The product decides for them and records nothing.

**EXACT CHANGE.** One nullable FK column, one widened CHECK, one new CHECK, one
new function. `respond_booking_request_v3` is **left in place and unchanged**.

```sql
alter table public.booking_request_events
  add column if not exists related_booking_request_id uuid
    references public.booking_requests(id) on delete cascade;

-- event_type CHECK widened by exactly one value: 'clash_acknowledged'
-- and bound so no other event type can borrow the new column:
alter table public.booking_request_events
  add constraint booking_request_events_clash_receipt
  check ((event_type = 'clash_acknowledged') = (related_booking_request_id is not null));

create or replace function public.respond_booking_request_v4(
  p_booking_id uuid, p_decision text, p_reason_kind text, p_reason_note text,
  p_acknowledge_clash boolean default false) …
```

`v4` differs from `v3` in exactly three places:

1. the overlap query collects the clashing ids into `v_clashes` instead of only
   testing existence;
2. the refusal is now `if clashes exist AND p_acknowledge_clash is not true` —
   **same message, same `23P01`, same behaviour for every existing caller**;
3. after the accept, one `clash_acknowledged` receipt row per clashing booking,
   in the **same transaction**, and `acknowledged_clashes` in the return value
   so the caller is told what they overrode.

**WHY REQUIRED.** The guard is in a SECURITY DEFINER function; no client change
can pass it. Nothing in the schema can record "this person knew" without a
place to put it.

**EXISTING ALTERNATIVE? None.**

| Alternative | Why rejected |
|---|---|
| Relax the overlap check for everyone | Removes a real data-integrity guard with no record of who chose what. The opposite of an audit receipt. |
| Let the employer re-propose different dates | Correct when the dates are wrong. Useless when the person genuinely intends both. |
| Record the acknowledgement only client-side | The accept still fails in the database. A receipt for an action that did not happen. |

**THE OVERRIDE RECORDS THE DECISION; IT DOES NOT ERASE THE CLASH.** Both
bookings stay `accepted` with their real dates. `detectConflicts`
(`lib/planning/planning-model.ts`) is pure and derives the overlap from those
dates — it will keep returning this conflict tomorrow, and the calendar will
keep showing it. There is no resolved flag, no suppression column and no delete;
the guard test asserts the absence of each.

**AUTHORITY / PRIVACY EFFECT.**

| Actor | Before | After |
|---|---|---|
| Addressed worker | may accept/decline; **cannot** accept into an overlap | may accept/decline; **may accept into an overlap only by saying so explicitly**, which writes a receipt |
| Anyone else | `42501 Only the addressed worker may respond` | unchanged |
| Employer / worker / admin | SELECT on `booking_request_events` | unchanged — the receipt is visible to exactly the same parties |
| Any client | no INSERT policy on `booking_request_events` | unchanged — every write still arrives through a SECURITY DEFINER function |
| `anon` / `public` | no execute | no execute (`revoke all … from public`, `grant execute … to authenticated`) |

No employer impersonation: the actor is the authenticated worker, and the
function re-derives `is_subject_worker` before anything else, exactly as v3
does. Privacy: the receipt names a booking the same two parties already see.

---

## MIGRATION AND ROLLBACK

Additive throughout: one policy, one index, one nullable column, one widened
CHECK, one new CHECK, one new function. Nothing is dropped except the
`event_type` CHECK that is re-added widened in the same statement pair.

Rollback (`supabase/rollbacks/…down.sql`) drops the function, the two CHECKs and
the column, restores the original CHECK, drops the index and drops the policy.
The **only** rows it deletes are `clash_acknowledged` receipts — rows this
migration made possible in the first place. Every pre-existing row predates both
halves and is untouched. Rolling back Part A removes an *authority*, never a
record: a dispute already written stays readable, and only the ability to write
a new one goes away.

---

## TEST AND DRY-RUN EVIDENCE — read this before approving the apply

**What exists.** 24 static assertions over the prepared SQL
(`red-subject-authority-migration.test.ts`), each pinning one clause the owner
named as a condition of the approval: subject-only authority, no employer
impersonation, no widening of unrelated INSERT/UPDATE/SELECT, immutable and
auditable events, provenance retained, no path to alter the underlying
employer evidence, the clash override records rather than erases. The full
suite is green on this branch (1358 files / 23167 tests, 2 skipped).

**What does NOT exist, stated plainly: there is no runtime evidence.** The
migration has not been executed anywhere. These assertions prove the text says
what was approved; they do not prove the policy admits the right caller and
refuses the wrong one. Getting that requires executing it against a database —
a Supabase preview branch — which carries a cost and is therefore owner-gated.
It is not claimed here and it has not been done.

**Production dry-run state, read-only, 2026-09-15:**

| | |
|---|---|
| `organization_evidence_records` | **0** |
| `organization_evidence_events` | 0 (`disputed`: 0) |
| `organization_people` linked to a profile | **0** |
| `booking_requests` | 1 (accepted: 1) |
| `booking_request_events` | 2 |

**What that means, honestly.** Neither half can be exercised against real data
today. RED #4 unblocks nothing *measurable* right now — with zero evidence
records and zero linked people there is nobody to contest anything; it is
DATA_REQUIRED, waiting on the historical import. RED #5 has one accepted
booking, and one booking cannot clash with itself.

This cuts both ways and the owner should weigh both:

* **For applying now:** empty tables are the safest possible moment. A migration
  cannot corrupt data that does not exist, the authority is in place before the
  first real worker meets the wall, and the backfill risk is zero. Part B
  additionally changes *nothing* on apply — `v3` stays the only caller until a
  client is written for `v4`.
* **Against applying now:** it is authority for a journey no one is walking yet,
  and the honest first use is still ahead of it.

---

## RECOMMENDED OWNER DECISION

**APPLY BOTH, NOW, AS ONE MIGRATION.** They are additive, exactly scoped,
reversible, and they land on empty tables — the cheapest and safest moment they
will ever have. Neither changes any existing behaviour on the day it is applied:
Part A adds a door nobody is standing at yet, and Part B adds a function nothing
calls yet.

Two things follow the apply and are **not** part of it:

1. **Part A needs a surface.** The subject-side "this is wrong" control on the
   worker's evidence view. GREEN once the authority exists — no further owner
   decision.
2. **Part B needs a caller.** `respond_booking_request_v4` has no client today;
   the accept path still uses v3. Wiring it (an explicit "I know this overlaps —
   accept anyway" confirmation, not a silent default) is GREEN once the
   authority exists, and is the only way Part B becomes reachable.

**If the answer is instead DEFER:** nothing is lost. The migration file and its
rollback stay in the repository, unapplied, and the guard keeps them honest.
Defer is the right call if the preference is to see the historical import land
first so the first dispute has a real record behind it.
