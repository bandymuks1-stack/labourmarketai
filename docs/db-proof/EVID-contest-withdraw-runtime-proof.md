# EVID contest -> withdraw -> re-contest: runtime proof (scratch PostgreSQL 16)

Transcript of `scripts/db-proof/evidence-contest-withdraw-v1.sh`. It replays the REAL prod lineage for this table: the M1h constraint block of 20260924100000 (`_chk`, incl. source_preserved), then 20260915180000, then 20261003110000 (reproducing the two-CHECK defect: D1/D2), then the reconcile fix 20261003140000. The earlier 56-assertion transcript did NOT replay 20260924100000 and so missed that defect. Nothing here touched production.

```
==============================================================
 EVID contest / withdraw / re-contest runtime proof
 migration: 20261003110000_subject_contest_withdraw_v1.sql
==============================================================
  harness + live 20260915180000 applied
  20260924100000 M1h replayed (prod lineage)

== BEFORE (what production holds today) =======================
  PASS  B1 withdraw function does not exist yet
  PASS  B2 subject can contest (live policy)
  PASS  B3 second contest refused by the one-per-actor index
  PASS  B4 a withdrawal cannot be written before the migration

-- applying the migration VERBATIM ------------------------------
  applied

== DEFECT REPRODUCTION (20261003110000 alone on the real lineage) =
  PASS  D1 the defect state has TWO event_type CHECKs
  PASS  D2 withdraw RPC fails closed (23514) under the intersection
-- applying the reconcile fix VERBATIM --------------------------
  applied

== SCHEMA =====================================================
  PASS  S1 event set gains dispute_withdrawn
  PASS  S1b ...and keeps disputed
  PASS  S1c ...and keeps corrected
  PASS  S1d ...and keeps source_preserved
  PASS  S1e exactly ONE event_type CHECK remains
  PASS  S1f ...and it is the canonical _chk
  PASS  S1g type attested still insertable (postgres/owner path)
  PASS  S1g type attestation_withdrawn still insertable (postgres/owner path)
  PASS  S1g type withdrawn still insertable (postgres/owner path)
  PASS  S1g type reinstated still insertable (postgres/owner path)
  PASS  S1g type disputed still insertable (postgres/owner path)
  PASS  S1g type corrected still insertable (postgres/owner path)
  PASS  S1g type source_preserved still insertable (postgres/owner path)
  PASS  S1h independently_verified still insertable
  PASS  S1i verification_withdrawn still insertable
  PASS  S1j an unlisted type is still refused
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
  PASS  R6 rollback leaves ONLY _chk, without dispute_withdrawn, with source_preserved
  PASS  R6b ...only the canonical name
  PASS  R6c ...source_preserved kept
  PASS  R7 migration re-applies cleanly after rollback
  PASS  R8 fix re-applies (idempotent)
  PASS  R9 fix applied twice in a row is a no-op
  PASS  R10 withdraw works after the full chain
  PASS  R11 fix rollback applies with no withdrawals
  PASS  R12 fix rollback = pre-#2138 prod state (only _chk)
  PASS  R12b ...no stale _check

==============================================================
 RESULT: 79 passed, 0 failed
==============================================================
```
