# 0028 — Self-declared work and independently confirmed work (owner decision, 2026-11-02)

Status: **BINDING.** Owner architectural clarification for journeys J-2 and J-12, 2026-11-02.
It resolves open owner decision **EVID-2** and replaces any reading of it as "a worker may not
confirm their own hours".

## The owner revoked a total ban

The earlier instruction to forbid a worker from confirming their own work-journal hours is
**revoked**. What is forbidden is a person presenting themselves as the **independent confirmer**
of their own work — never the person's own declaration.

## J-2 — every person's own journal (binding)

1. Every person may create, fill, correct and confirm their own work journal on their own,
   whether or not an employer is registered on LabourMarket.ai.
2. A self-confirmation is a lawful **personal declaration**. It is not a confirmation by an
   employer or any other independent party.
3. The system keeps self-declared experience clearly apart from experience confirmed by an
   employer, a project manager or another authorised person.
4. The Living CV keeps both categories and never counts the same work hours twice.
5. An employer who joins later can confirm work declared earlier; the entry keeps its history.
6. EVID-2 forbids the false presentation of oneself as the independent confirmer — not
   self-declaration.
7. Journal functionality is never stopped because the employer is not registered.

## J-12 — education and training institutions (binding)

1. A learner fills their own history of work, practice and learning.
2. Completed work, practice hours and achievements are confirmed independently by an
   authorised person of the institution: a teacher, a practice supervisor or another assigned
   responsible person.
3. Until confirmed, the data stays the learner's declared history.
4. The institution's confirmation is bound to the specific work, hours, competency and the
   confirmer's identity.
5. A formal qualification is never granted automatically without a defined assessment
   procedure.

## Common principle

**One person — one work journal — one hours ledger.** Confirmation levels never change or
duplicate the actual hours; they raise the record's trust and evidential value. This extends
decision 0025 (one continuous professional history) and decision 0023 (evidence states
recorded / declared / potential / confirmed / certified stay apart).

## How the existing system relates (to be checked rule by rule, not assumed)

- The independent-confirmation table `journal_entry_confirmations` refuses the subject as
  confirmer at one choke point (`journal_entry_confirmations_guard()` →
  `journal_entry_review_authority_v1`, migration `20261003150500`, live since 2026-10-03).
  That is rule 6, already enforced.
- Legacy self-confirmations written before that date read as self-confirmed, never as an
  employer's word (#1640, #2770).
- Before any further EVID-2 change, the current data model is checked against every numbered
  rule above and only the minimal change for a rule that is not met is proposed, keeping every
  working scenario (owner instruction). Executor: the J-2 lane in
  `docs/program/COORDINATION_REGISTER.md` §3.1a.

## Consequence for the registers

J-2 is not counted as blocked or broken merely because a person confirms their own declared
history. Row 2.20 is re-proven against this decision by a production walk.
