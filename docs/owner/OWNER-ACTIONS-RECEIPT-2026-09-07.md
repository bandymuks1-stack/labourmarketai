# OWNER ACTIONS — RECEIPT, 2026-09-07

Four things this session could not do itself. Each is recorded in the format the
owner asked for: **CURRENT STATE / REQUIRED STATE / EXACT CONTROL / HOW TO
VERIFY**. None of them is claimed as done. Where a state is asserted below it
was **read from production on 2026-09-07**, not inferred.

> The production database URL and project ref appear **nowhere** in this
> repository — not in source, tests, comments, logs or documentation. The
> controls below are described by their path, and the owner supplies the
> identifier from their own dashboard.

---

## 1. Supabase Auth — OTP expiry — ✅ **RESOLVED 2026-09-07**

**OUTCOME.** The owner changed the production value from **14400 → 3600
seconds**. Verified from this session, not taken on report: the security
advisors were re-read live afterwards and `auth_otp_long_expiry` **no longer
appears anywhere in the security list**. This is the verification §"HOW TO
VERIFY" below demanded, so the item is recorded done.

The original statement of the problem is kept below unedited, because a closed
finding is evidence and deleting it would leave nothing showing what was fixed.

**CURRENT STATE (as first measured, now historical).** Not compliant. The
security advisor `auth_otp_long_expiry` fires on the production project, read
live on 2026-09-07:

> *"We have detected that you have enabled the email provider with the OTP
> expiry set to more than an hour. It is recommended to set this value to less
> than an hour."*

**REQUIRED STATE.** Email OTP expiry **≤ 3600 seconds (1 hour)**.

**EXACT CONTROL.** Supabase Dashboard → the labourmarket.ai project →
**Authentication** → **Sign In / Providers** → **Email** → **Email OTP
Expiration**. Set to `3600` or lower. Save.
(Equivalent API field: `mailer_otp_exp` on the project's auth config.)

**WHY IT IS NOT DONE HERE.** No tool available to this session can write
Supabase Auth configuration. The Supabase MCP server exposes migrations, SQL,
advisors, logs, branches, edge functions and keys — it exposes no auth-settings
write. This is an owner-only dashboard action.

**HOW TO VERIFY.** Re-run the security advisors for the project and confirm
`auth_otp_long_expiry` no longer appears. From this repository that is
`mcp__Supabase__get_advisors` with `type: "security"`; from the dashboard it is
Advisors → Security. **Do not record this as done until that advisor is gone.**

---

## 2. Supabase Auth — leaked-password protection — ⛔ **BLOCKED_BY_PLAN**

**OUTCOME.** The owner attempted to enable it. **Supabase refused: the
project's current plan does not offer HaveIBeenPwned protection.**

This is therefore **BLOCKED_BY_PLAN — not unresolved implementation work, and
not an owner action still outstanding.** Nothing in this repository, and no
dashboard action on the current plan, can clear it. It becomes actionable again
only on a plan change, which is a commercial decision and not a technical one.

The advisor **still fires**, re-read live from this session after the attempt,
and it will keep firing while the plan stands. That is expected and must not be
read as the action having been skipped. Any future sweep that finds this advisor
should resolve it against this section rather than re-raising it as new work.

The original statement is kept below unedited for the same reason as §1.

**CURRENT STATE (as first measured).** Not compliant.
`auth_leaked_password_protection` fires on the production project, read live on
2026-09-07:

> *"Supabase Auth prevents the use of compromised passwords by checking against
> HaveIBeenPwned.org. Enable this feature to enhance security."*

**REQUIRED STATE.** Enabled.

**EXACT CONTROL.** Supabase Dashboard → the labourmarket.ai project →
**Authentication** → **Policies** (Password settings) → **Leaked password
protection** → enable. Save.
(Equivalent API field: `password_hibp_enabled`.)

**WHY IT IS NOT DONE HERE.** Same reason as §1 — owner-only dashboard setting,
no write path from this session.

**HOW TO VERIFY.** As §1: the advisor must disappear from the security list.
**Do not record this as done until it has.**

---

## 2b. The two approved migrations -- APPLIED AND VERIFIED 2026-09-07

**OUTCOME.** The owner approved both by name and set the apply order. Both were
applied via Supabase MCP `apply_migration` -- never `db push`, because the
repository filenames and the production ledger versions are not equivalent and a
push would try to replay already-applied migrations.

| repository file | ledger version | state |
|---|---|---|
| `20260907153000_employer_supply_discovery_v1.sql` | `20260907180546` | applied, verified |
| `20260907114500_organization_evidence_import_v1.sql` | `20260907180944` | applied, verified |

Neither file's content was modified while applying it. No permission was
broadened beyond what the reviewed text already granted. Nothing unrelated was
bypassed. Both remain RED class: the marker they now carry records that the
human gate was passed, it does not reclassify them.

### What was verified afterwards, read live from production

**`employer_supply_discovery_v1`.** The function exists, is `security definer`
with `search_path=public`, and `EXECUTE` is held by `authenticated` only. `anon`
is refused at the privilege level -- `42501: permission denied for function` --
so it never reaches the body at all. Called through the REAL applied function
under three real users' own auth contexts:

| caller | rows |
|---|---|
| A manager of two organizations, author of neither row | **2 of 2** |
| B the agency that authored one of the two rows | **1 of 2** |
| C a person who manages nothing | **0**, and no exception |

A proves the capability -- an employer who could previously discover *no*
declared workforce at all now sees the whole supply side. B proves
self-exclusion works and is not over-broad. C proves authorization fails closed
**and quietly**, so a surface can render an honest empty state instead of
parsing an error to tell "nothing available" from "not allowed".

One honest limit, measured rather than assumed: all three `agency_offer` rows on
production carry NULL `role_or_work_type`, `country` and `team_size`. An
employer therefore discovers *that* capacity exists without learning its shape.
That is a defect in the declaration path, not in this read, and it is recorded
against DEM-9 rather than hidden.

**`organization_evidence_import_v1`.** Its RLS had never been observed against
production before. The gate document's section 8 asked for three checks; all
three pass, and the boundary was then exercised under real users' auth inside a
transaction that was **ROLLED BACK**, so no synthetic history was created:

* all eight tables exist, all eight report `rowsecurity = true`, 21 policies
  matching the reviewed set one for one;
* `organization_evidence_records` has SELECT and INSERT policies and **no UPDATE
  and no DELETE policy** -- the append-only guarantee is enforced by the
  database, not by convention. The same holds for the parties, events,
  import-events and competency-signal tables. Only `evidence_import_rows`
  (staging) is mutable, exactly as designed;
* `authenticated` holds precisely the eight reviewed grants; `anon` and `PUBLIC`
  hold **nothing** on any of the eight;
* a real organization manager inserted a roster row and read it back --
  `created_by` defaulted to their own uid, `link_state` to `unlinked`;
* an importer attempting to write a **pre-linked** identity claim was refused
  `42501`. A matching name cannot become a claim about who someone is;
* an unrelated authenticated person read **0** rows of that roster and was
  refused `42501` on write. No cross-organization leak;
* every one of the eight tables held 0 rows before and after. No existing table
  was altered and no existing row was touched.

**Evidence level, stated precisely.** Both are
`PRODUCTION_DATA_PATH_PROVEN`. Neither is `PRODUCTION_PERSISTENCE_PROVEN`,
because the evidence-import writes were deliberately rolled back, and neither is
`HUMAN_UI_PROVEN`, because nobody has yet driven either surface in a browser.

---

## 2c. Supabase "EXCEEDING USAGE LIMITS" -- investigated, owner decision required

**FINDING.** The organization is on the **free** plan, whose database size limit
is **500 MB**. The production database is **842 MB** -- about **168% of the
limit**. Read live 2026-09-07. This is the resource being exceeded; it is not
Monthly Active Users (56 total auth users, 22 signed in within 30 days, against
a free-tier allowance far above that).

**WHERE IT IS.** Two tables are 92% of the database:

| table | size | share |
|---|---|---|
| `public.esco_labels` | 408 MB | 48.4% |
| `public.public_vacancies` | 369 MB | 43.8% |
| everything else combined | ~65 MB | 7.8% |

**RISK TO REAL USERS.** Sustained overage on the free plan is what leads Supabase
to restrict a project, and a read-only or paused database would take the whole
product down for real users. Nothing is degraded at the time of writing.

**NON-DESTRUCTIVE MITIGATION THAT NEEDS NO PURCHASE.** `esco_labels` holds
roughly 1.01M rows across **28 locales**, while the product ships message
catalogues for **5** (`en`, `lt`, `de`, `nl`, `ru` -- and `ru` has no ESCO labels
at all). The four locales the product can actually serve account for ~278k rows;
the other ~736k (73%) serve no reachable surface. Pruning to the served set is
the single largest reclaim available without spending anything.

That work already exists and is already owner-gated: **PR #1421** carries the
ESCO locale prune alongside the retention function and the unused-index drop.
It is a destructive `DELETE`, so it is RED class and **no agent may apply it**.

`public_vacancies` is 79,685 rows with none stale beyond 30 days, so it is
working data rather than accumulated waste; shrinking it would cost product
value and is not recommended as the first move.

**THE OWNER DECISION, STATED WITHOUT MAKING IT.** Either (a) approve the
already-written prune in PR #1421 and reclaim the unreachable locales at no
cost, or (b) move the project to a paid plan -- which would also unblock the
leaked-password protection recorded in section 2 as BLOCKED_BY_PLAN. This
session did not price, choose, purchase or upgrade anything, and must not.

---

## 3. `SUPABASE_DB_URL` — two CI gates are inert until it exists

**CURRENT STATE.** The secret is not set, so two live CI gates are honestly
**INERT / BLOCKED_BY_SECRET**. They do not fail; they cannot run, and they say
so rather than reporting a pass they did not earn. This is the correct
behaviour under the owner's decision 1 ("don't block on it; keep the gates
honestly inert") — it is recorded here so that "green" is never mistaken for
"checked".

**REQUIRED STATE.** A **read-only** Postgres connection string for the
production project available to the workflow as the repository secret
`SUPABASE_DB_URL`.

**EXACT CONTROL.**
1. Supabase Dashboard → the labourmarket.ai project → **Project Settings** →
   **Database** → **Connection string** → **URI**. Prefer a role with **read
   only** rights; the gates only `SELECT`.
2. GitHub → `bandymuks1-stack/labourmarketai` → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret** → name it exactly
   `SUPABASE_DB_URL`, paste the URI.

**DO NOT** paste the URI into a file, a PR body, a commit message, an issue, or
a chat message. It goes into the secret store and nowhere else. This document
deliberately does not contain it, or the project ref it would reveal.

**HOW TO VERIFY.** Re-run the affected workflow and confirm the two gates report
a real result instead of the inert/blocked state.

---

## 4. Two remaining fixable security advisors (smaller, and NOT owner-only)

Recorded so they are not lost. Both are **WARN**, both are real, and both are
fixable from a migration — but each is a schema change and therefore needs the
same gate as everything else.

**CURRENT STATE (read live 2026-09-07).**

* `function_search_path_mutable` on `public.usage_cost_events_forbid_mutation`
* `function_search_path_mutable` on `public.usage_cost_events_forbid_truncate`

**REQUIRED STATE.** Each function pinned with
`ALTER FUNCTION … SET search_path = public, pg_temp;`

**WHY IT IS NOT DONE HERE.** It is a production schema change, and this session
already has one unapproved migration awaiting an owner gate (PR #1600). Adding
a second unapproved change to the same queue would make the queue harder to
judge, not easier. It is written down instead.

**HOW TO VERIFY.** The two advisors disappear from the security list.

**ALSO NOTED, NOT A DEFECT.** The one `ERROR`-level advisor —
`security_definer_view` on `public.worker_absence_scheduling` — is
**deliberate** and was reviewed when that view shipped. It is listed here so
that a future reader does not "fix" it without reading why it exists. Four
`INFO` `rls_enabled_no_policy` rows (`company_need_public_intakes`,
`public_vacancy_supply_counts`, `vacancy_import_cursors`,
`worker_display_name_backfill_20260805`) are RLS-enabled with no policy, which
is fail-**closed**: no client can read them. That is the safe direction, and
each should either gain a policy or be dropped — a backlog item, not a hole.

---

## 5. The standing constraint this receipt operates under

> *"DO NOT import these real files yet unless the owner explicitly
> provides/authorizes them in the execution environment. Build and prove the
> capability first."*
> *"After approval, use only a SMALL authorized sample first."*

No owner historical data has been imported. The capability is built, tested and
inert; the migration behind it is unapplied and gated (see
`docs/human-gate/HG-2026-09-07-organization-evidence-import-v1.md`).
