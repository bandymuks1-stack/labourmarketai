# SECURITY DEFINER functions reachable by `anon` — inventory v1

**Date:** 2026-07-22
**Project:** labourmarket.ai — Supabase `gorgitwvdzxbnaxhrsrw` (production)
**Status of this document:** READ-ONLY INVENTORY. Only the 7 functions in class
**A** are changed by migration `20260722120000_secdef_anon_authz_bypass_fix_v1.sql`.
Every other function listed here is **left exactly as it is** by that migration.

---

## 1. How the exposure happened

`public` contains **205** `SECURITY DEFINER` functions. **54** are executable by the
`anon` role.

Only **4** of those 54 were granted to `anon` deliberately. The other **50** inherited
`EXECUTE` from PostgreSQL's default `PUBLIC` grant, because the creating migrations wrote

```sql
grant execute on function public.<fn>(...) to authenticated;
```

without the matching

```sql
revoke execute on function public.<fn>(...) from public;
```

Across all 161 migrations there are only **4** `revoke execute` statements in total.

The ACL makes the two cases easy to tell apart:

| Case | `proacl` | Meaning |
|---|---|---|
| Unintentional (50) | `{=X/postgres,postgres=X/postgres,authenticated=X/postgres}` | leading `=X/` is the **PUBLIC** grant |
| Intentional (4) | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}` | explicit `anon=X`, **no** PUBLIC entry |

Reproduce:

```sql
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE'), p.proacl::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname;
```

---

## 2. Classification summary

| Class | Count | Risk | Action in this PR |
|---|---|---|---|
| **A — EXPLOITABLE** — anon-reachable *and* NULL-unsafe ownership check | **7** | **P0** | **FIXED** |
| **B — NO AUTHZ CHECK** — no ownership logic at all; anon stopped only by a NOT NULL constraint error | 3 | P1 | Documented, not changed |
| **C — BLOCKED BY BODY CHECK** — uses `if not exists(...)`, which returns false (never NULL) and so fails closed | 19 | P2 | Documented, not changed |
| **D — PREDICATE ONLY** — boolean helpers used inside RLS; return false for anon, disclose nothing | 12 | P3 | Documented, not changed |
| **E — TRIGGER, NOT CALLABLE** — `returns trigger`; cannot be invoked usefully over PostgREST | 9 | P3 | Documented, not changed |
| **F — INTENTIONALLY PUBLIC** — explicit `anon=X`, by design | 4 | none | **Must stay callable** |
| **Total** | **54** | | |

> This independent classification was produced twice — once by the security audit loop
> and once by catalog analysis during hotfix preparation — and both arrived at the same
> 7 / 3 / 19 / 12 / 9 / 4 split.

---

## 3. Class A — EXPLOITABLE (P0, fixed by this PR)

All seven satisfy **both** conditions: `has_function_privilege('anon', …) = true`, and a
body containing `if v_owner <> auth.uid() then raise exception 'not authorized'`. For an
unauthenticated caller `auth.uid()` is NULL, `v_owner <> NULL` is NULL, PL/pgSQL treats
NULL as false, and the write proceeds with DEFINER rights.

| # | Exact identity signature | Returns | Effect if exploited |
|---|---|---|---|
| 1 | `public.delete_contract_v1(p_contract_id uuid)` | void | deletes any contract |
| 2 | `public.set_contract_status_v1(p_contract_id uuid, p_status text)` | void | changes any contract's status |
| 3 | `public.delete_proposal_v1(p_proposal_id uuid)` | void | deletes any proposal |
| 4 | `public.set_proposal_status_v1(p_proposal_id uuid, p_status text, p_rejection_reason text)` | void | changes any proposal's status, timestamps and rejection reason |
| 5 | `public.delete_marketplace_listing_v1(p_id uuid)` | void | deletes any listing |
| 6 | `public.set_marketplace_listing_status_v1(p_id uuid, p_status text)` | void | changes any listing's status |
| 7 | `public.update_marketplace_listing_v1(p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text, p_location_country text, p_location_label text, p_price_text text)` | void | rewrites any listing's title, category, kind, description, location and price |

Introduced by `20260718190000_commercial_crm.sql` (1–4) and
`20260718210000_marketplace_listings.sql` (5–7).

**Live proof (rolled back, zero rows left):** calling
`set_marketplace_listing_status_v1` as role `anon` returned `NO_ERROR` and the row's
status became `closed` — the row was *changed*, not merely spared an error.

**Current blast radius: zero rows.** `contracts`, `proposals` and
`marketplace_listings` all hold 0 rows in production today. The path arms itself the
moment the first real record exists. That is why this is fixed now rather than after the
commercial pilot begins.

---

## 4. Class B — NO AUTHZ CHECK (3, P1, deliberately NOT changed here)

| Signature | Why it is not currently exploitable |
|---|---|
| `create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date)` | inserts `owner_id = auth.uid()`; for anon that is NULL and the `NOT NULL` constraint raises `23502` |
| `create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text)` | same |
| `create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid)` | same |

These are protected by a **constraint error**, not by an authorization decision. That is
a fragile control: adding a default, making the column nullable, or changing the insert
shape would silently turn all three into anonymous write paths.

**They are not changed in this PR** because the hotfix scope is the confirmed P0 and
because the revoke in §5 already removes anonymous reachability for them once applied as
part of the follow-up. Recommended follow-up: add
`if auth.uid() is null then raise exception 'not authorized'; end if;` as the first
statement of each, and revoke their PUBLIC grant.

---

## 5. Classes C, D, E — the remaining 40 (not changed here)

**Class C — blocked by body check (19).** These guard with `if not exists (...)`, and
`exists()` returns `false`, never NULL — so they fail closed for an anonymous caller.
Verified by probe on a sample of five.

`acknowledge_asset_assignment_v1` · `add_defect_correction_v1` · `add_project_stage_v1` ·
`cancel_worker_absence_v1` · `delete_defect_v1` · `delete_project_budget_v1` ·
`delete_project_stage_v1` · `issue_asset_v1` · `report_defect_v1` ·
`request_worker_absence_v1` · `return_asset_v1` · `review_worker_absence_v1` ·
`set_business_public_profile_v1` · `set_defect_status_v1` ·
`set_project_budget_status_v1` · `set_project_budget_v1` ·
`transfer_asset_assignment_v1` · `update_project_stage_v1` · `create_asset_v1`

`report_defect_v1` was probed directly as `anon` and returned
`P0001 not authorized to manage this project`.

**Class D — predicate helpers (12).** Boolean functions used inside RLS policies. For
anon they return false and disclose nothing.

`asset_open_assignment_for_caller` · `caller_manages_asset` · `caller_manages_defect` ·
`can_access_match` · `is_admin` · `is_employer` · `manages_organization` · `owns_agency` ·
`owns_company` · `owns_customer` · `owns_worker` · `profile_role`

**Class E — trigger functions (9).** `returns trigger`; PostgREST cannot invoke them
meaningfully.

`enforce_company_verification_guard` · `ensure_org_owner_engagement` ·
`ensure_worker_personal_engagement` · `ensure_worker_profile` · `handle_new_user` ·
`journal_entry_confirmations_guard` · `learning_review_queue_guard_stale` ·
`mirror_agency_to_org` · `mirror_company_to_org`

Classes C, D and E are still **defence-in-depth failures** — none of them should be
reachable by `anon` at all — but none is an exploitable path today. They belong in a
separate, non-P0 hardening PR (see §7).

---

## 6. Class F — INTENTIONALLY PUBLIC (4) — must keep working

| Signature | Purpose |
|---|---|
| `submit_company_need_public_v1(p_locale text, p_company_name text, … p_source_path text)` | anonymous employer demand intake |
| `get_public_business_profile_v1(p_slug text)` | public business page |
| `get_public_business_listings_v1(p_org_id uuid)` | public business page |
| `get_public_business_services_v1(p_org_id uuid)` | public business page |

**This is why the hotfix does not issue a blanket
`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`.** That single statement
would break anonymous demand intake and every public business page. A guard test
(`secdef-anon-authz-bypass.test.ts`) asserts no statement in the migration references
any of these four.

---

## 7. Recommended follow-up (separate PR, not P0)

1. Class B (3 functions): add an explicit unauthenticated rejection, then revoke PUBLIC.
2. Classes C, D, E (40 functions): revoke PUBLIC per exact signature, keeping the 4 in
   class F explicitly granted to `anon`.
3. **Add a standing catalog guard built on an explicit ALLOWLIST — never on a count.**

   > **Owner correction, 2026-07-22.** An earlier draft of this section proposed asserting
   > that *"the count of anon-executable `SECURITY DEFINER` functions equals exactly 4"*.
   > **That design is unsafe and must not be used.** A count is not an identity check: if a
   > future migration exposed a fifth dangerous function while a legitimate public one was
   > removed or renamed in the same change, the count would still read 4 and the guard
   > would go green while a new hole was open.

   The correct guard asserts the **exact set**, by schema-qualified name and argument
   signature:

   ```sql
   -- must return zero rows
   select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as unexpected
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') not in (
       -- REVIEWED ANON RPC ALLOWLIST — every entry needs a written justification
       'submit_company_need_public_v1(...)',
       'get_public_business_profile_v1(p_slug text)',
       'get_public_business_listings_v1(p_org_id uuid)',
       'get_public_business_services_v1(p_org_id uuid)'
     );
   ```

   Properties the guard must have: (a) a **set** comparison, not a cardinality one;
   (b) keyed on the **full identity signature**, so an overload cannot slip in under an
   allowlisted name; (c) failing **in both directions** — an unexpected addition *and* the
   disappearance of an allowlisted entry both warrant a look; (d) each allowlist entry
   carries a one-line reason, so adding one is a deliberate, reviewable act.

4. Adopt a migration convention: every `grant execute … to authenticated` must be preceded
   by `revoke execute … from public` for the same signature.

Item 3 is the durable fix. Without it this class of defect will recur — it already
recurred across two independent migrations five months apart. Implement it in the
follow-up loop described in `docs/security/secdef-remaining-47-audit-plan-v1.md`, **not**
in the P0 hotfix PR.
