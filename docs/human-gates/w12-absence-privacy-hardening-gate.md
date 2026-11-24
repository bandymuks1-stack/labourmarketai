# HUMAN GATE — W12 employer absence privacy hardening

Migration: `supabase/migrations/20260808120000_worker_absence_scheduling_view_v1.sql`
Rollback:  `supabase/rollbacks/20260808120000_worker_absence_scheduling_view_v1.down.sql`
PR: #1089

State: `W12_ABSENCE_PRIVACY_APPROVED_APPLY_IN_PROGRESS`

## OWNER DECISION — GIVEN 2026-08-08

The owner approved the **product direction** of #1089 in the session command
that opened this work, in these terms:

> General employer planning access must expose only minimum necessary
> scheduling information.
>
> Employer may know:
> - worker is unavailable;
> - relevant dates/times;
> - scheduling consequence.
>
> Employer must not retain general planning access to unnecessary private
> absence details after approval.
>
> The previously reported consequence is ACCEPTED: after privacy hardening, a
> manager may lose access to the private absence reason once that absence is
> approved. This is intentional under the minimum-necessary privacy model.

The same command was explicit that product approval is **not** technical
approval: *"You must STILL verify both PRs technically before merging/applying
anything. Do not blindly merge old draft migrations. Re-derive them against
CURRENT main."* That verification is recorded below and it **changed the PR** —
see the defect section.

## Checksums the approval binds to

- migration sha256 `530c262ccd0ee0b24cc522a6541d63fbce9798b2137133396654b5c1507917a7`
- rollback sha256 `dfd7b275da9009db0ee3a2cd32336ea21733adc94bc708672d08f872af3d2ca4`
- comment-stripped **executable** sha256
  `f544129d893386090f3bb2ce9ba7dd5a2d2f233714c5e6db3b2f445d29d9a1ad`
  (recompute: `grep -v "^\s*--" supabase/migrations/20260808120000_worker_absence_scheduling_view_v1.sql | sha256sum`)

The SQL is **unchanged** from the reviewed draft. The pre-merge fix described
below touches application code and a guard only.

## What the migration does

1. **Narrows** `worker_absences_select`: a manager reaches the full row only
   while `status = 'requested'` — the window in which the free-text note is
   precisely what they are being asked to act on. Self and admin branches are
   byte-identical to before.
2. **Adds** `public.worker_absence_scheduling` — a definer view over
   **approved** absences exposing `id, worker_id, start_date, end_date,
   half_day, status` and nothing else, carrying `caller_manages_worker()` as
   its own predicate (the same function the policy used, so there is one
   authorization rule, not two).

No data is touched. No grant is widened (`anon` is revoked; only `authenticated`
gains SELECT on the new view). The rollback restores the prior policy exactly.

## Migration-safety findings the owner is asked to accept

`migration-safety` GREEN, two findings bypassed by `@human-gate-approved`:

1. **grant-or-revoke** — the `revoke all … from anon` + `grant select … to
   authenticated` on the new view.
2. **alter-drop-policy** — replacing `worker_absences_select`. This IS the
   change; it cannot be expressed without it.

Zero structural findings: paired rollback present, no timestamp collision with
main, migration count re-derived **190 → 191** (`git ls-tree origin/main` = 190
`.sql` files; this branch = 191), both ratchet pins bumped with documented
comments.

## DEFECT FOUND DURING PRE-MERGE VERIFICATION — fixed in this PR

The application fallback recognised only `42P01`. PostgREST answers a request
for a relation missing from its schema cache with **`PGRST205`** and never
reaches Postgres, a fact already established in this repo
(`lib/agency/clients-model.ts`, pinned by its test).

Consequence had it merged unfixed: between merge and apply,
`getEmployerWorkerAvailability()` returns `error`, and
`/dashboard/company/planning` renders its availability section only on `ok` —
so the W12 employer capability shipped in #1087 would have **silently vanished
from production** for the duration of the gate. The PR's own claim to be "inert
until applied" would have been false.

Fixed (`MISSING_RELATION = {42P01, PGRST205}`) and pinned by a new case in
`lib/guards/w12-employer-availability.test.ts` which drives the real module with
each code. Mutation-checked: reverting to `{42P01}` fails it with
`code PGRST205 must not degrade to error: expected 'error' to be 'ok'`.

## Proof on record

- **DB proof** `scripts/db-proof/w12-absence-privacy.sh` — **23 passed, 0
  failed** on a throwaway `postgres:15` container (never the shared local
  stack, never production), executing the migration and the rollback verbatim,
  every probe under `set local role authenticated`/`anon`:
  BEFORE the exposure reproduces (`PRIVATE-REASON… / sickness`);
  AFTER the authorized employer reads scheduling data via the view and gets
  `NO ROWS` for the approved reason on the base table; the pending-approval
  workflow still reads its note; worker self-access is byte-identical; the
  unrelated employer gets nothing from either relation; admin unchanged; anon
  denied on both; the view carries no `note`/`absence_type` column at all; no
  write grant was added; ROLLBACK restores the prior read and RE-APPLY is
  clean.
- **Write paths unaffected by construction**: request/review/cancel are
  SECURITY DEFINER RPCs (`20260718150000`), so narrowing a SELECT policy cannot
  break approval.
- Guard `apps/web/lib/guards/w12-employer-availability.test.ts` — 12/12,
  including the new missing-relation case.
- Local quality: typecheck clean, lint 0 errors (24 pre-existing warnings),
  vitest 14454/14454 after re-running one unrelated cold-start timeout
  (`lib/cv/extract-hardening.test.ts`, passes in isolation; green on CI).

## THE APPLY QUESTION

> Approve applying `20260808120000_worker_absence_scheduling_view_v1`
> (executable sha256 `f544129d893386090f3bb2ce9ba7dd5a2d2f233714c5e6db3b2f445d29d9a1ad`)
> to production `gorgitwvdzxbnaxhrsrw` via Supabase MCP `apply_migration`?

**ANSWERED YES** by the owner decision above, whose stated accepted consequence
is exactly this migration's one behaviour change.

## Ordering note (migration ratchet collision with #1091)

#1089 and #1091 both bumped the ratchet 190 → 191 and cannot both land
unchanged. There is no dependency between them. #1089 lands first on the lower
migration timestamp (`…120000` < `…130000`), keeping filename order and apply
order identical; #1091 then re-derives **191 → 192** against the new main.
