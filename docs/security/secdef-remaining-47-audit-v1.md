# P0 follow-up — the remaining 47 anon-reachable `SECURITY DEFINER` functions

**Status: `P0_REMAINING_47_AUDIT_COMPLETE`**
**No new P0. `P0_ADDITIONAL_ANON_RPC_EXPLOIT_CONFIRMED` is NOT raised.**

Read-only audit against **production** (`gorgitwvdzxbnaxhrsrw`), 2026-07-22, after
`20260722120000_secdef_anon_authz_bypass_fix_v1` was applied (ledger version
`20260722074749`, PR #845 merged `bfd4a5f8`, ledger PR #846 merged `4afa3ab9`).

Every fact below comes from live `pg_proc` / `pg_get_functiondef` / `proacl` /
`pg_policy` and one rolled-back behavioural probe. Migration files were used only
to locate call sites, never as evidence of what production actually grants —
that distinction is the whole reason the original P0 survived review.

---

## 0. Verdict in one page

| Question | Answer |
|---|---|
| Can any of the 47 be exploited by an anonymous caller today? | **No.** All 43 non-public functions fail closed. Proven, not assumed. |
| Are the 3 "no authorization" functions exploitable? | **No.** Live anon probe: all three blocked `23502`. No mutation, no disclosure. |
| Is the current state acceptable? | **No.** 43 functions are anon-*reachable* by accident. Fail-closed-by-accident is not a control. |
| Is a count a valid contract? | **No.** The contract is the reviewed exact-signature allowlist. See §7. |
| New P0? | **No.** One P2 (existence oracle, §5.2) and one P2 (unthrottled public write, §6.2). |

**The single most important finding.** Of the 47, only **4** carry an explicit
`anon=X` grant. The other **43** reach `anon` solely through the leftover default
`PUBLIC` grant (`=X/postgres`) — the exact mechanism behind the original P0. The
intentional/accidental split is therefore machine-detectable from ACL shape, and
does not depend on anyone remembering the number 4.

For scale: production has **205** `SECURITY DEFINER` functions in `public`. **158**
already have `PUBLIC` correctly revoked. These 43 are stragglers, not the norm —
the repo's own prevailing pattern is already the correct one.

---

## 1. Phase A — factual inventory

Common to all 47 (verified individually, not sampled):

- **Owner:** `postgres`
- **`SECURITY DEFINER`:** yes
- **`search_path`:** `search_path=public` — pinned on all 47, no exceptions
- **`authenticated` EXECUTE:** yes on all 47
- **`service_role` EXECUTE:** yes on 46; **no** on `submit_company_need_public_v1`

Per-function detail follows by class. "PUBLIC ACL" = the `=X` default grant is
still present. "anon effective EXECUTE" = `has_function_privilege('anon', …)`.

### 1.1 Class A — intentionally public (4)

| Exact signature | PUBLIC ACL | anon EXECUTE | Public caller | Authorization | Mutates | Deliberate? | Risk |
|---|---|---|---|---|---|---|---|
| `get_public_business_profile_v1(p_slug text)` | yes | **explicit `anon=X`** | `business/[slug]` page | `public_profile_enabled = true` | no | **yes** | Low |
| `get_public_business_listings_v1(p_org_id uuid)` | yes | **explicit `anon=X`** | same page | `public_profile_enabled` + `status='active'` | no | **yes** | Low |
| `get_public_business_services_v1(p_org_id uuid)` | yes | **explicit `anon=X`** | same page | `public_profile_enabled` + `status='active'` | no | **yes** | Low |
| `submit_company_need_public_v1(18 args — see allowlist)` | **no** | **explicit `anon=X`** | `(marketing)/company-need` | none by design; containment instead | **yes** | **yes** | **Medium** (§6.2) |

### 1.2 Class B — mutating RPCs that should be authenticated-only (22)

All 22: PUBLIC ACL **yes**, anon EXECUTE **yes** (accidental), authenticated **yes**,
mutates **yes**, deliberate **NO**. Every call site is a `"use server"` module under
`app/[locale]/dashboard/**` that calls `supabase.auth.getUser()` first — **zero
anonymous callers**.

| Exact signature | Authorization mechanism | Fail-closed for anon? |
|---|---|---|
| `acknowledge_asset_assignment_v1(p_assignment_id uuid)` | inline `exists(workers.profile_id = auth.uid())` | yes |
| `add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date)` | `caller_manages_defect()` | yes |
| `add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text)` | `can_manage_project()` | yes |
| `cancel_worker_absence_v1(p_absence_id uuid)` | inline `exists(workers.profile_id = auth.uid())` | yes |
| `create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text)` | `manages_organization()` | yes |
| `create_contract_v1(…10 args)` | **none** — `NOT NULL owner_id` only (§4) | yes, by constraint |
| `create_marketplace_listing_v1(…9 args)` | **none** on the null-arg path (§4) | yes, by constraint |
| `create_proposal_v1(…8 args)` | **none** — `NOT NULL owner_id` only (§4) | yes, by constraint |
| `delete_defect_v1(p_defect_id uuid)` | `caller_manages_defect()` | yes |
| `delete_project_budget_v1(p_budget_id uuid)` | `can_manage_project()` | yes |
| `delete_project_stage_v1(p_stage_id uuid)` | `can_manage_project()` | yes |
| `issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text)` | `caller_manages_asset()` | yes |
| `report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date)` | `can_manage_project()` | yes |
| `request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text)` | inline `exists(workers.profile_id = auth.uid())` | yes |
| `return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text)` | `caller_manages_asset()` | yes |
| `review_worker_absence_v1(p_absence_id uuid, p_decision text)` | `caller_manages_worker()` | yes |
| `set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text)` | `manages_organization()` OR `owner_profile_id = auth.uid()` | yes |
| `set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid)` | `caller_manages_defect()` | yes |
| `set_project_budget_status_v1(p_budget_id uuid, p_status text)` | `can_manage_project()` | yes |
| `set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text)` | `can_manage_project()` | yes |
| `transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text)` | `caller_manages_asset()` | yes |
| `update_project_stage_v1(…10 args)` | `can_manage_project()` | yes |

### 1.3 Class B2 — predicate helpers (12)

All 12: PUBLIC ACL **yes**, anon EXECUTE **yes** (accidental), read-only, deliberate **NO**.
None is called from application code; 11 are referenced only inside RLS policy
expressions, 1 is referenced nowhere at all.

| Exact signature | Returns | Used by | Anon result |
|---|---|---|---|
| `asset_open_assignment_for_caller(p_asset_id uuid)` | boolean | RLS on `assets` | `false` |
| `caller_manages_asset(p_asset_id uuid)` | boolean | RLS on `asset_assignments` + 3 RPC bodies | `false` |
| `caller_manages_defect(p_defect_id uuid)` | boolean | RLS on `defect_corrections` + 3 RPC bodies | `false` |
| `can_access_match(m uuid)` | boolean | RLS on `matches`, `match_actions` | `false` |
| `is_admin()` | boolean | RLS on ~100 tables (162 policies) | `false` |
| `is_employer()` | boolean | RLS on `profiles`-adjacent tables | `false` |
| `manages_organization(org uuid)` | boolean | RLS on 14 tables (22 policies) | `false` |
| `owns_agency(a uuid)` | boolean | RLS on `agency_workers*` | `false` |
| `owns_company(c uuid)` | boolean | RLS on 5 tables (11 policies) | `false` |
| `owns_customer(c uuid)` | boolean | **nothing — see §5.3** | `false` |
| `owns_worker(w uuid)` | boolean | RLS on 13 tables (21 policies) | `false` |
| `profile_role()` | text | RLS `WITH CHECK` on 4 tables | `NULL` |

Every one is `select exists(… = auth.uid())`. For an anonymous caller `auth.uid()`
is `NULL`, the comparison yields `NULL`, no row matches, and `exists()` returns
`false` — **never `NULL`**. This is a genuine structural fail-closed, unlike the
`<> auth.uid()` pattern that caused the P0. `profile_role()` returns `NULL`, which
discloses nothing.

### 1.4 Class C — trigger functions (9)

All 9: PUBLIC ACL **yes**, anon EXECUTE **yes** (accidental), `returns trigger`,
deliberate **NO**, no call sites outside `CREATE TRIGGER`.

`enforce_company_verification_guard()` · `ensure_org_owner_engagement()` ·
`ensure_worker_personal_engagement()` · `ensure_worker_profile()` ·
`handle_new_user()` · `journal_entry_confirmations_guard()` ·
`learning_review_queue_guard_stale()` · `mirror_agency_to_org()` ·
`mirror_company_to_org()`

A `returns trigger` function cannot be invoked usefully over PostgREST, and calling
it directly raises `trigger functions can only be called as triggers`. Risk today:
negligible. Reason to revoke anyway: they are noise in the anon surface, and noise
is what let seven real holes hide.

---

## 2. Phase B — classification

| Group | Count | Members |
|---|---|---|
| **A. `INTENTIONALLY_PUBLIC`** | 4 | §1.1 |
| **B. `AUTHENTICATED_ONLY`** | 33 | 22 mutating RPCs (§1.2) + 11 RLS predicate helpers (§1.3, minus `owns_customer`) |
| **C. `SERVICE_ROLE_ONLY`** | 9 | the trigger functions (§1.4) — strictly, *no-caller-at-all*; they need no runtime EXECUTE grant from any client role |
| **D. `DEAD_OR_UNKNOWN`** | 1 | `owns_customer(c uuid)` — §5.3 |

4 + 33 + 9 + 1 = **47**. Independently corroborated by call-site analysis of the
repository: 4 ANON, 22 AUTHENTICATED, 11 RLS_POLICY_ONLY, 9 TRIGGER_ONLY,
1 NO_CALL_SITE_FOUND.

---

## 3. Phase C — the three functions with no authorization

`create_contract_v1`, `create_proposal_v1`, `create_marketplace_listing_v1`.

A `NOT NULL` error is not an authorization control, so these were investigated
first and adjudicated by execution rather than by reading.

**Parameters.** None of the three accepts an `owner_id`. All three hard-code
`auth.uid()` into the `owner_id` column of the insert. An anonymous caller has no
parameter through which to supply an identity.

**Column facts (live).** `contracts.owner_id`, `proposals.owner_id` and
`marketplace_listings.owner_id` are all `uuid NOT NULL` with **no default**. So
`auth.uid()` being `NULL` is unconditionally fatal to the insert.

**Ordering.** PostgreSQL evaluates `NOT NULL` during tuple construction, before
foreign-key triggers fire. The `23502` therefore always wins, so the nullable FK
columns (`proposal_id`, `project_id`, `customer_request_id`) cannot be turned into
a row-existence oracle.

**`create_marketplace_listing_v1` specifically** does have two pre-insert checks
(`manages_organization`, `can_manage_project`), but for anon both are constant
`false`, so they raise identically whether or not the referenced object exists.
No oracle. Passing `NULL` for both skips them entirely and lands on the same `23502`.

### 3.1 Behavioural proof (rolled back, no side effects)

Executed against production as `role=anon` with `request.jwt.claims` cleared. The
whole probe ends in a `raise`, so every statement is rolled back.

```
auth.uid()=NULL role=anon
create_contract_v1            = BLOCKED 23502 null value in column "owner_id" of relation "contracts"
create_proposal_v1            = BLOCKED 23502 null value in column "owner_id" of relation "proposals"
create_marketplace_listing_v1 = BLOCKED 23502 null value in column "owner_id" of relation "marketplace_listings"
```

Post-probe row counts re-checked: `contracts=0 proposals=0 marketplace_listings=0`
— identical to before. Nothing was written.

**Verdict — no mutation, no disclosure, no P0.** Classified **P1 fragile**: the
control is a schema constraint, not an authorization decision. Adding a column
default, relaxing the `NOT NULL`, or changing the insert shape would silently
convert all three into anonymous write paths, with no test failing. The durable
fix is an explicit `if auth.uid() is null then raise` plus the revoke.

---

## 4. Phase D — the fail-closed functions

> "Currently returns an error" is not protection. Each was checked for *why*.

| Why it fails closed | Count | Is it a deliberate auth guard? |
|---|---|---|
| Explicit `exists(… = auth.uid())`, directly or via a helper | 19 | **Yes** — genuine, and structurally NULL-safe |
| `NOT NULL owner_id` constraint only | 3 | **No** — accidental (§3) |
| `returns trigger`, not usefully callable | 9 | **No** — accidental, but inert |
| Read-only predicate returning `false`/`NULL` for anon | 12 | **Yes** — genuine, though anon should not reach them at all |

**Could a future change silently open an anon path?** Yes, in three of the four
rows above — everything except the 19 with explicit identity guards. That is the
argument for revoking rather than relying on current behaviour.

**Does the application need anon EXECUTE on any of them?** **No.** Verified two
ways: no anonymous call site exists for any of the 43, and — the load-bearing check
— **not one table whose RLS policies reference these helpers is anon-`SELECT`able**,
so no anonymous read path depends on them either.

### 4.1 A real, already-proven precedent

`public.caller_manages_worker(uuid)` is `SECURITY DEFINER`, has **no anon grant
today**, and is called successfully from inside `review_worker_absence_v1`. This is
production evidence that a `SECURITY DEFINER` body executes as its owner
(`postgres`) and does **not** need the *caller* to hold EXECUTE on the helpers it
calls. The proposed revoke therefore cannot break the RPC bodies.

---

## 5. Findings

### 5.1 P1 — three write RPCs defended only by a constraint
§3. Fix: explicit `auth.uid() is null` guard + revoke.

### 5.2 P2 — pre-authorization row-existence oracle (9 functions)

Nine functions look a row up **before** checking identity, then raise a
*distinguishable* error:

`acknowledge_asset_assignment_v1` · `cancel_worker_absence_v1` ·
`delete_project_budget_v1` · `delete_project_stage_v1` · `return_asset_v1` ·
`review_worker_absence_v1` · `set_project_budget_status_v1` ·
`transfer_asset_assignment_v1` · `update_project_stage_v1`

A caller who supplies an unknown id gets `not found` (or a silent return); a caller
who supplies a **real** id gets `not authorized`. The difference confirms the row
exists.

This is **the same shape as the original P0** — a lookup before an identity check —
and is exactly what PROOF 10 of the #845 harness was written to catch. Severity is
only P2 because the ids are UUIDv4 (not enumerable) and no row *content* leaks, and
because after the proposed revoke an anonymous caller cannot reach these at all.
It remains a live oracle for any *authenticated* user against other tenants' ids.
**Not fixed here** — fixing it means editing function bodies, and this change is
grant-only.

### 5.3 P3 — `owns_customer(c uuid)` is dead code

Defined in `0026_customer_entity.sql`, referenced by **no** RLS policy, **no**
trigger, **no** RPC body and **no** application code. Class **D**. Per the audit
doctrine it is not removed here; a `DROP` is a separate owner decision. It is still
revoked from anon along with the rest, which is safe precisely because nothing
calls it.

### 5.4 P2 — the public intake has no throttle
§6.2.

---

## 6. Phase E — the four intentionally-public RPCs, re-confirmed individually

Confirmed by exact signature from the live catalog, not inherited from the earlier
count of "4".

### 6.1 The three read-only getters

`get_public_business_profile_v1(p_slug text)` ·
`get_public_business_listings_v1(p_org_id uuid)` ·
`get_public_business_services_v1(p_org_id uuid)`

| Criterion | Assessment |
|---|---|
| Abuse / spam | Read-only, idempotent. Ceiling is scraping of deliberately published data. |
| Rate limiting | **None at DB level.** Accepted: no state is changed. |
| Payload limits | `limit 1` / `limit 50` / `limit 50`. Bounded. |
| PII collection | None collected. |
| PII *disclosure* | `public_contact_email`, `public_contact_phone` — owner-published by explicit action. |
| Consent / privacy | Publication is opt-in via `set_business_public_profile_v1`; default `public_profile_enabled = false`. |
| Duplicate submissions | N/A (read-only). |
| Enumeration | Slug enumeration possible on the profile getter; discloses only opted-in profiles. The two uuid getters are not enumerable. |
| Return data | Fixed column projection; no `select *`; drafts and inactive rows excluded. |
| `SECURITY DEFINER` necessary? | **Yes** — the base tables grant nothing to anon. DEFINER narrows access instead of opening the table. |
| Fixed `search_path` | `search_path=public` on all three. |
| Least privilege | Good. Could be tightened further by dropping `service_role` EXECUTE, which is unused. |

**Verdict: keep public. No change required.**

### 6.2 `submit_company_need_public_v1` — the one anonymous write

| Criterion | Assessment |
|---|---|
| Abuse / spam | **GAP.** No dedupe, no throttle. Unbounded inserts of ~8 KB each. |
| Rate limiting | **None at DB level.** Any protection is application-layer only and unverified here. |
| Payload limits | Strong: 200 / 8000 / 254 / 160 / 40 / 200 / 120 / 200 char ceilings, `headcount` clamped to `[1,100000]`. |
| PII collection | Yes, by design: contact name, email, phone. |
| Consent / privacy | Owner gate — confirm the form's privacy notice matches what is stored. Not verifiable from the database. |
| Duplicate submissions | **Not prevented.** No unique constraint, no idempotency key. |
| Enumeration | **Not possible.** Returns only the new row's own id. |
| Return data | Single `uuid`. Nothing read back. |
| `SECURITY DEFINER` necessary? | **Yes.** The table grants nothing to anon and has no INSERT policy; DEFINER is the only write path, which is what keeps the table sealed. |
| Fixed `search_path` | `search_path=public`. |
| Least privilege | **Exemplary containment.** `company_need_public_intakes` has RLS **enabled with ZERO policies** and `relacl = {postgres=arwdDxtm, service_role=r}` — anon can insert through the function and can read **nothing**, not even its own submission. `service_role` deliberately has no EXECUTE on the function. |

**Verdict: keep public. Add throttling as a follow-up.** The containment design is
right; the missing control is volumetric, not access. Options for the owner:
a partial unique index for dedupe, a per-window insert cap keyed on
`source_path`/email, or an application-layer captcha. Recorded honestly in the
allowlist contract rather than papered over.

---

## 7. Phase F — the recurrence guard

Three artefacts. **None of them asserts a count.**

1. **`apps/web/lib/security/anon-secdef-allowlist.ts`** — the reviewed allowlist.
   Exact identity signatures plus a mandatory written security contract per entry
   (public caller, authorization, input validation, abuse controls, DEFINER
   justification, residual risk).
2. **`apps/web/lib/guards/secdef-anon-allowlist.test.ts`** — static half, runs in
   CI with no database. **9 assertions, all passing.**
3. **`scripts/check-anon-secdef-allowlist.mts`** — live half
   (`pnpm check:anon-secdef-allowlist`). Opens a **read-only** transaction and
   diffs the allowlist against a real catalog in both directions.

### 7.1 The six required failure conditions

| # | Condition | Enforced by |
|---|---|---|
| 1 | A new anon-reachable `SECURITY DEFINER` function appears | live `[C1]` |
| 2 | An allowlisted function's signature changes | live `[C2]` — reports drift explicitly rather than silently missing |
| 3 | A function is removed but the allowlist stays stale | live `[C3]` |
| 4 | `PUBLIC` is re-granted to a disallowed function | live `[C4]` + static migration scan |
| 5 | A function has anon EXECUTE but no allowlist entry | live `[C1]` (and `[C5]` for the inverse: public path broken) |
| 6 | An intentionally-public function has no documented security contract | static + live `[C6]` |

The static half additionally blocks a new migration from granting EXECUTE to
`anon`/`PUBLIC` on a non-allowlisted function, and blocks
`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon`.

### 7.2 The guard was proven to fail, not just to pass

A guard that has never gone red is unverified. Two negative controls were run and
then reverted:

| Injected defect | Result |
|---|---|
| A migration adding `grant execute on function public.is_admin() to anon` | **FAIL** — `grants EXECUTE on public.is_admin … but it is not on the anon allowlist` |
| Rewriting the intake's honest `GAP` note as "protected end to end" | **FAIL** — `an anonymous write path must either name its abuse control or explicitly declare the gap` |

Restored, re-run: **9/9 pass.**

### 7.3 The live half was validated against production

The checker's query was executed against production. It reports exactly what it
should today, **before** any migration:

| Metric | Value |
|---|---|
| `SECURITY DEFINER` functions in `public` | 205 |
| anon-reachable now | 47 |
| `[C1]` violations (anon-reachable, not allowlisted) | **43** |
| `[C4]` violations (`PUBLIC` grant, not allowlisted) | **43** |
| `[C3]` stale allowlist entries | 0 |
| `[C5]` broken public paths | 0 |
| explicit `anon=X` grants | **4** |

So the live guard **fails today with 43 findings** and passes only once the
migration is applied. It is not a rubber stamp.

---

## 8. Proposed migration — exact scope

`supabase/migrations/20260722160000_secdef_anon_reach_revoke_v1.sql` —
**owner-approved 2026-07-22 under a strictly-bounded scope.**

**Does:** for each of the **43** non-allowlisted signatures,
`REVOKE EXECUTE … FROM public` and `REVOKE EXECUTE … FROM anon`. Then
`GRANT EXECUTE … TO authenticated` on **exactly 8** functions — and only those.

**Does not:** touch the 4 public RPCs; grant anything to `service_role`; grant
anything to the 9 trigger functions or the dead one; alter any function body;
alter any table, policy, column or row; drop anything; use any wildcard or
schema-wide grant.

### 8.0 The `authenticated` re-grant is deliberately NOT uniform

This is the correction that mattered most, and it came from checking `proacl`
per function rather than assuming:

| Sub-group | n | `authenticated` today | Action |
|---|---:|---|---|
| Mutating RPCs + 3 helpers with a direct `authenticated=X` grant | **25** | direct grant | revoke PUBLIC/anon **only** — no grant |
| Helpers with `proacl IS NULL` (reach `authenticated` *only* via PUBLIC) | **8** | inherited from PUBLIC | revoke **and** explicit `GRANT … TO authenticated` |
| Trigger-only | **9** | inherited from PUBLIC | revoke only, **no grant** |
| Dead (`owns_customer`) | **1** | inherited from PUBLIC | revoke only, **no grant** |

The 8 requiring a grant: `can_access_match(m uuid)`, `is_admin()`,
`is_employer()`, `manages_organization(org uuid)`, `owns_agency(a uuid)`,
`owns_company(c uuid)`, `owns_worker(w uuid)`, `profile_role()`.

Omitting those 8 would be an **outage**: RLS policy expressions are
privilege-checked against the querying role, so every policy calling `is_admin()`,
`owns_worker()`, `manages_organization()` would stop evaluating for logged-in
users. Conversely, re-granting the other 25 would be noise that hides which
functions actually depend on this migration.

### 8.0.1 Why no `service_role` grant

None of the 43 holds a direct `service_role=X` grant — `service_role` also reaches
them only via PUBLIC, so this migration removes that too. Verified safe two ways:

1. `service_role` has **`rolbypassrls = true`**, so RLS never evaluates for it and
   the predicate helpers can never be required.
2. The only non-test service-role code in the repo — `lib/sales/lead-intake.ts` and
   `app/api/leads/route.ts` — performs plain table operations on `leads`,
   `waitlist` and `customer_requests` with **zero `.rpc()` calls**.

### 8.0.2 Trigger-only functions confirmed against production

All 9 are attached to exactly one trigger each — `public.companies`,
`public.organizations`, `public.workers`, `public.profiles`, `auth.users`,
`public.journal_entry_confirmations`, `public.learning_review_queue`,
`public.agencies`, `public.companies` — with no direct call site. EXECUTE is
checked at `CREATE TRIGGER` time, not at fire time, so revoking cannot break a
write, and they are **not** granted to `authenticated` for convenience.

### 8.0.3 Pre-apply matrix (owner gate requirement)

Expected post-apply state, per group, by exact signature — established from live
`proacl` before the migration was written:

| Group | n | PUBLIC after | anon after | authenticated after |
|---|---:|---:|---:|---:|
| intentionally public | 4 | unchanged (per contract) | **4/4** | unchanged (per contract) |
| authenticated only | 33 | **0/33** | **0/33** | **33/33** (25 keep direct grant, 8 newly granted) |
| trigger only | 9 | **0/9** | **0/9** | **0/9** — no grant, none justified |
| dead or unknown | 1 | **0/1** | **0/1** | **0/1** — no grant, none justified |

Supporting facts, all verified against production:

- all 43 exact signatures exist, each resolving to exactly one function
  (no overload ambiguity) — asserted continuously by PROOF 3;
- all 4 allowlist signatures preserved — PROOF 2;
- the checker fails on a rogue anon/PUBLIC grant — negative control run;
- the checker fails on an allowlist signature change — condition `[C2]`;
- the checker fails when documentation falsely marks a GAP as protected —
  negative control run;
- the checker passes again after each injected defect is reverted.

### 8.1 Regression tests

- `supabase/tests/20260722160000_secdef_anon_reach_revoke_verification.sql` —
  **10 proofs**, run **before and after** the apply. Two are behavioural (actually
  becoming `anon` and expecting `42501`), not merely catalog assertions. Reports via
  a **result set**, not `RAISE NOTICE` — deliberately fixing the transport problem
  #846 had to work around by hand at the owner gate. Ends in `ROLLBACK`; writes nothing.
- Expected **before**: PROOF 1, 4 and 9 **FAIL** — that failure *is* the current
  state being reproduced. Expected **after**: all 10 **PASS**.
- Proof coverage maps to the approved matrix: PROOF 5 is the 33/33 outage check,
  PROOF 9 asserts the 9 trigger + 1 dead functions hold **no** anon/authenticated
  grant, PROOF 10 asserts all 9 triggers are still attached, PROOF 3 asserts all 47
  exact signatures resolve to exactly one function (no overload confusion).
- `apps/web/lib/guards/secdef-anon-allowlist.test.ts` — **12/12 passing**, including
  scope assertions: exactly 43 revoked, exactly 8 granted, nothing to `service_role`,
  no DDL/DML/wildcards, and a rollback that can never re-open anon or PUBLIC.

### 8.2 Possible product impact

| Surface | Impact |
|---|---|
| Anonymous visitors | **None.** No anon call site exists for any of the 43, and no anon-readable table's RLS depends on them. |
| Logged-in users | **None,** provided the 8 explicit `authenticated` grants apply — asserted in-transaction by the migration itself and by PROOF 5 (33/33). |
| `service_role` jobs | **None.** Loses EXECUTE via PUBLIC, but has `rolbypassrls` and no `.rpc()` call site. |
| Public business profiles | **None.** Untouched; PROOF 2 and PROOF 7 verify they still serve anon. |
| Public company-need intake | **None.** Untouched; PROOF 8 verifies the table stays sealed. |
| Trigger-driven writes | **None.** EXECUTE is checked at `CREATE TRIGGER` time, not at fire time; PROOF 10 confirms all 9 stay attached. |

### 8.3 Rollback

`supabase/rollbacks/20260722160000_secdef_anon_reach_revoke_v1.down.sql`
**deliberately does not reverse the security change.** Per owner directive, an
automatic rollback may not re-grant `PUBLIC`, may not re-grant `anon`, and may not
restore the 47 anon-reachable functions. That constraint is *encoded*, not merely
documented: the static guard fails if any rollback grant names anon or PUBLIC.

The forward migration created nothing, dropped nothing, altered no table, policy,
trigger or body, and wrote no data — so there is no state to restore. Its only
additive change is the 8 `authenticated` grants, and the rollback re-asserts exactly
those (idempotent), which repairs the single realistic failure mode without
re-opening anonymous access.

**The only supported remediation** if a legitimate logged-in path returns `42501` is
a targeted `GRANT EXECUTE ON FUNCTION public.<name>(<exact identity args>) TO
authenticated;` for that one signature — never widening to PUBLIC or anon.

---

## 9. Owner gate — what is NOT done

Completed under the existing read-only authorisation: production analysis,
call-site analysis, this report, tests, a draft migration, an isolated Draft PR, CI.

**Requires a NEW owner decision before anything else happens:**

1. **Apply `20260722160000` to production.** Not applied. Run the verification
   harness **before** the apply and record it, then again after — a post-apply-only
   run is what let the original P0 ship.
2. **The mass `REVOKE` itself** — 43 functions in one transaction.
3. **Merging this PR.**
4. **Dropping `owns_customer(c uuid)`** (§5.3) — dead, deliberately left alone.
5. **Adding the explicit `auth.uid() is null` guard to the three §3 functions** —
   a body change, out of scope for a grant-only migration.
6. **Throttling `submit_company_need_public_v1`** (§6.2) — needs a product decision
   on dedupe vs. captcha vs. per-window cap.
7. **Fixing the §5.2 existence oracle** across nine functions — body changes.
8. **Wiring `check:anon-secdef-allowlist` into CI** — needs a decision on which
   database CI points at, since the check is only meaningful against a real catalog.

Nothing in this audit changed production. The only production interaction was
read-only queries plus one probe that ended in `ROLLBACK` and was confirmed to have
left row counts unchanged.
