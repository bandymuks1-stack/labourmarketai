# PILOT LANES — FIRST REAL ECOSYSTEM USE (opened 2026-09-03)

> Pilots are part of development from now on (owner mandate 2026-09-03). Each
> lane is ONE real organisation or person, one short checklist, and the same
> measurements. Feedback reprioritises the tracks; it never fragments the
> canonical architecture (`docs/ARCHITECTURE.md` §6–§7).
>
> What is measured (from `pilot_events`, no new schema): `signup_completed`,
> `role_selected` (+ `intent`), `onboarding_started`, `onboarding_completed`,
> `first_real_action`, `first_real_result`, drop-off between them, errors
> (`request_error` lines), and — the key metric — **time to first real value**
> per actor (signup → first real result).

## Lane A — real recruiter / agency

Entry: `https://labourmarket.ai/lt/signup` → intent **"I'm a recruiter / agency"** →
company setup (type pre-selected: staffing agency).

| # | Step | Where | Real result expected | Status 2026-09-03 |
|---|---|---|---|---|
| A1 | Sign up (e-mail or Google) and land on the agency's company setup | onboarding → `/dashboard/start/company?type=staffing_agency` | company row, `company_type = staffing_agency` | LIVE (#1447) |
| A2 | Invite a worker to the roster | company page → team invite (`/dashboard/network`) | `company_workers` row after the worker accepts | LIVE (bridge #859) |
| A3 | Connect a real client company | company page → agency bridge → invite client | `agency_client_connections` row; client accepts | LIVE, **0 rows in prod** — first real use is the proof |
| A4 | Client shares a demand; agency offers a roster worker | client company page → share; agency → offer | `agency_candidate_offers` row (`offered`) | LIVE, 0 rows |
| A5 | Client acts on the candidate | client scouting page → contact / propose booking | booking → worker accepts → `company_worker_engagements` | LIVE via booking; explicit accept/decline record = RED #1448 |
| A6 | Agency sees placement progress | agency company page → offer progress (`review_stage`) | stage reflects booking/engagement | LIVE |
| A7 | Log out, log in tomorrow, everything is still there | — | same workspace, same rows | LIVE |

Success = A1–A7 completed by one real agency with one real client within a week; TTFV target < 1 day.

> **Status 2026-09-03 (window 2):** A3–A7 + the candidate's acceptance (runbook A4–A8) are **PROD-PROVEN at the DB level** in one rolled-back transaction (agency invite → client accept → share → offer → client accept = booking → agency progress → candidate accept = engagement; outsider sees 0; agency cannot decide its own offer). Zero residue. What remains is the real people and the UI walk with them.

## Lane B — real education institution (+ its students)

Entry: signup → intent **"I represent an education institution"** → company setup
(capability `training_provider` declared by the setup action).

| # | Step | Where | Real result expected | Status |
|---|---|---|---|---|
| B1 | Sign up, create the institution | onboarding → `/dashboard/start/company?capability=training_provider` | organisation with `training_provider` role | LIVE (#1447; declaration best-effort, card fallback) |
| B2 | Invite students (bounded list, one link each) | `/dashboard/network` invite panel → relationship **student** | `relationship_invitations` rows | LIVE (PROD_VERIFIED 2026-08-27) |
| B3 | A student accepts and gets the student context beside any job | invite link → signup with intent **"I'm a student"** | `engagement_contexts` `student` row; current `worker_education` row | LIVE (#1447 + institution link v1) |
| B4 | Student records learning / practice in the Work Journal | chat-first home → journal | `journal_entries` + extracted skills | LIVE |
| B5 | Institution sees participation | company workspace → "Learners" section | connected count + every sent student invitation with its state | SHIPPED (#1450, Track C slice 1) — learner activity itself stays out of the institution's view by the least-privilege ruling |
| B6 | Students see relevant opportunities (internships / first jobs) | opportunity board | real board rows | LIVE for jobs; internship as a demand kind = MISSING (RED vocabulary) |
| B7 | Institution sees outcomes | — | placement/employment state per learner | MISSING (Track C slice 2) |

Success = one real institution with ≥ 5 real students through B1–B4 within two weeks; B5 shipped before the second week.

> **Status 2026-09-03 (window 2):** the pilot walk (reading production as the institution manager and as a learner) found that **programmes / cohorts / members are unreadable in production** — `42P17` policy recursion in batch B — so the programmes section renders "—" and the runbook's B2/B3/B6 are unreachable until **#1457 (RED batch D, owner queue row 0)** is applied. B1, B4, B5 (invite → learner → Learners section), B7 (compass, now with the student's own cohort view #1458) and B10 (aggregates) are unaffected. Do not send student invitations for a programme pilot before D is applied.

## Lane C — real worker + employer loop

| # | Step | Where | Real result expected | Status |
|---|---|---|---|---|
| C1 | Worker signs up (intent "looking for work"), profession chosen | onboarding → guided profile setup | worker + profession row | LIVE |
| C2 | Worker logs first work / imports CV | journal or CV import | entries, skills, living CV | LIVE (PROD_VERIFIED) |
| C3 | Worker sees the 3-best board and expresses interest | opportunity board | `interest` signal row | LIVE (PROD_VERIFIED) |
| C4 | Employer signs up (intent "I need workers"), describes a need in plain words | onboarding → company setup → chat "Need 12 formwork carpenters in Rotterdam from Monday" | structured `customer_requests` row | LIVE (NL→demand intake; headcount survives the language it was written in since #1303, merged 2026-08-28) |
| C5 | Employer sees matching workers and invites / contacts | scouting page | disclosure request, booking | LIVE |
| C6 | Both return later; state intact | — | — | LIVE |

Success = one real employer demand matched to one real worker interest with a booking within a week.

## Collection

- Activation and drop-off: `pilot_events` by `profile_id`, event order above.
- Errors: `request_error` JSON lines (Vercel logs) filtered by the pilot window.
- Questions / missing functionality: owner notes → `docs/launch/pilot-feedback/<date>.md` (create on first entry).
- Successful matches/actions: rows in `customer_requests`, `agency_candidate_offers`, `booking_requests`, `company_worker_engagements`, `journal_entries` created by pilot identities.

Owner-side prerequisites: none for Lane C; Lane A needs one real agency + one real client company; Lane B needs one institution admin and a bounded student list. Real e-mail delivery proof (G-1) should land before Lane B invitations go out.
