# RED #4 + #5 — runtime proof transcript

Run: 2026-09-15T18:19:16Z · PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
Command: bash scripts/db-proof/subject-contest-and-clash-receipt.sh

```
==============================================================
 RED #4 + #5 runtime proof
 migration: 20260915180000_subject_contest_and_clash_receipt.sql
==============================================================

-- prelude + seed ---------------------------------------------
  ok

== BEFORE the migration =======================================
  PASS  B1 subject CANNOT dispute before the migration
  PASS  B2 overlapping accept is refused by v3
  PASS  B3 v4 does not exist yet

-- applying the migration VERBATIM ------------------------------
  applied

== SCHEMA_PROVEN ==============================================
  PASS  S1 receipt column exists
  PASS  S2 receipt CHECK is the iff
  PASS  S3 event_type widened by exactly one value
  PASS  S4 one-dispute index exists
  PASS  S5 subject-dispute policy exists
  PASS  S6 no UPDATE policy anywhere
  PASS  S7 no DELETE policy anywhere

== POLICY_PROVEN — RED #4 =====================================
  PASS  P1 the CORRECT subject is admitted
  PASS  P2 the dispute persisted
  PASS  P3 an UNRELATED person is refused
  PASS  P4 employer CANNOT write a dispute as the subject
  PASS  P5 subject CANNOT attest (only dispute)
  PASS  P6 dispute cannot carry a replacement record
  PASS  P7 subject CANNOT modify the underlying evidence (no grant)
  PASS  P7b RLS matches ZERO rows even WITH the grant
  PASS  P8 the employer's text is unchanged
  PASS  P9 subject deletes ZERO rows even WITH the grant
  PASS  P9b the record still exists
  PASS  P9c the migration granted authenticated no new privilege
  PASS  P10 a second dispute by the same actor is refused
  PASS  P11 subject of record A cannot dispute record B

== RUNTIME_PROVEN — RED #5 ====================================
  PASS  R1 clash WITHOUT acknowledgement is still refused
  PASS  R2 the refused booking stayed proposed
  PASS  R3 clash WITH acknowledgement proceeds
  PASS  R4 and reports exactly one clash overridden
  PASS  R5 the receipt persisted, naming its counterpart and its author
  PASS  R6 the original booking kept its dates and status
  PASS  R7 the overridden booking kept its dates
  PASS  R8 conflict detection STILL reports the overlap
  PASS  R9 a non-addressed worker is still refused
  PASS  R10 anon is refused EXECUTE
  PASS  R11 anon cannot write a dispute
  PASS  R12 no receipt exists without a counterpart

== ROLLBACK_PROVEN ============================================
  applied
  PASS  X1 v4 is gone
  PASS  X2 v3 SURVIVES the rollback
  PASS  X3 the receipt column is gone
  PASS  X4 the original event_type CHECK is restored
  PASS  X5 the subject-dispute policy is gone
  PASS  X6 a dispute already written SURVIVES — rollback removes authority, not a record
  PASS  X7 both accepted bookings survive

==============================================================
 PASS 43   FAIL 0
==============================================================
```
