# Pilot feedback — Lane A, first REAL recruiter account (2026-09-04)

> Real-user evidence and agent-side preparation are kept apart on purpose.
> Nothing below was created on the real account by the agent; every row named
> here was read, not written. No candidates, clients or demand were invented.

## Real account — production state read 2026-09-04 04:33 UTC

| Check | Result | Evidence (read-only) |
|---|---|---|
| Canonical auth user | PASS | one `auth.users` row, created 04:19:03 UTC, e-mail confirmed, provider `google`, exactly one `auth.identities` row (google), no second user with the same e-mail |
| Profile / reconciliation | PASS | one `profiles` row with the same id, `email` bound, `locale = lt`, `onboarded = false`, `active_role = null`, `active_organization_id = null` |
| Worker shell | expected | one `workers` row created at the same instant by `on_profile_created_ensure_worker` — every profile has one (52 of 52); not a duplicate identity and not a declared role |
| Company / agency / organisation rows | none | 0 companies, 0 organisations, 0 memberships, 0 roster links, 0 invitations addressed to the account |
| Telemetry (`pilot_events`) | recorded | `google_oauth_start` 04:18:57 → `login_succeeded` 04:19:06 → `signup_completed` (surface google) 04:19:07 → `onboarding_started` 04:19:07 → `role_selected {intent: agency, role_context: company}` 04:27:30 → `onboarding_step_role_completed {intent: agency}` 04:27:31 |
| Onboarding step 2 (name + country) | not submitted | no `onboarding_step_profile_completed`, no `onboarding_completed` |

T0 for this pilot = `signup_completed` 2026-09-04 04:19:07 UTC.

## What the agent found before the real user went further

**P0 — a company intent created a second company (production, 2026-09-02).**
`complete_onboarding` inserts the person's company row (an unnamed shell — with
the first-run router it would have been named "<person's name> UAB", a legal
entity nobody stated). The router then opened the setup form with `?new=1`
(create mode), so the real setup inserted a **second** company. Two
organisations + no workspace pointer = the fail-closed resolver picked none,
and `/dashboard/company` rendered "no company profile" (seen twice on the
2026-09-02 profile). The real recruiter would have hit exactly this on the
next click.

Fix (this PR, GREEN, code only):
- the router no longer sends a fresh company identity to `?new=1`;
- onboarding no longer fabricates "<name> UAB" when the first-run router is in use;
- the setup page treats a nameless owned row as the FIRST setup: creates its
  identity on that same row (create title, agency preset wins), also when
  `?new=1` is followed while a shell exists;
- `/dashboard/company` sends a nameless shell back to the setup form instead of
  showing a nameless workspace (`company_dashboard_viewed step=setup_incomplete`);
- `organization_created` fires when the shell becomes a real organisation.

**P1 — `first_real_action` / `first_real_result` were declared but never
emitted.** Now emitted on the agency bridge: server-side `first_real_action`
on invite-client / offer (agency) and accept-connection / share / decide
(client company); `first_real_result step=human` when the agency sees a
client's response (connection active, request shared, offer decided) and when
the client sees an agency's candidate on scouting. System-side value for the
agency (the real public demand card) already renders on the first workspace
visit; it carries no dedicated event yet.

## Known limits stated honestly

- Roster: the candidate offer needs an ACTIVE `company_workers` link. That link
  is created only when the invited person accepts the roster invitation
  in-app (`accept_company_worker_invitation`) after signing in with the exact
  invited e-mail. **No e-mail is sent for roster invitations** (the section
  says so) — the recruiter tells the candidate out of band. The network
  invitation (which does e-mail) creates an employment context, not a roster
  link, so it does not feed the offer form.
- Bridge authority is CREATOR-bound (`owns_company` = `companies.profile_id`).
  The real account must own its own agency company; joining an existing
  organisation as a member would not let it invite clients or offer
  candidates.
- Client-shared demand: 0 rows in production. Public market demand is real and
  imported (74,197 active vacancies, none in LT); it is context, not a client
  need the agency can work. No Agentai verified-demand bridge yet.

## Existing agencies in production (for the owner's decision, not created)

| Company | Type | Country | Verification | Owner account | Roster |
|---|---|---|---|---|---|
| Labour market ai Sp. z o.o | staffing_agency | PL | verified | second owner-side account | 1 |
| (unnamed shell) | staffing_agency | — | unverified | the owner's main account | 0 |
| E2E Proof Statyba UAB | staffing_agency | LT | active_unverified | e2e proof identity | 0 |

The new Google account owns none of them. Because bridge authority is
creator-bound, the lawful options are: the account sets up its OWN agency
identity with a real legal name (recommended), or the owner decides that an
existing agency row should be re-owned by this account (a data change the
agent will not make without that decision).

## Production proof of the fixed path (#1463 → `20c0c5dd`, 05:07 UTC) — E2E identity, NOT the real user

Bounded synthetic identity `e2e-timing-…@labourmarket.ai` (existed since 2026-09-02, never onboarded;
magic-link session, no password, no account created). Chromium 390 px against production:

| Step | Observed |
|---|---|
| onboarding → agency intent → name + country → Continue | lands on `/lt/dashboard/start/company?type=staffing_agency` — no `new=1` (12.7 s from open) |
| setup form | title "Sukurti įmonės profilį", no "existing company" card, **Personalo agentūra pre-selected**, hidden target = the onboarding row's uuid |
| save | "Įmonė išsaugota — ji aktyvi ir naudojama dabar." + workspace door |
| workspace | agency bridge rendered (not gated), real public demand card "46742 aktyvių darbo vietų · 8832 darbdavių" (17.1 s from open) |
| reload + revisit setup | bridge still there; setup shows ONE company in edit mode, type "Personalo agentūra", no ambiguity chooser |
| DB | exactly **1** company (`staffing_agency`, LT, named), 1 organisation, 1 owner membership; events `onboarding_completed{intent: agency}` → `organization_created` → `company_dashboard_viewed` |

Residue (labelled, keep or clean under G-9): company `0a26c7bf…` "E2E Agentūra UAB (testinis subjektas)".

Mobile friction measured on the agency workspace (390 px, page = 11,408 px, 22 sections):
public demand card at 1,423 px (≈1.7 screens), agency bridge at 3,036 px (≈3.6 screens), roster
invite form at 6,498 px (≈7.7 screens). Nothing is broken; the first-value surfaces are simply far
down. Candidate next slice: agency mode orders bridge + roster + demand first. Not changed here
(one measured defect per PR).

## Milestones

- REAL_RECRUITER_USED_PRODUCT = FALSE (account exists, intent clicked, nothing persisted by the recruiter yet)
- REAL_RECRUITER_FIRST_VALUE = FALSE
