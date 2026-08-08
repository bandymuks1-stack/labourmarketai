# W12 — employer absence privacy hardening (design, OWNER-GATED)

`OWNER_APPROVAL_REQUIRED_BEFORE_APPLY`. Migration written, rollback written,
proven on a local stack. **Not applied to production.**

## The exposure

#1087 keeps the private fields out of the employer view by **not selecting
them** — the query asks for `id, worker_id, start_date, end_date, status` and
never for `note` (500 chars of the worker's own free text) or `absence_type`
(whose values include `sickness`). That is correct application minimisation and
it is guard-tested.

It is not a database guarantee. `worker_absences` RLS is **row**-level: an
employer admitted by `caller_manages_worker()` is admitted to the **whole row**.
Proven against a real database rather than inferred:

```
authorized employer, real JWT claim:
  select note, absence_type from worker_absences where status = 'approved'
  -> 'PRIVATE-REASON do not disclose to employer' / 'sickness'
```

Any future `select *`, new feature or hand-written report reaches the reason.

## Options compared

| | A — column REVOKE | B — `security_invoker` view | C — narrowed policy + definer view | D — SECURITY DEFINER RPC |
|---|---|---|---|---|
| security guarantee | none achievable | **none added** | **real** | real |
| RLS interaction | orthogonal | inherits base RLS | base policy narrowed; view carries the predicate | bypasses, hand-rolled |
| worker self-access | **BREAKS** | intact | intact | intact |
| authorized employer | breaks with it | unchanged | scheduling columns only | scheduling columns only |
| unrelated employer | denied (RLS) | denied (RLS) | denied (both paths) | denied (predicate) |
| admin | breaks with it | unchanged | unchanged | unchanged |
| service_role | unaffected | unaffected | unaffected | unaffected |
| app changes | n/a | none | one relation name | new RPC + call rewrite |
| migration risk | n/a | low | **modifies one existing policy** | additive |
| rollback | n/a | drop view | restore policy + drop view | drop function |
| testability | n/a | n/a | psql per role | psql per role |

**A is rejected on correctness, not preference.** `REVOKE SELECT (note,
absence_type) … FROM authenticated` is **role**-level. Supabase has one
`authenticated` role covering both the worker and the employer, so it would also
block a worker reading their own note on `/dashboard/absences`. Column
privileges cannot express *"the worker may, the employer may not"*.

**B adds no guarantee.** A `security_invoker = true` view inherits the base
table's RLS, so an employer who can read the row through the view can still read
the base table directly with every column. Ergonomics, not a boundary.

**D** gives the same guarantee as C with a worse shape: no PostgREST
filtering/ordering, a hand-rolled argument surface, and the repo treats new
SECDEF functions as RED class anyway.

## Recommended: C

1. **Narrow the base policy** so a manager reaches the full row only while the
   request is `status = 'requested'` — the window in which the note is precisely
   what they are being asked to act on. `getManagerPendingAbsences` already
   queries exactly that status, so the approval workflow is untouched.
2. **Add `public.worker_absence_scheduling`** — a definer view over approved
   absences exposing `id, worker_id, start_date, end_date, half_day, status`,
   carrying `caller_manages_worker()` as its own predicate (the same function
   the policy used, so there is one authorization rule, not two).

The view is deliberately **not** `security_invoker`: it must return rows the
narrowed policy no longer admits, so it carries the predicate itself.

**It is a real improvement, not a formality.** Today a manager can read the
free-text reason of every approved absence indefinitely. Afterwards, only while
it awaits their decision.

## Proven on a local stack

| probe | before | after |
|---|---|---|
| authorized employer → scheduling data | via base table | **via view** ✅ |
| **authorized employer → `note` / `absence_type`, approved rows** | **`PRIVATE-REASON… / sickness`** | **`(NO ROWS)`** ✅ |
| authorized employer → `note`, **pending** rows | readable | **still readable** ✅ approval workflow preserved |
| worker → own full row | readable | **still readable** ✅ |
| unrelated employer → view | — | `(no rows)` ✅ |
| unrelated employer → base table | `(no rows)` | `(no rows)` ✅ |
| pending absence shown as unavailability | — | **no** ✅ only approved projects |

## Application change (inert until applied)

`lib/planning/employer-availability.ts` reads `worker_absence_scheduling` first
and falls back to `worker_absences` on `42P01` (relation not found), with the
**same minimised column list** either way. So the app is correct on a stack with
the migration and on a stack without it, and this PR changes no behaviour in
production until the migration is approved.

## Files

- `supabase/migrations/20260808120000_worker_absence_scheduling_view_v1.sql`
- `supabase/rollbacks/20260808120000_worker_absence_scheduling_view_v1.down.sql`

## What the owner is being asked to approve

Applying a migration that **modifies one existing RLS policy** (narrowing
manager access to pending rows) and **adds one view**. No data is touched, no
grant is widened, and the rollback restores the prior policy exactly.

The one behaviour change to weigh: **a manager loses the ability to read the
reason for an absence they have already approved.** That is the intent of the
owner direction, and it is stated here explicitly rather than buried, because it
is the only thing anyone will notice.
