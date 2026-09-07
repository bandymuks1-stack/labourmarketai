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

## 1. Supabase Auth — OTP expiry

**CURRENT STATE.** Not compliant. The security advisor
`auth_otp_long_expiry` fires on the production project, read live on
2026-09-07:

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

## 2. Supabase Auth — leaked-password protection

**CURRENT STATE.** Not compliant. `auth_leaked_password_protection` fires on the
production project, read live on 2026-09-07:

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
