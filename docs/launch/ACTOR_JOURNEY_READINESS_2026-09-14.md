# Actor journey readiness — prepared for the owner's HUMAN_UI_PROVEN walks

Written 2026-09-14, after Steps A–D. Purpose: make each actor chain walkable
end to end with the least possible setup, and say honestly what a walk will
find — including the places where a capability is deliberately inert.

**Nothing here is HUMAN_UI_PROVEN.** Every "automated" line below is a machine
confirming that code runs or text is present. That is not a person confirming a
screen is understandable, and the two must never be conflated. The count stays
**17 of 106**.

---

## One-time setup (all actors, ~10 minutes)

From `docs/TESTING.md`, unchanged — no new setup was introduced:

```bash
npx supabase start            # local stack (first run pulls images)
npx supabase db reset         # every migration onto a clean local DB
pnpm db:fixtures:local        # seeded identities (LOCAL-ONLY, hard-guarded)
pnpm -C apps/web e2e:local    # boots the app on :3100 with local URL/keys
```

Seeded identities, all password `password`, pre-confirmed:

| Identity | Walks as |
|---|---|
| `dev.worker@local.test` | the WORKER — active employee engagement at Dev Construction, journal review enabled |
| `dev.company@local.test` | the EMPLOYER / company owner — and the INSTITUTION (see below) |
| `dev.agency@local.test` | the AGENCY |

**No institution identity is needed and none was added.** The institution
walks as `dev.company@local.test` owning an education organization — which is
exactly ARCH-1's ruling that INSTITUTIONS are realized by existing
capabilities, not a duplicate module. `tests/e2e/education-pilot-institution.spec.ts`
already drives it that way.

**One caveat that will otherwise waste a walk:** the local DB is reset to
*every migration*, including the **nine** that production has NOT applied
(seven owner-gated drafts from July, plus the two this wave added). So several
capabilities will WORK locally that are inert in production — see the drift
report (`SCHEMA_DRIFT_REPO_VS_PRODUCTION_2026-09-14.md`, §4). Do not conclude
from a successful local walk that these are live for real users.

*(This line said "six" when this document was written. Seven was correct then
and nine is correct now — the same prose-drifting-from-its-own-table defect
the drift report itself had to correct. Counted from the tree, not summed.)*

---

## WORKER — record work, build evidence, find work

**Entry:** `/dashboard` → `/dashboard/journal`

| Step | Automated coverage today | What only a person can judge |
|---|---|---|
| Log a day's work in own words | `journal.spec.ts`, `journal-chat-intake.spec.ts`, `journal-ru-loop.spec.ts` | whether the composer feels like writing, not filing |
| Manager confirms it | `journal-confirm-loop.spec.ts` | whether the worker can tell what changed |
| Evidence counts on the profile | **Step A1** unit guards + recording-client | whether the numbers read as *their* work |
| Documents / country readiness | `documents-hierarchy.spec.ts`, `document-journal-draft.spec.ts` | whether "what's missing" is actionable |
| See opportunities + what each needs | `opportunities-hierarchy.spec.ts`; **Step B3** ledger guards | whether the ledger answers "should I raise my hand" |
| Export their own data | **Step C** `export-data.test.ts` + completeness guard | whether the bundle is legible to a non-engineer |

**Fixed in this PR and worth looking at closely:** journal counts now exclude
deleted and superseded entries (A1 — production had one worker showing 22 where
13 is true, and another showing 1 for an entry they had retracted); the
opportunity card now shows what that opportunity would require of them (B3).

**Known inert:** "already seen" marks on the board (`worker_opportunity_seen`,
unapplied migration). Works locally, not in production. The same is now true
of **saved searches** (DEM-8, `worker_saved_searches`): locally the strip
appears above the board and a saved question can be saved, opened and deleted;
in production the strip does not render at all until the owner applies
`20260914140000`. That invisibility is the honest state, not a bug to report.

## EMPLOYER — describe need, find people, decide

**Entry:** `/dashboard` → `/dashboard/company`

| Step | Automated coverage today | What only a person can judge |
|---|---|---|
| Describe a need without retyping | `employer-no-retyping.spec.ts`, `demand-flow.spec.ts`, `demand-draft-flows.spec.ts` | whether the intake feels shorter than a form |
| Org context and roles | `w8-employer-org-context.spec.ts`, `company-role-simplicity-smoke.spec.ts` | whether "who am I here" is ever confusing |
| See matched people with reasons | `opportunities-hierarchy.spec.ts` | whether the *why* is believable |
| Workforce capacity / gaps | **Step A2** capacity-model guards | whether an unknown reads as unknown, not as a shortfall |

**Fixed in this PR:** an unrankable language level is no longer reported as
"does not speak it" (A2) — it now appears as `unknownWorkerIds` rather than
silently inflating a headcount shortfall.

**New in the approved wave, and worth walking closely:**

- **Assigning someone now says what they are already committed to** (CAL-7).
  Assign a roster worker to a project whose dates overlap their accepted
  booking or approved leave; the notice appears under the assign form. It does
  not block — that is deliberate (SEP-2) — and it says "could not confirm"
  rather than "free" when a read did not answer. Production has 3 active
  project assignments and 1 accepted booking, so a real collision is
  reachable; approved absences are 0, so the absence arm has nothing to show.
- **The planning zone states how much of the next four weeks is spoken for**
  (CAL-9), in worker-days against calendar days, with the denominator written
  on the line. Look for the sentence saying it is not an FTE figure — that is
  the point of the whole design, not a caveat.
- **A project stage can show what comparable finished stages took** (CAL-10).
  **Production holds 1 stage and 0 finished stages with recorded actual
  dates**, so this will render NOTHING on a production-shaped walk. That is
  correct: below three observations there is no median to show. To see it,
  create and complete three stages with the same name locally.

**Known blocked (owner decision):** an org MANAGER cannot read the worker
roster — `owns_company` deliberately excludes managers (ORG-5, RED). If you
walk as a manager rather than the owner, expect an empty roster; that is the
authority boundary, not a bug.

## AGENCY — represent supply, place people

**Entry:** `/dashboard` → agency workspace (company workspace, `staffing_agency` type)

| Step | Automated coverage today | What only a person can judge |
|---|---|---|
| Candidate pool and offers | `admin-drafts-panel.spec.ts`, pool readers | whether the pool feels like people, not rows |
| Client connections | live `agency_client_connections` | whether the connection model matches how agencies work |

**Known inert:** the fuller `agency_clients` model is an unapplied,
owner-gated migration (ORG-8). Locally it works; in production
`lib/agency/clients.ts` degrades honestly to unavailable.

**Structurally impossible today:** offering a brigade as a UNIT against a
specific demand — the consent relation is demand-scoped in the plan and
`team_enquiries` is org-scoped (B4/DEM-6, owner decision). Production holds
**0 teams**, so this chain has nothing to walk regardless.

## INSTITUTION — programmes, cohorts, learner outcomes

**Entry:** as `dev.company@local.test`, education organization

| Step | Automated coverage today | What only a person can judge |
|---|---|---|
| Programme + cohort | `education-pilot-institution.spec.ts` | whether the model matches how a school thinks |
| Learner view | `education-pilot-student.spec.ts`, `education-pilot-institution-learner.spec.ts` | whether a learner sees their own progress honestly |

**Known blocked (owner decision):** RPL / prior-learning recognition has no
write path — deferred by ARCH-2. Production: 0 training providers, 0 evidence
events.

**Reachability note:** `/dashboard/learning` is classified GATED_PREVIEW with
guard-enforced zero inbound links, parked pending owner decision F-N1. To walk
it you must type the URL; that is deliberate, not a broken link.

## PUBLIC VISITOR — arrive, understand, decide to join

**Entry:** `/` → `/labour-market` → `/labour-market/[country]` → `/work-abroad`

This is the one chain with real **browser** evidence in CI, and Step B added to
it: `tests/e2e/country-readiness-public.spec.ts` opens the per-country page in
Chromium and asserts the requirements section renders, all four mobility scopes
appear, each requirement carries a source link and review date, and a
`needs_legal_review` statement is visibly marked rather than dressed as settled
law. Five tests, verified passing against a local `next start` before being
added to the e2e-smoke subset (floor raised 27 → 32).

Also public and walkable: `/match-preview` — an anonymous fit preview. Step D
established it is NOT a duplicate of the matching engine (different
permissions, provenance, lifecycle and intent); it deliberately reports blocker
verdicts and no score, because typed input carries no evidence.

---

## What a walk cannot tell you, by construction

- **Production is not the local DB.** NINE migrations are unapplied by owner
  gate, so several capabilities behave differently in the two places.
- **Production is nearly empty.** 0 teams, 0 assets, 0 asset assignments,
  0 training providers, 2 worker achievements, 5 work-hour allocations,
  7 company-worker rows. Most "empty" screens are honest emptiness, not
  breakage — the reality principle (doctrine §18) means they say so.
- **No automated evidence promotes a capability to HUMAN_UI_PROVEN.** Only the
  owner's own walk does.
