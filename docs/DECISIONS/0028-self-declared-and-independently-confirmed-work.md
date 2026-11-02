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

## J-12 — a learner may ask to join (owner decision, 2026-11-02)

Owner, 2026-11-02: *"J-12: parengti besimokančiojo savarankiško prašymo prisijungti prie mokymo
grupės procesą. Mokymo įstaigos įgaliotas asmuo patvirtina narystę, praktiką ir atliktus darbus.
Besimokantysis gali pildyti savo istoriją ir be įstaigos patvirtinimo, aiškiai nurodant deklaravimo
lygį."*

This settles ARCH-3 for EDU-2: a learner joins a cohort either by the institution's invitation
(existing) or by **their own request**, which the institution's authorised person accepts or
declines. Rules:

1. The request is a state of the one membership row (`education_cohort_members`), never a second
   store. A request grants nothing: no programme or cohort read, no member count, no relationship.
2. Only groups the institution has opened for requests are findable, and only by signed-in people.
3. The authorised person is the same authority that confirms the learner's journal (rule J-12.2
   above): a manager of the institution. Nobody decides their own request.
4. Accepting creates the `student` relationship the learner asked for, exactly as an accepted
   invitation does; journal entries in that context then become reviewable by the institution.
5. The institution sees only the name the learner typed on the request and an optional note.
6. With or without an institution, the learner keeps recording their own practice, and it reads
   as their own declaration until the institution confirms it (J-12.3).

Build: PR #2959, migration `20261102160000_education_cohort_join_requests_v1` (RED draft, not applied; owner apply, then a production walk).

## D-15 — recognition of prior learning is a separate, later stage (design only, 2026-11-02)

Owner, 2026-11-02: *"D-15: darbo patirties registravimas lieka esamo funkcionalumo dalimi.
Formalų ankstesnės patirties pripažinimą kvalifikacijai projektuoti kaip atskirą etapą,
nesuteikiant kvalifikacijų automatiškai."*

**Recording stays where it is.** Work experience is recorded by the existing journal, organization
history and Living CV (decisions 0023, 0025) — no new recording path, no RPL-specific journal.

**Recognition is a different act, by a different person, at a different time.** It extends the
RECOGNITION / RPL node of the canonical architecture (§1.9, realised by SKL-9 / SKL-10 / EDU-4)
under the §1.10 authority rule (ARCH-2). No new module, route or store is introduced by this
design; the parts below name what already exists and the one structure §1.10 already defers.

The procedure, in order:

| Step | Who | What it reads or writes | Exists today |
|---|---|---|---|
| 1. Request (optional) | the person | asks a named assessing organisation to assess them against one formal requirement | not built — a later, owner-gated step |
| 2. Evidence | the system | the person's existing journal entries and Living CV, each with its evidence state kept (recorded / declared / confirmed / certified — decision 0023); declared work may be shown to the assessor as context, but only independently confirmed entries may be **cited** | yes — `competency_recognitions` refuses citing an unconfirmed entry |
| 3. Assessment | an authorised independent assessor (training/education provider, sector body, public body — never the beneficiary, never a self-interested employer) | the assessor's own method (interview, practical test, portfolio review) — the platform records that it happened and by whom, it does not perform it | partly — the assessor role and independence checks exist in `record_competency_recognition_v1` |
| 4. Decision | the same assessor | one recorded act: recognised / not recognised, against which requirement, on which evidence, valid until when, revocable with a reason; the person always sees it | yes for competencies (`competency_recognitions`); the formal-requirement equivalence structure (`11.10`) stays deferred under §1.10 |
| 5. Qualification | the competent body, outside the platform unless it acts on it | a formal qualification is awarded only by the body entitled to award it, under its procedure | never by the platform |

**Never automatic.** No count of hours, no number of confirmations, no AI reading and no skill
level ever produces a recognition or a qualification. `apply_learning_auto_confirmation` may at
most mark a skill confirmed under an organisation's own policy; it never writes a recognition and
never a qualification. SEP-6 holds: demonstrated capability alone never satisfies a formal
requirement (`hasRecognizedEquivalence` stays false until step 4 exists for that requirement).

**One ledger.** Recognition reads the hours; it never adds, moves or re-counts them (the common
principle above).

**What is still the owner's.** The first assessing organisation and the requirement set
(country, sector) it assesses against — the open question in
`docs/plans/not-implemented-architecture-2026-10-23.md` §H. Building step 1 or the 11.10
structure before that answer serves nobody.
