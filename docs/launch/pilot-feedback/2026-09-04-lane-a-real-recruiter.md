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

## Approval package — connect the real recruiter account to "Labour market ai Sp. z o.o" (2026-09-04)

Owner decision (2026-09-04): the first real recruiter account represents the EXISTING verified staffing
agency "Labour market ai Sp. z o.o"; no duplicate company.

### Why a plain ownership transfer is NOT safe (and is not proposed)

| Fact (read from production) | Consequence |
|---|---|
| Company authority is creator-bound: `owns_company(c)` = `companies.profile_id = auth.uid()`; it gates the roster tables, roster invitations, the agency↔client bridge tables (RLS) and 20+ SECURITY DEFINER commands; the company dashboard read (`getOwnedCompanyById`) also filtered on the creator | only ONE account can ever act for a company today |
| The current creator account is live: admin, signed in 2026-09-02, owns exactly this company, active workspace = this organisation, owner membership, 8 demands, 1 roster worker, 3 engagement contexts | moving the creator pointer to the new account would leave that account with "no company profile" and no roster / bridge authority |

### What is proposed instead (two parts, one approval sentence)

**Part 1 — RED migration `20260904060000_owns_company_governance_membership_v1`** (draft PR, `needs-human-gate`):
`owns_company(c)` = creator **OR** active `owner` / `admin` membership in the organisation bound to `c`
(`organizations.legacy_company_id = c`). `create_agency_client_connection_v1` uses that one rule instead of
its inline creator test. Nothing narrows; `manager` / `external_manager` / `member` gain nothing; no table,
policy, grant or data change; rollback restores both bodies verbatim. Blast radius today: **0** — no
company currently has a second owner/admin member, so no existing account changes authority.

**Part 2 — data grant** (one transaction, applied by the agent via Supabase MCP after the sentence; rollback below):

```sql
begin;
-- 1. governance membership for the real account (admin: full company authority; not a second "owner")
insert into public.company_memberships (organization_id, profile_id, role, status, invited_by, accepted_at, source)
values ('19f47e78-7bd1-4120-9937-603dba769f8a',   -- organisation "Labour market ai Sp. z o.o"
        '875eb16b-53e7-42d9-874f-e983b5567f8a',   -- real recruiter account (worklandworkoficial@…)
        'admin', 'active',
        '6fd1bd46-52a5-4058-b478-20b2916a1665',   -- invited_by = the platform owner's profile (the approver)
        now(), 'owner-grant:lane-a:2026-09-04');
-- 2. the company role on the profile (what complete_onboarding would have written)
insert into public.profile_roles (profile_id, role, is_active, role_data)
values ('875eb16b-53e7-42d9-874f-e983b5567f8a', 'company', true, '{}'::jsonb)
on conflict (profile_id, role) do update set is_active = true;
-- 3. onboarding closed by the grant (the wizard would otherwise insert a NEW shell company);
--    name from the Google identity the person signed in with; country left unset (unknown); locale stays lt
update public.profiles set
  full_name = coalesce(full_name, (select nullif(btrim(u.raw_user_meta_data->>'full_name'), '') from auth.users u where u.id = profiles.id)),
  active_role = 'company', onboarded = true, onboarded_at = coalesce(onboarded_at, now()),
  active_organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
where id = '875eb16b-53e7-42d9-874f-e983b5567f8a';
commit;
```

Rollback of the grant (data only, no trace left):

```sql
begin;
update public.profiles set active_organization_id = null, active_role = null, onboarded = false, onboarded_at = null
 where id = '875eb16b-53e7-42d9-874f-e983b5567f8a';
delete from public.profile_roles where profile_id = '875eb16b-53e7-42d9-874f-e983b5567f8a' and role = 'company';
delete from public.company_memberships where profile_id = '875eb16b-53e7-42d9-874f-e983b5567f8a'
   and organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a' and source = 'owner-grant:lane-a:2026-09-04';
commit;
```

### What each account has afterwards

| Account | Before | After |
|---|---|---|
| real recruiter (new) | no company; onboarding step 2 pending | admin of the agency organisation: workspace opens on `/lt/dashboard/company` (bridge, roster, real demand), can invite clients, offer roster candidates, edit the company profile; **no** billing/ownership transfer |
| current creator | creator + owner membership | **unchanged** — same rows, same authority |
| roster worker, 2 employees, 8 demands, verified status | — | untouched (demands stay keyed on the creator's profile, as today) |
| everyone else | — | unchanged (proved: manager-role member, platform owner account, anon → no authority) |

### Proof done / not done (honest)

- Read-only proof on production rows: the new rule with the hypothetical grant → real account TRUE (membership arm only), creator TRUE (both arms), manager-role member FALSE, platform owner account FALSE, anon FALSE; 0 existing accounts change.
- The full rolled-back dry run (DDL + grant + per-actor readback in one transaction) was **blocked by the session's permission classifier**; it will be run as the post-apply readback instead (same checks, then the real account's first screens are verified with its own session, not by the agent).
- The GREEN app half (membership-aware company read + governed company edited, never re-created) ships separately and is harmless before the migration.

### Telemetry honesty

No `onboarding_completed` is emitted for the real account (it did not happen through the wizard); T0 stays
`signup_completed` 04:19:07 UTC. `first_real_action` starts counting from the account's first real bridge
action.

**Approval sentence:** "Apply Lane A ownership 2026-09-04" (covers Part 1 + Part 2). To choose co-owner
instead of admin, say "… as owner".

### APPLIED 2026-09-04 (owner: "Apply Lane A ownership 2026-09-04")

- Migration applied via Supabase MCP `apply_migration` → ledger `20260904055214`; `owns_company` membership-aware,
  `create_agency_client_connection_v1` uses it; ACLs unchanged (postgres + authenticated; anon none).
- Grant applied in one transaction: 1 admin membership (`owner-grant:lane-a:2026-09-04`), `company` profile role,
  profile `onboarded`, `active_role = company`, `active_organization_id` = the agency organisation, name from the
  Google identity, country left unset. **0 companies created for the account.**
- Per-actor readback (read-only, production): real account `owns_company = true`, roster 1, roster invitations 2,
  membership + organisation visible; creator account `true`, roster 1 (unchanged); unrelated account `false`,
  roster 0; anon → 42501.
- #1464 marked ready (auto-merge); #1465 (app half) auto-merging. The member path of the workspace is verified
  with an E2E member identity, never with the real account.
