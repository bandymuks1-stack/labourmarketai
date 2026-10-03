# EVID contest -> withdraw -> re-contest: runtime proof (scratch PostgreSQL 16)

Transcript of `scripts/db-proof/evidence-contest-withdraw-v1.sh` (harness faithful to production per RED-4-5 proof; live 20260915180000 applied first, then 20261003110000 verbatim). Nothing here touched production.

```
==============================================================
 EVID contest / withdraw / re-contest runtime proof
 migration: 20261003110000_subject_contest_withdraw_v1.sql
==============================================================
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:156: NOTICE:  policy "harness_people_select" for relation "public.organization_people" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:158: NOTICE:  policy "harness_parties_select" for relation "public.organization_evidence_parties" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:163: NOTICE:  policy "organization_evidence_records_insert" for relation "public.organization_evidence_records" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:168: NOTICE:  policy "organization_evidence_records_select" for relation "public.organization_evidence_records" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:181: NOTICE:  policy "organization_evidence_events_attest" for relation "public.organization_evidence_events" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:187: NOTICE:  policy "organization_evidence_events_verify" for relation "public.organization_evidence_events" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:202: NOTICE:  policy "organization_evidence_events_select" for relation "public.organization_evidence_events" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:283: NOTICE:  constraint "booking_request_events_clash_receipt" of relation "booking_request_events" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:285: NOTICE:  column "related_booking_request_id" of relation "booking_request_events" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:286: NOTICE:  function public.respond_booking_request_v4(uuid,text,text,text,pg_catalog.bool) does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:287: NOTICE:  policy "organization_evidence_events_subject_dispute" for relation "public.organization_evidence_events" does not exist, skipping
psql:C:/lmw-1646/scripts/db-proof/subject-contest-and-clash-receipt.prelude.sql:288: NOTICE:  index "organization_evidence_events_one_dispute_per_actor" does not exist, skipping
  harness + live 20260915180000 applied

== BEFORE (what production holds today) =======================
  PASS  B1 withdraw function does not exist yet
  PASS  B2 subject can contest (live policy)
  PASS  B3 second contest refused by the one-per-actor index
  PASS  B4 a withdrawal cannot be written before the migration

-- applying the migration VERBATIM ------------------------------
  applied

== SCHEMA =====================================================
  PASS  S1 event set gains dispute_withdrawn
  PASS  S1b ...and keeps disputed
  PASS  S1c ...and keeps corrected
  PASS  S2 one-contest-ever index replaced
  PASS  S3 state-guard trigger exists
  PASS  S4 subject-dispute policy untouched
  PASS  S5 no UPDATE policy anywhere
  PASS  S5b no DELETE policy anywhere
  PASS  S6 SECURITY DEFINER with pinned search_path
  PASS  S7 anon has no EXECUTE
  PASS  S7b authenticated has EXECUTE
  PASS  S7c PUBLIC has no EXECUTE
  PASS  S8 trigger function not callable by authenticated

== NEGATIVE PERMISSIONS (withdraw) ============================
  PASS  N0 the existing contest from BEFORE stands; first withdraw works
  PASS  N1 unrelated person refused (42501)
  PASS  N2 organisation manager refused
  PASS  N3 NULL auth.uid() refused
  PASS  N4 anon role: permission denied
  PASS  N5 subject of record A cannot withdraw on record B (other record)
  PASS  N6 person on the roster but NOT linked is refused
  PASS  N7 unknown record gives the SAME refusal (no existence oracle)
  PASS  N8 note over 1000 chars refused
  PASS  N9 subject cannot write a withdrawal by direct insert (RLS)
  PASS  N10 events are not updatable by the subject
  PASS  N11 events are not deletable by the subject
  PASS  N12 negative cases appended nothing (1 standing contest)

== WITHDRAW / IDEMPOTENCY / HISTORY ===========================
  PASS  W1 subject withdraws a standing contest
  PASS  W2 HISTORY: both earlier 'disputed' rows still exist
  PASS  W3 two withdrawals recorded, person-attributed
  PASS  W4 withdrawing again is an idempotent no-op
  PASS  W5 the no-op appended NO row
  PASS  W6 RE-CONTEST after withdrawal is allowed
  PASS  W7 a second STANDING contest is still refused (23505)
  PASS  W8 derived current state = standing (latest is disputed)
  PASS  W9 the employer's record is untouched
  PASS  W10 no record added or removed

== PER-ACTOR PAIRING (manager vs subject) =====================
  PASS  A1 manager may contest through their own door
  PASS  A2 subject withdraws ONLY their own contest
  PASS  A3 the manager's contest STILL stands (1 standing actor)
  PASS  A4 subject has nothing left of their own: no-op, manager's untouched
  PASS  A5 outsider cannot write a withdrawal by direct insert (refused; trigger runs before RLS WITH CHECK)
  PASS  A6 withdrawal with no standing contest of the same actor refused by the guard (23514)
  PASS  A7 manager withdraws their OWN contest

== CONCURRENCY ================================================
  PASS  C1 six concurrent withdrawals append exactly one row
  PASS  C2 concurrent contests never stack two standing rows

== ROLLBACK ===================================================
  PASS  R1 rollback REFUSES while withdrawal history exists
  PASS  R2 refusal changed nothing (function still present)
  PASS  R3 rollback applies once the history question is settled
  PASS  R4 one-dispute index restored
  PASS  R5 both functions gone
  PASS  R6 event set restored
  PASS  R7 migration re-applies cleanly after rollback

==============================================================
 RESULT: 56 passed, 0 failed
==============================================================
```
