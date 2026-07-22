# P0 hotfix — anon SECURITY DEFINER authorization bypass: validation & apply runbook v1

**Date:** 2026-07-22
**Branch:** `fix/cc/secdef-anon-authz-bypass-v1`
**Migration:** `supabase/migrations/20260722120000_secdef_anon_authz_bypass_fix_v1.sql`
**Class:** RED (SECURITY DEFINER + GRANT/REVOKE) → human gate, no auto-merge
**Production apply status:** ❌ **NOT APPLIED. This is a separate OWNER GATE.**

---

## 1. The defect, stated precisely

Seven `SECURITY DEFINER` RPCs guarded ownership with:

```sql
if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
```

For an unauthenticated caller `auth.uid()` returns NULL. `v_owner <> NULL` evaluates to
**NULL**, not `true`. PL/pgSQL treats a NULL condition as false, so the `raise` never
executes and control falls through to the `UPDATE`/`DELETE`, which then runs with
**DEFINER** privileges — bypassing RLS entirely.

The functions were reachable by `anon` because their ACL retained PostgreSQL's default
`PUBLIC` grant: the creating migrations ran `GRANT EXECUTE … TO authenticated` without
`REVOKE EXECUTE … FROM PUBLIC`. `anon` was never granted access directly; it inherited it.

Two independent conditions had to coincide, and both are required for exploitation:
**reachability** (PUBLIC grant) and **a defeatable check** (NULL-unsafe comparison).
The fix removes both.

---

## 2. The seven functions — exact identity signatures

Taken from production via `pg_get_function_identity_arguments`, not from the source files.

| # | Signature | Returns | SECURITY DEFINER | search_path | Owner |
|---|---|---|---|---|---|
| 1 | `public.delete_contract_v1(p_contract_id uuid)` | void | yes | `public` | postgres |
| 2 | `public.set_contract_status_v1(p_contract_id uuid, p_status text)` | void | yes | `public` | postgres |
| 3 | `public.delete_proposal_v1(p_proposal_id uuid)` | void | yes | `public` | postgres |
| 4 | `public.set_proposal_status_v1(p_proposal_id uuid, p_status text, p_rejection_reason text)` | void | yes | `public` | postgres |
| 5 | `public.delete_marketplace_listing_v1(p_id uuid)` | void | yes | `public` | postgres |
| 6 | `public.set_marketplace_listing_status_v1(p_id uuid, p_status text)` | void | yes | `public` | postgres |
| 7 | `public.update_marketplace_listing_v1(p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text, p_location_country text, p_location_label text, p_price_text text)` | void | yes | `public` | postgres |

All seven are preserved exactly: same schema, name, argument list, argument defaults,
return type, `SECURITY DEFINER`, and pinned `search_path`. `CREATE OR REPLACE FUNCTION`
does not change ownership and does not reset the ACL — which is precisely why the
explicit `REVOKE`/`GRANT` block is required and is present.

---

## 3. Privilege matrix — before / after

**Before (production, verified 2026-07-22):**

| Signature | `proacl` | PUBLIC | anon | authenticated |
|---|---|---|---|---|
| all 7 | `{=X/postgres,postgres=X/postgres,authenticated=X/postgres}` | ✅ granted | ✅ **inherited** | ✅ granted |

**After (guaranteed by the migration; to be verified post-apply):**

| Signature | PUBLIC | anon | authenticated |
|---|---|---|---|
| all 7 | ❌ revoked | ❌ revoked | ✅ granted |

The `REVOKE … FROM anon` is explicit and defensive. No direct `anon` grant exists today —
the carrier is `PUBLIC` — but stating both makes the intent unambiguous and keeps the
migration correct if a direct grant is ever added.

---

## 4. What changed inside each function

Two lines per function, nothing else:

```sql
-- added, BEFORE the row lookup
if auth.uid() is null then raise exception 'not authorized'; end if;

-- replaced
- if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
+ if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
```

The unauthenticated rejection is placed **before** the `select owner_id into v_owner`, so
a non-existent id can never be answered as though the caller were authorized. This
satisfies the requirement that a missing record must not be interpreted as authorization.

All business logic is byte-identical to production: status vocabularies, validation order,
`sent_at` / `accepted_at` / `rejection_reason` handling, text truncation, the country
uppercase/`left(...,2)` normalisation, and the two differing not-found semantics
(`delete_*` returns quietly; `set_*`/`update_*` raises `... not found`).

---

## 5. Validation performed — and its honest limits

### 5.1 Static contract (DONE, green)

`apps/web/lib/guards/secdef-anon-authz-bypass.test.ts` — **72 assertions, 72 passed**
(`npx vitest run`, 0.97 s). It pins, per function: the explicit unauthenticated
rejection; that the rejection precedes the row lookup; the NULL-safe comparison; the
absence of any `<>`/`!=` against `auth.uid()`; preservation of `SECURITY DEFINER` and
`search_path`; and the exact-signature `REVOKE PUBLIC` / `REVOKE anon` / `GRANT
authenticated` triple.

It also pins the blast radius: the migration defines exactly these seven functions and no
others; it contains no blanket `REVOKE … ON ALL FUNCTIONS`; no statement references the
four intentionally-public RPCs; it grants nothing to `anon`/`PUBLIC`; and it touches no
table, row, policy or trigger. Finally it pins the rollback: never re-grants
`anon`/`PUBLIC`, never restores a NULL-unsafe comparison, drops nothing, and its only
`delete from` statements are the three single-row owner-checked deletes.

### 5.2 Behavioural proof (NOT DONE — stated plainly)

**No proof against a live database has been executed.** Reason: no safe target existed in
this session — the Supabase CLI is not installed and Docker is not running, so no local
Postgres could be started; a Supabase dev branch is a paid resource and therefore an owner
decision; and running write probes against production is outside the authorised scope of
this loop.

The proof is written and shipped, ready to run:
`supabase/tests/20260722120000_secdef_anon_authz_bypass_verification.sql`.

| Proof | Asserts |
|---|---|
| 1 | `anon` holds no EXECUTE on any of the seven |
| 2 | an unauthenticated caller cannot mutate — **row state compared before/after**, not just the exception |
| 3 | an authenticated non-owner cannot UPDATE or DELETE — state and row count compared |
| 4 | the legitimate owner **can** still act (no functional regression) |
| 5 | a non-existent id is not answered as authorized |
| 6 | content (title) is unchanged after a rejected UPDATE |
| 7 | the other four RPCs also refuse `anon`, and rows stay intact |
| 8 | catalog: no `PUBLIC` or `anon` entry in any of the seven ACLs |
| 9 | catalog: `authenticated` retains EXECUTE on all seven (product contract) |

The script runs inside one transaction ending in `ROLLBACK`, contains no `COMMIT`, seeds
only rows it creates itself, and finishes with a row-count query proving it left nothing
behind.

**Run it twice and record both outputs:** before the apply, proofs 1–8 are *expected to
fail* — that failure is the reproduction of the defect. After the apply, all nine must
pass.

### 5.3 Repo gates

| Gate | Result |
|---|---|
| New guard test | ✅ 72/72 |
| `migration-safety` | see PR checks — the migration is RED by design (`SECURITY DEFINER` + `GRANT`/`REVOKE`) and carries `-- @human-gate-approved`, which permits CI to pass while forcing the human gate |
| typecheck / lint / full test suite / build | see PR checks |

---

## 6. Production apply — OWNER GATE

**Do not proceed without explicit owner approval.** Per `AGENTS.md`, RED-class migrations
are applied manually via Supabase MCP `apply_migration` — **never** `supabase db push`
(repo filenames do not match ledger versions; a push would re-run applied migrations).

**Order of operations:**

1. **Reproduce first.** Run `supabase/tests/20260722120000_secdef_anon_authz_bypass_verification.sql`
   against production. Expect proofs 1–8 to FAIL. Record the output.
2. **Apply.** Supabase MCP `apply_migration`, name
   `20260722120000_secdef_anon_authz_bypass_fix_v1`, body = the migration file verbatim.
3. **Verify.** Re-run the same script. **All nine proofs must PASS.** Record the output.
4. **Confirm the ACLs directly:**

```sql
select p.proname, p.proacl::text,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('delete_contract_v1','set_contract_status_v1',
                    'delete_proposal_v1','set_proposal_status_v1',
                    'delete_marketplace_listing_v1',
                    'set_marketplace_listing_status_v1',
                    'update_marketplace_listing_v1')
order by p.proname;
-- expected: anon_exec = false and auth_exec = true for all seven,
--           and no `=X/` (PUBLIC) entry in any proacl
```

5. **Confirm the schema-wide count dropped from 54 to 47:**

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE');
-- expected: 47  (54 - 7). The remaining 47 are inventoried and are NOT part of this PR.
```

6. **Record** in `docs/APPLIED_LEDGER.md` as
   `APPLIED TO PROD: 20260722120000_secdef_anon_authz_bypass_fix_v1 (rollback: supabase/rollbacks/20260722120000_secdef_anon_authz_bypass_fix_v1.down.sql)`,
   **including the verification output** — per `AGENTS.md` §Migrations (d). Do not repeat
   the original mistake of recording a verification that did not test the unauthenticated
   case.

---

## 7. Rollback

`supabase/rollbacks/20260722120000_secdef_anon_authz_bypass_fix_v1.down.sql`

**It deliberately does not restore the vulnerable state.** It never re-grants `PUBLIC` or
`anon`, never restores the NULL-unsafe comparison, drops no function, and touches no
existing row. Its purpose is to restore each function's **business logic** if a regression
appears in the rewritten bodies, while keeping the security fix in place.

Because the forward migration changed only the two authorization lines, running this
rollback after a correct apply is a functional no-op. That is intentional: for a security
fix, the safest rollback is one that cannot reopen the hole.

Removing the functions entirely is **not** this file's job and would break the commercial
CRM and marketplace write paths for legitimate owners. That would be a separate,
owner-approved decision.

---

## 8. Residual risk after this PR

| Risk | Status |
|---|---|
| The other **47** anon-reachable `SECURITY DEFINER` functions | **OPEN** — 3 have no authorization logic at all (protected only by a `NOT NULL` constraint error), 40 currently fail closed, 4 are intentionally public. Inventory: `docs/security/secdef-public-execute-inventory-v1.md`. Follow-up PR. |
| Recurrence | **OPEN** until a catalog guard asserts that exactly 4 `SECURITY DEFINER` functions are anon-executable. This defect already recurred across two independent migrations; without a standing assertion it will recur again. |
| Behavioural proof | **OPEN** until §6 steps 1 and 3 are run and recorded. |
| External HTTP reachability | **NOT TESTED.** The bypass is proven at the database authorization layer. No unauthenticated write was issued to the production REST endpoint. |
| Whether the three tables were ever non-empty since 2026-07-18 | **UNKNOWN.** All three are empty now; no historical row-count series exists to prove they always were. |
