# PILOT RUNBOOK — LANE B: REAL EDUCATION INSTITUTION (production)

> Goal: `REAL_EDUCATION_INSTITUTION_USED_PRODUCT = TRUE` — a real institution
> admin, a real programme and cohort, real students, real learning evidence,
> real labour-market demand and at least one real internship / job opportunity
> matched, on production. The agent records TIME_TO_FIRST_VALUE, drop-offs,
> errors and missing capabilities; it never acts as the institution or a
> student.

## Who is needed

| Role | Real person | Account |
|---|---|---|
| Institution admin | one real staff member (vocational school / college / training provider) | new signup, intent **"I represent an education institution"** |
| Students | a bounded list (5–10) of real learners who agreed to take part | each signs up through the institution's invitation link, intent **"I'm a student"** |
| Employer (optional but valuable) | one real company willing to post an internship | intent **"I need workers"**, structured demand with type **Internship** (live after #1455) |

Prerequisites: **G-1** green before invitations go out; **RED batch B (#1454)**
applied for programmes / cohorts (B2–B3 below); without it the institution can
still invite, see participation and demand (B1, B4–B7).

## The chain, with the evidence the agent records after each step

| # | Step (what the person does) | Where | Real result | Agent records |
|---|---|---|---|---|
| B1 | Admin signs up, picks the institution intent, finishes the setup form (capability `training_provider` declared by the setup action) | `/lt/auth/signup` → onboarding → `/dashboard/start/company?capability=training_provider` | `organizations` + `organization_roles(training_provider)`; `signup_completed`, `role_selected{intent:education}` | **T0** |
| B2 | Admin creates a programme pointed at a work direction and sees **live demand** for it | company workspace → Programmes and cohorts (after #1454) | `education_programs` row; demand count from `count_public_vacancies_by_profession_v1` | **T0 → programme = TTFV (action)** |
| B3 | Admin creates a cohort | same | `education_cohorts` row | — |
| B4 | Admin invites students (bounded list) | `/dashboard/network` → invite → relationship **student** | `invitations` rows (student) | invitation → acceptance latency, drop-offs |
| B5 | Students accept: signup with the student intent, add where they study | invite link → onboarding | `engagement_contexts(student)`; `worker_education(is_current)` | per-student T0 |
| B6 | Admin assigns connected students to the cohort; sees participation | Learners section + Programmes (after #1454) | `education_cohort_members`; counts | — |
| B7 | Students log learning / practice in the Work Journal; the **Learning Compass** shows becoming / evidence / fits / missing / next | `/dashboard/journal`, `/dashboard/profile` | `journal_entries`, extracted skills; compass renders | **student TTFV (action)** = first journal entry |
| B8 | An employer posts an internship (structured demand, type Internship) — or the admin points students at real board opportunities for the programme's direction | employer demand form; student board | `customer_requests` with `structured_v2.opportunity_type = internship`; board shows it to matching students | — |
| B9 | A student expresses interest / an employer contacts a student | board → interest; scouting → contact | interest signal; disclosure / booking | **student TTFV (result)**; **institution's first real result** = a learner connected to a real opportunity |
| B10 | Admin sees outcome | today: Learners (connected) + Programmes; per-learner outcomes = later slice under least privilege | — | what the admin still cannot see (record verbatim) |
| B11 | Everyone returns the next day | — | same rows, same states | persistence ✓/✗ |

## What the agent measures (read-only)

- Admin: `signup_completed` → first programme / first invitation = **TTFV (action)**; first learner connected to a real opportunity = **TTFV (result)**.
- Students: `signup_completed` → first `journal_entry_saved` (action) → first interest / contact (result); the admin telemetry section shows medians per actor (student / education).
- Drop-off per person; `request_error` lines; every "not available yet" the admin or a student saw; the verbatim friction list → `docs/launch/pilot-feedback/<date>.md`.

## Privacy line to state before the pilot (least-privilege ruling 2026-08-27)

The institution sees: who it invited, who connected, cohort membership, programme demand. It does **not** see a learner's journal, skills, CV or profile; a learner's outcomes are the learner's. Outcome visibility for the institution will be added as **aggregates / consented signals only**, never as access to private records.

## Exit

`REAL_EDUCATION_INSTITUTION_USED_PRODUCT = TRUE` when B1, B4–B7 (and B2–B3 once #1454 is applied) are done by real people with real rows in production, at least one student reached a real opportunity (B9), and the agent recorded T0, TTFV (action/result) for admin and students, drop-offs and the friction list.
