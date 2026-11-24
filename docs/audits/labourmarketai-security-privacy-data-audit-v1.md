# labourmarket.ai — Security, GDPR & Data audit v1

**Date:** 2026-07-22
**Repo:** `C:\Users\Mano\Documents\labourmarketai`
**Branch / HEAD:** `main` @ `664b9ab9` (clean tree, no modifications made)
**Production:** https://labourmarket.ai
**Supabase prod ref:** `gorgitwvdzxbnaxhrsrw` (PostgreSQL 17.6)
**Audit loop:** 6 of the full product audit (Security, GDPR & Data)

## Method

- Catalog introspection and behavioural probes against **production** via Supabase MCP `execute_sql`, restricted to `SELECT` / catalog reads plus five `DO $$ … RAISE EXCEPTION $$` blocks that force a full transaction rollback. Every probe left **zero rows** behind (verified by the probe's own post-state read inside the same aborted transaction).
- Static reading of `supabase/migrations/*.sql`, `apps/web/**`, `docs/**`, `.github/workflows/**`.
- `pnpm audit --json` at repo root (read-only).

## Read-only statement

This audit made **no** writes: no commits, no pushes, no PRs, no migrations, no source edits, no config changes, no `apply_migration`, no grant/policy changes. The only file created is this document. `git status` was clean before and after (aside from this file). All probe transactions were aborted by design.

## Secret handling in this document

No secret, key, token, or password **value** appears anywhere below. Secrets are referenced by variable **NAME** only; any value is written `[redacted]`.

---

# 1. Executive risk summary

| # | Finding | Severity | Status |
|---|---|---|---|
| **SEC-01** | **Unauthenticated authorization bypass in 7 production RPCs** — an anonymous caller can DELETE and MODIFY any contract, proposal, and marketplace listing by id. **Proven live in production** (rolled back). | **P0 / CRITICAL** | **Exploitable now** |
| **SEC-02** | 50 of 205 `SECURITY DEFINER` functions carry a residual `PUBLIC` EXECUTE grant, exposing them to `anon`. Root cause of SEC-01's reachability. Migrations + `APPLIED_LEDGER.md` repeatedly and falsely state "authenticated only, no anon". | P1 / HIGH | Confirmed |
| **SEC-03** | 3 create-RPCs (`create_contract_v1`, `create_proposal_v1`, `create_marketplace_listing_v1`) contain **no authorization check at all**. Anonymous writes are stopped only by an incidental `NOT NULL` column constraint. | P1 / HIGH | Confirmed |
| **SEC-04** | Public company-need intake, `/api/leads` (service-role, RLS-bypassing) and `/api/waitlist` accept unbounded anonymous PII writes with no rate limit, captcha, or honeypot. | P1 / HIGH | Confirmed |
| **SEC-05** | `organizations_select` is `USING (true)` — every authenticated user can read every organization row, including `public_contact_email` / `public_contact_phone`, regardless of `public_profile_enabled`. | P2 / MEDIUM | Confirmed |
| **SEC-06** | GDPR **erasure (Art. 17) is not implemented** — request intake only; zero deletion/anonymisation code exists. | P2 / MEDIUM (legal) | Confirmed |
| **SEC-07** | **No retention period is enforced anywhere** (Art. 5(1)(e)). No cron of any kind; expiry RPCs never called. One UI string promises a 30-day voice-recording retention and a delete control that do not exist. | P2 / MEDIUM (legal) | Confirmed |
| **SEC-08** | No cookie/ePrivacy consent step, while first-party analytics and a `sessionStorage` analytics id fire for anonymous visitors; the cookie policy page states the opposite. | P2 / MEDIUM (legal) | Confirmed |
| **SEC-09** | `audit_logs` is **not** append-only despite two in-schema comments claiming it is (no blocking trigger, an `updated_at` BEFORE UPDATE trigger, no `FORCE RLS`). | P2 / MEDIUM | Confirmed |
| **SEC-10** | MFA cannot be enrolled by anyone (0 verified factors in prod, enrollment guard-forbidden); leaked-password protection DISABLED; OTP expiry > 1 hour. | P2 / MEDIUM | Confirmed |
| **SEC-11** | `sharp` 0.34.5 (HIGH) and `postcss` 8.4.31 (MODERATE) reach the production build via `next`; no dependency audit runs in CI. | P2 / MEDIUM | Confirmed |
| **SEC-12** | No backup/restore or disaster-recovery runbook; `docs/DEPLOYMENT.md` has no rollback section and is materially stale; incident-response doc names no owner, contact, or thresholds. | P2 / MEDIUM | Confirmed |
| **SEC-13** | Documentation contradicts reality in ≥6 verified places, including `APPLIED_LEDGER.md` missing an applied RED-class migration. | P3 / LOW | Confirmed |
| **SEC-14** | Anonymous existence oracle: `delete_*_v1` RPCs return silently for a non-existent id but raise for an existing one. | P3 / LOW | Confirmed |
| **SEC-15** | `no-secret-leakage` guard scans only `apps/web/{lib,app,scripts}` — `supabase/`, `docs/`, `services/`, root `scripts/` are outside its scope. | P3 / LOW | Confirmed |
| **SEC-16** | `/api/cv/extract` is auth-gated but unthrottled (PDF/DOCX parsing CPU amplification). | P3 / LOW | Confirmed |
| **SEC-17** | Avatar signed URLs use a 1-hour TTL vs 5 minutes elsewhere. | P3 / LOW | Confirmed |
| **SEC-18** | `customer_requests_status_transition_guard` has a mutable `search_path` (Supabase advisor WARN). | P3 / LOW | Confirmed |

### What is genuinely strong (verified, not assumed)

- **Admin privilege escalation is properly blocked** by a dedicated trigger — proven with a rollback probe (§6).
- **All four storage buckets are private**; every read is a signed URL; no `getPublicUrl` in application code.
- **No secret is committed**; no server-only secret is `NEXT_PUBLIC_`-prefixed; `admin.ts` is `server-only`-pinned; no secret is logged.
- **The Stripe webhook is correctly verified** (raw body + SDK `constructEvent` + idempotency + live-event rejection).
- **RLS is enabled on all 129 public tables.** No table has RLS off.
- **Product consent (`privacy_consent_*`) is real and fail-closed** — versioned, hashed, append-only by trigger, and it actually gates `workers` visibility via RLS.
- **Data-subject EXPORT works** (JSON + CSV, RLS-scoped, reachable from real UI buttons).
- **Data minimisation is well handled** — server-side telemetry allowlist, PII-free analytics pinned by guards, logs carry codes only.
- The **fail-closed `exists()` authorization pattern** used by 19 other RPCs is correct; SEC-01 is a localized regression in two migrations, not a systemic design failure.

---

# 2. SEC-01 — Unauthenticated authorization bypass (P0)

## The bug

Seven RPCs authorize with a **NULL-unsafe direct comparison**:

```sql
select owner_id into v_owner from public.contracts where id = p_contract_id;
if v_owner is null then return; end if;
if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
delete from public.contracts where id = p_contract_id;
```
— `supabase/migrations/20260718190000_commercial_crm.sql:120,137,173,184`
— `supabase/migrations/20260718210000_marketplace_listings.sql:125,148,159`

For an **unauthenticated** caller `auth.uid()` is `NULL`. In SQL three-valued logic `v_owner <> NULL` evaluates to `NULL`, and PL/pgSQL treats a `NULL` `IF` condition as **false**. The `raise exception` therefore never fires, and execution falls through to the `DELETE` / `UPDATE`.

Because the functions are `SECURITY DEFINER` owned by `postgres`, RLS on the target table is bypassed. Because `anon` holds EXECUTE (SEC-02), they are reachable over the public PostgREST endpoint at `POST /rest/v1/rpc/<name>` using the publishable anon key.

The `v_owner is null` early-return does **not** help: `owner_id` is `NOT NULL` on all three tables, so `v_owner` is only NULL when the row does not exist.

## Production proof (rolled back, zero rows left)

Probe 1 — `public.proposals`, role `anon`, `request.jwt.claims = {"role":"anon"}` (no `sub`):

```
PROBE_RESULT || set_status=NO_ERROR; delete=NO_ERROR;
               rows_left=0 status_now=<row gone>
```

Probe 2 — `public.contracts` + `public.marketplace_listings`, same role:

```
PROBE2 || set_contract=NO_ERROR; upd_listing=NO_ERROR;
          del_contract=NO_ERROR; del_listing=NO_ERROR;
          create_proposal=BLOCKED[23502]; create_listing=BLOCKED[23502];
          submit_need=NO_ERROR;
          contracts_left=0 listings_left=0
```

Probe 3 — state mutation confirmed, not just absence of error:

```
PROBE3 || set_listing_status=NO_ERROR;  status_now=closed
```

`status_now=closed` is the decisive evidence: the anonymous caller did not merely avoid an exception, it **changed the row**.

Each probe seeded its own row as `postgres`, switched to `anon` via `SET LOCAL ROLE`, called the RPC, reset the role, read the post-state, then `RAISE EXCEPTION` to abort. Nothing persisted.

## Current blast radius

`contracts`, `proposals`, `marketplace_listings` all hold **0 rows in production today** (verified). So there is **no data loss right now**. The vulnerability is nonetheless live and becomes exploitable the moment the first real user creates a proposal, contract, or listing — which is exactly what the Commercial CRM and Marketplace wagons were shipped to enable. Object ids are UUIDv4, so blind enumeration is impractical, but any id that leaks (a shared link, a screenshot, a support ticket, an API response) becomes a delete-anything primitive.

## Why the ledger's "verified" claim missed it

`docs/APPLIED_LEDGER.md:92` records for `20260718190000_commercial_crm.sql`:

> "Post-apply verified: authenticated proof (owner create→send→accept→contract OK; **non-owner rejected**) rolled back, 0 test rows."

The verification exercised a *non-owner* — an **authenticated** user, whose `auth.uid()` is non-NULL, for whom `v_owner <> auth.uid()` correctly evaluates to `true`. The **unauthenticated** case was never tested. The same gap applies to `20260718210000` (`APPLIED_LEDGER.md:96`).

The repo already knows the correct pattern — `supabase/migrations/20260716121000_request_rate_limits_v3.sql:50-52` opens with `if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;`. Wagons 10 and 13 simply did not use it.

---

# 3. The 54-function anon-executable sweep

## Aggregate (production catalog, 2026-07-22)

| Metric | Value |
|---|---|
| `SECURITY DEFINER` functions in `public` | 205 |
| …executable by `anon` | **54** |
| — of which return `trigger` (not callable via PostgREST) | 9 |
| — of which are callable | **45** |
| Exposed via `proacl IS NULL` (never granted at all → implicit PUBLIC) | 18 |
| Exposed via residual leading `=X/postgres` PUBLIC grant | 32 |
| Exposed via **intentional** explicit `anon=X` grant | 4 |

Root cause reconfirmed: migrations ran `GRANT EXECUTE … TO authenticated` but never `REVOKE EXECUTE … FROM PUBLIC`. Only one migration in the entire repo does it correctly — `supabase/migrations/20260608140000_worker_work_card_execute_hardening.sql:21-24` (4 `revoke execute` lines total across 161 migrations).

## Classification legend

| Class | Meaning |
|---|---|
| **EXPLOITABLE** | Anonymous caller achieves a real state change. Proven. |
| **NO_AUTHZ_CHECK** | No authorization logic exists; anonymous call is stopped only by an incidental schema constraint. Fragile. |
| **INTENTIONALLY_PUBLIC** | Explicit `anon` grant, public-by-design, output scoped. |
| **BLOCKED_BY_BODY_CHECK** | Fail-closed `if not <exists(...)> then raise` — `exists()` returns `false` (never NULL) for anon. |
| **PREDICATE_ONLY** | Boolean/text helper returning `false`/`NULL` for anon; no state change, no data return. |
| **TRIGGER_NOT_CALLABLE** | Returns `trigger`; PostgREST does not expose it and direct invocation errors. |

## The table

| # | Function | Class | Reasoning / evidence |
|---|---|---|---|
| 1 | `delete_contract_v1` | **EXPLOITABLE** | `v_owner <> auth.uid()` NULL-compare. Probe 2: `del_contract=NO_ERROR`, `contracts_left=0`. `20260718190000:137` |
| 2 | `delete_proposal_v1` | **EXPLOITABLE** | Same. Probe 1: `delete=NO_ERROR`, `rows_left=0`. `20260718190000:120` |
| 3 | `delete_marketplace_listing_v1` | **EXPLOITABLE** | Same. Probe 2: `del_listing=NO_ERROR`, `listings_left=0`. `20260718210000:159` |
| 4 | `set_contract_status_v1` | **EXPLOITABLE** | Same. Probe 2: `set_contract=NO_ERROR`. `20260718190000:184` |
| 5 | `set_proposal_status_v1` | **EXPLOITABLE** | Same. Probe 1: `set_status=NO_ERROR`. `20260718190000:173` |
| 6 | `set_marketplace_listing_status_v1` | **EXPLOITABLE** | Same. Probe 3: `status_now=closed`. `20260718210000:148` |
| 7 | `update_marketplace_listing_v1` | **EXPLOITABLE** | Same; rewrites title/category/description/location/price. Probe 2: `upd_listing=NO_ERROR`. `20260718210000:125` |
| 8 | `create_contract_v1` | **NO_AUTHZ_CHECK** | Body validates title/value/dates only, then inserts `owner_id = auth.uid()`. `contracts.owner_id` is `NOT NULL` ⇒ 23502. Zero authz logic. |
| 9 | `create_proposal_v1` | **NO_AUTHZ_CHECK** | Same shape. Probe 2: `create_proposal=BLOCKED[23502]` — a not-null violation, **not** an authorization refusal. |
| 10 | `create_marketplace_listing_v1` | **NO_AUTHZ_CHECK** | Authz runs **only** when `p_organization_id` or `p_project_id` is non-NULL; with both NULL no check runs. Probe 2: `create_listing=BLOCKED[23502]`. |
| 11 | `get_public_business_profile_v1` | INTENTIONALLY_PUBLIC | Explicit `anon=X`; filters `public_profile_enabled = true`, single row by slug. |
| 12 | `get_public_business_listings_v1` | INTENTIONALLY_PUBLIC | Explicit `anon=X`; joins `public_profile_enabled = true AND status='active'`, `limit 50`. |
| 13 | `get_public_business_services_v1` | INTENTIONALLY_PUBLIC | Explicit `anon=X`; same gating, `limit 50`. |
| 14 | `submit_company_need_public_v1` | INTENTIONALLY_PUBLIC | Explicit `anon=X` (`20260707120000:209`). Strong input validation (closed enums, length caps, 10-country allowlist, email regex). **But no volume cap** — see SEC-04. Probe 2: `submit_need=NO_ERROR`. |
| 15 | `add_project_stage_v1` | BLOCKED_BY_BODY_CHECK | `if not can_manage_project(...)`. Probed: `BLOCKED[not authorized to manage this project]`. |
| 16 | `update_project_stage_v1` | BLOCKED_BY_BODY_CHECK | `can_manage_project` after row lookup. |
| 17 | `delete_project_stage_v1` | BLOCKED_BY_BODY_CHECK | `can_manage_project`. (Silent early-return on missing id → see SEC-14.) |
| 18 | `set_project_budget_v1` | BLOCKED_BY_BODY_CHECK | Probed: `BLOCKED[not authorized to manage this project]`. |
| 19 | `set_project_budget_status_v1` | BLOCKED_BY_BODY_CHECK | `can_manage_project`. |
| 20 | `delete_project_budget_v1` | BLOCKED_BY_BODY_CHECK | `can_manage_project`. (SEC-14.) |
| 21 | `report_defect_v1` | BLOCKED_BY_BODY_CHECK | `can_manage_project`. Previously probed: `P0001 not authorized to manage this project`. |
| 22 | `set_defect_status_v1` | BLOCKED_BY_BODY_CHECK | `caller_manages_defect` → `can_manage_project`. |
| 23 | `delete_defect_v1` | BLOCKED_BY_BODY_CHECK | `caller_manages_defect`. |
| 24 | `add_defect_correction_v1` | BLOCKED_BY_BODY_CHECK | `caller_manages_defect`. |
| 25 | `create_asset_v1` | BLOCKED_BY_BODY_CHECK | `manages_organization`. Probed: `BLOCKED[not authorized to manage this organization]`. |
| 26 | `issue_asset_v1` | BLOCKED_BY_BODY_CHECK | `caller_manages_asset` → `manages_organization`. |
| 27 | `return_asset_v1` | BLOCKED_BY_BODY_CHECK | `caller_manages_asset`. |
| 28 | `transfer_asset_assignment_v1` | BLOCKED_BY_BODY_CHECK | `caller_manages_asset`. |
| 29 | `acknowledge_asset_assignment_v1` | BLOCKED_BY_BODY_CHECK | `if not exists (… workers w … w.profile_id = auth.uid())` — `exists` ⇒ `false` for anon. |
| 30 | `request_worker_absence_v1` | BLOCKED_BY_BODY_CHECK | Same `exists(workers…)` gate. |
| 31 | `cancel_worker_absence_v1` | BLOCKED_BY_BODY_CHECK | Same. |
| 32 | `review_worker_absence_v1` | BLOCKED_BY_BODY_CHECK | `caller_manages_worker`. |
| 33 | `set_business_public_profile_v1` | BLOCKED_BY_BODY_CHECK | `manages_organization(...) OR exists(owner_profile_id = auth.uid())`. Probed: `BLOCKED[not authorized]`. |
| 34 | `is_admin` | PREDICATE_ONLY | Probed as anon: `false`. |
| 35 | `is_employer` | PREDICATE_ONLY | `coalesce(…, false)`. |
| 36 | `profile_role` | PREDICATE_ONLY | `select active_role … where id = auth.uid()` ⇒ no row ⇒ NULL. |
| 37 | `owns_company` | PREDICATE_ONLY | `exists(… profile_id = auth.uid())` ⇒ false. |
| 38 | `owns_agency` | PREDICATE_ONLY | Same shape. |
| 39 | `owns_customer` | PREDICATE_ONLY | Same shape. |
| 40 | `owns_worker` | PREDICATE_ONLY | Same shape. |
| 41 | `manages_organization` | PREDICATE_ONLY | `exists(engagement_contexts … profile_id = auth.uid())` ⇒ false. |
| 42 | `can_access_match` | PREDICATE_ONLY | `exists(… w.profile_id = auth.uid() or co.profile_id = auth.uid())` ⇒ false. |
| 43 | `caller_manages_asset` | PREDICATE_ONLY | Delegates to `manages_organization`. |
| 44 | `caller_manages_defect` | PREDICATE_ONLY | Delegates to `can_manage_project`. |
| 45 | `asset_open_assignment_for_caller` | PREDICATE_ONLY | `exists(… w.profile_id = auth.uid())` ⇒ false. |
| 46 | `handle_new_user` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 47 | `ensure_worker_profile` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 48 | `ensure_org_owner_engagement` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 49 | `ensure_worker_personal_engagement` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 50 | `enforce_company_verification_guard` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 51 | `journal_entry_confirmations_guard` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 52 | `learning_review_queue_guard_stale` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 53 | `mirror_company_to_org` | TRIGGER_NOT_CALLABLE | returns `trigger` |
| 54 | `mirror_agency_to_org` | TRIGGER_NOT_CALLABLE | returns `trigger` |

**Totals: 7 EXPLOITABLE · 3 NO_AUTHZ_CHECK · 4 INTENTIONALLY_PUBLIC · 19 BLOCKED_BY_BODY_CHECK · 12 PREDICATE_ONLY · 9 TRIGGER_NOT_CALLABLE = 54.**

A repo-wide catalog sweep for the vulnerable pattern (`(<>|!=)\s*auth\.uid\(\)`) returned exactly 8 functions: the 7 above plus `conversation_counterpart_identities`, which is **not** anon-executable and therefore not exploitable by this route.

### Verdict on the pre-established finding

The grant leak is **both**: P1 as a defense-in-depth failure plus false documentation (SEC-02), **and** the enabling condition for a genuine **P0 anonymous data path** (SEC-01). The earlier `report_defect_v1` probe was accurate but unrepresentative — it sampled a function using the safe `exists()` pattern.

---

# 4. RLS coverage

**All 129 tables in `public` have `relrowsecurity = true`. Zero tables have RLS disabled.** No table sets `FORCE ROW LEVEL SECURITY`, so `postgres`, `service_role`, and `SECURITY DEFINER` bodies bypass RLS everywhere (normal for Supabase, but it is why SEC-01 is effective).

## Tables needing attention

| Table | Condition | Detail | Risk |
|---|---|---|---|
| `company_need_public_intakes` | RLS on, **0 policies** | Deliberate deny-all. `anon`/`authenticated` have no grants; `service_role` holds `SELECT` + `UPDATE(status)` only (`20260713190000`). Fail-closed and documented at `20260707120000:84-87`. | **OK by design** (this is the advisor's INFO lint) |
| `organizations` | `organizations_select USING (true)`, roles = PUBLIC | Table ACL is `authenticated=r` only, so `anon` cannot read — but **every logged-in user reads every organization row**, including `public_contact_email`, `public_contact_phone`, `description`, `website`, irrespective of `public_profile_enabled`. This defeats the purpose of `set_business_public_profile_v1`'s enable flag and of the `get_public_business_*` gating. | **SEC-05 / MEDIUM** |
| `market_intelligence_sources` | `USING (true)` for `authenticated` | Source registry metadata (all externals OFF). Non-personal. | LOW / accept |
| `waitlist` | `waitlist_insert_anon` INSERT `WITH CHECK (true)` for `anon` | Intentional public funnel; ACL is `anon=a` (insert only, no select). But **no rate limit and no bot protection** — SEC-04. 3 rows in prod. | MEDIUM (via SEC-04) |
| `pilot_events` | INSERT `WITH CHECK (profile_id IS NULL OR profile_id = auth.uid())` for `anon` | Analytics ingest. Column caps enforced. SELECT is `is_admin()`. But it is the ePrivacy exposure in SEC-08 and is unthrottled. | MEDIUM (via SEC-08) |
| `audit_logs` | SELECT + INSERT both `is_admin()`; **no UPDATE/DELETE policy** | Append-only at the RLS layer only — see SEC-09. | MEDIUM |
| Reference tables | `USING (true)` reads | `countries`, `skills`, `plans`, `professions`, `profession_templates`, `profession_skills`, `education_types`, `achievement_types`, `relationship_types`, `productivity_units`, `skill_icons`, `skill_seed_benchmarks`, `platform_skill_aggregates` — all `authenticated`-only, non-personal catalog data. | OK |

## Anon table grants (complete)

Only two tables grant anything to `anon`, both INSERT-only, neither readable:

- `waitlist` — `{anon=a/postgres}`
- `pilot_events` — `{anon=a/postgres}`

No table grants `anon` SELECT, UPDATE, or DELETE. **All personal-data tables (`profiles`, `workers`, `journal_entries`, `worker_documents`, `conversations`, `consents`, `privacy_consent_events`, …) are correctly owner-scoped or admin-scoped.**

---

# 5. GDPR rights & obligations (4-state classification)

| Obligation | State | Evidence |
|---|---|---|
| **Consent — product purposes** | **IMPLEMENTED** | Two server-defined purposes (`apps/web/lib/privacy/consent-definitions.ts:30-34`), versioned texts in 5 locales, deterministic hash (`:274-281`). Ledger append-only **by trigger**: `supabase/migrations/20260711130000_privacy_consent_and_disclosure_v1.sql:135,140-141` (verified live: trigger `privacy_consent_events_append_only`). Consent genuinely gates access — `worker_profile_discoverable()` (`:224-243`) returns false on a stale version, and `can_view_worker()` (`:245-295`) is the RLS predicate on `workers`/`worker_skills`/`worker_professions` (`:316,321,326`). Prod: 2 purposes at version `2026-07-11.v2`, 1 event. |
| **Consent — cookies / ePrivacy** | **MISSING** | No banner/CMP component exists anywhere. Yet `apps/web/components/marketing/answer-analytics.tsx:10-17` fires `answer_page_viewed` for anonymous visitors, and `apps/web/lib/telemetry/task.ts:30-51` mints a pseudonymous id in **sessionStorage** — terminal-equipment storage that is not "strictly necessary" under ePrivacy Art. 5(3). `pilot_events` grants anonymous INSERT. **The cookie policy asserts the opposite**: `apps/web/app/[locale]/(marketing)/legal/cookies/page.tsx:16` "NO analytics / advertising / third-party tracking cookies exist"; `apps/web/messages/en.json:5004`. The policy also discloses only a theme value in localStorage (`en.json:5003`), never the analytics session id. **SEC-08.** |
| **Privacy policy / terms published** | **IMPLEMENTED (non-binding)** | 7 real routes under `apps/web/app/[locale]/(marketing)/legal/`, footer-linked at `apps/web/components/layouts/site-footer.tsx:101-119`. Substantive content: controller named (`en.json:4917-4920`, UAB "Nonstop Group", company code 302676973), no DPO appointed, VDAI named as supervisory authority; rights `:4966-4969`; retention `:4972-4977`. **But every page renders `PendingLegalNotice`** (`legal/privacy/page.tsx:53-55`) stating the binding wording is still being prepared — so no binding privacy notice is in force. Honest, but a launch blocker. |
| **Right of access / view (Art. 15)** | **IMPLEMENTED** | In-product visibility plus the export bundle; consent history at `apps/web/app/[locale]/dashboard/privacy/page.tsx:266-299`. |
| **Rectification (Art. 16)** | **IMPLEMENTED** | RLS-scoped update actions, e.g. `apps/web/lib/worker/profile-text-actions.ts:26-49`; also `worker-education-actions.ts`, `worker-languages-actions.ts`, `worker-achievements-actions.ts`. Journal uses a deliberate correction/supersede lifecycle (`apps/web/lib/journal/actions.ts:474,576-586`) rather than in-place edit — an integrity design, already flagged for privacy-copy explanation at `docs/compliance/gdpr-readiness-v1.md:29`. |
| **Portability / export (Art. 20)** | **IMPLEMENTED** | Builder `apps/web/lib/privacy/export-data.ts:49-101` (RLS-scoped reads of `profiles`, `consents`, `workers`, `journal_entries`, `worker_skills`, `worker_documents` metadata — **no service role**); route `apps/web/app/[locale]/dashboard/privacy/export/route.ts:14-29`; reachable button `dashboard/privacy/page.tsx:312-318`. Second CSV export `dashboard/journal/export/route.ts:24-40`, linked at `dashboard/reports/page.tsx:257-261`. Exclusions declared inside the bundle (`export-data.ts:42-47`). |
| **Erasure (Art. 17)** | **PARTIAL — intake only** | UI `apps/web/components/app/privacy-deletion-request.tsx:49-111` → action `apps/web/lib/privacy/actions.ts:40-66` → RPC `submit_privacy_request_v1` (`supabase/migrations/20260706150000_privacy_request_intake.sql:41-80`). The migration states it plainly at `:14-16`: *"Nothing in this migration deletes ANY data … the actual deletion stays a manual, owner-reviewed step."* **There is no `deleteUser`, no `admin.deleteUser`, no anonymisation routine, no storage-cleanup job anywhere in `apps/`** — the only `deleteUser` hit is a negative assertion at `apps/web/lib/auth/logout-route.test.ts:107`. Fulfilment relies on `ON DELETE CASCADE` executed by hand (`docs/compliance/privacy-requests-v1.md:43-47`). **SEC-06.** |
| **Retention limitation (Art. 5(1)(e))** | **DOCUMENTED_ONLY** | **No scheduler of any kind exists.** `pg_cron` is **not installed** in prod (`pg_extension` check: false). `.github/workflows/` has no `schedule:` trigger. No `vercel.json`, so no Vercel Cron. Guard tests actively assert `.not.toMatch(/pg_cron|cron\.schedule/i)` (`apps/web/lib/guards/booking-lifecycle.test.ts:233`). Expiry RPCs (`expire_contact_disclosure_requests_v1`, `expire_stale_team_enquiries_v1`, `lmc_expire_lots_v1`) exist but have **no caller** in any route, action, or job. Docs concede it: `docs/legal/processing-activities-register-v1.md:7,16` (retention cell literally reads `VERIFY`), `docs/legal/legal-basis-matrix-v1.md:35`, `en.json:4976`. **Plus a false promise:** `apps/web/messages/en/journal.json:296` (all locales), rendered at `apps/web/components/app/voice-journal-recorder.tsx:273`, tells users the recording *"is kept only until your text is ready (at most 30 days) and you can delete it at any time"* — while `apps/web/lib/voice/transcribe-action.ts:21-26` confirms **no database write and no persistence at all**, and no delete control exists. **SEC-07.** |
| **Data minimisation (Art. 5(1)(c))** | **IMPLEMENTED** | Server-side metadata allowlist with 200-char / 2 KB caps and server-derived `profile_id` (`apps/web/lib/telemetry/actions.ts:12-24`, explicitly "We DO NOT log the auth code, cookies, tokens, full URL, or any free-text profile / journal body"); column caps mirrored at `supabase/migrations/0020_pilot_events.sql:30-40`. Analytics payloads carry no PII (`answer-analytics.tsx:15`, pinned by `apps/web/lib/guards/answer-engine-publishing-static.test.ts:64`, `opportunity-directions.test.ts:116-128`). ~40 sampled `console.error` sites log `error.code`/`error.message` only. Employer views anonymised by construction (`apps/web/lib/visibility/worker-profile-visibility.ts:111-174`). Export deliberately excludes third parties (`export-data.ts:17-21`). |
| **Audit / accountability logging** | **PARTIAL** | ~50 SECURITY DEFINER RPCs insert into `audit_logs`. Prod: 31 rows, 2026-05-30 → 2026-07-12, 7 distinct actions (`accept_company_worker_invitation`, `add_org_member`, `admin_set_company_verification`, `assign_company_worker_role`, `confirm_entry_and_verify_skills`, `review_journal_entry`, `set_engagement_journal_review`). **Not append-only** — see SEC-09. |
| **Security of processing (Art. 32) — MFA** | **DOCUMENTED_ONLY** | `apps/web/app/[locale]/dashboard/account/page.tsx:81-91` performs a read-only `mfa.listFactors()`; the comment at `:72-77` states enrollment is deliberately deferred, and a guard **forbids** enrollment code: `apps/web/lib/guards/account-security-benefit.test.ts:56` asserts the page does not match `/mfa\.enroll\(|mfa-enroll|enrollMfa/`. No `aal2` check anywhere. Prod: **0 verified MFA factors across 27 auth users**, including the single admin. **SEC-10.** |
| **Breach notification readiness** | **PARTIAL** | `docs/security/incident-response-v1.md` exists and §2 is concrete (names `auth.admin.signOut`, Supabase MCP `get_logs`, the `runtime/incidents/<date>-<slug>.md` record path). But it is self-labelled "Draft for owner review", names **no owner/on-call, no contact address, no severity tiers, no time thresholds**; §3 defers all wording to a lawyer; §5 admits no published vulnerability-disclosure contact and no secret-rotation runbook. **SEC-12.** |

---

# 6. Admin privileges

**How `is_admin()` is decided** (live definition):

```sql
select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
    or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin')
```

**Who has it in production:** `profiles.active_role='admin'` → **0**; `profile_roles.role='admin'` → **1 distinct profile**. One admin total, out of 27 auth users. (Count only; no identifiers recorded.)

**Can it be escalated? No — verified.** The surface *looks* escalatable: `authenticated` holds table-level `arwd` on both `profile_roles` and `profiles`; the RLS `WITH CHECK` is `(profile_id = auth.uid()) OR is_admin()`; and `'admin'` is inside both CHECK constraints (`profile_roles_role_check`, `profiles_active_role_check`). A user self-inserting `(own_uid, 'admin')` would satisfy every one of those.

A rollback probe as `authenticated` with a real non-admin `sub` proved both paths are blocked:

```
ESCALATION_PROBE2 || auth_uid_matches=true;
  insert_admin_role=BLOCKED[42501|admin role can only be granted by an existing admin or the owner service-role script];
  set_active_role_admin=BLOCKED[42501|admin role can only be granted by an existing admin or the owner service-role script];
```

The defence is a dedicated trigger pair, not RLS:
- `trg_profile_roles_admin_grant_guard` — `BEFORE INSERT OR UPDATE OF role ON public.profile_roles`
- `trg_profiles_admin_grant_guard` — `BEFORE INSERT OR UPDATE OF active_role ON public.profiles`
- both → `enforce_admin_grant_guard()`, from `supabase/migrations/20260702130000_admin_grant_guard.sql:45`

**This is exactly the right pattern**, and it is the same pattern SEC-01 needs. Note the residual fragility: the CHECK constraints and RLS policies still permit `'admin'`; only the trigger stands between a user and admin. If that trigger is ever dropped or a table is recreated without it, escalation becomes trivially available. Worth a defence-in-depth follow-up, not a current finding.

---

# 7. Storage & file access

**All four buckets are private (`public = false`) in production** — verified against `storage.buckets`:

| Bucket | `public` | Size cap | MIME allowlist | Created by |
|---|---|---|---|---|
| `customer-request-attachments` | `false` | 10 MB | pdf, jpeg, png, webp, txt | `supabase/migrations/0029_customer_request_attachments.sql:184-198` |
| `journal-entry-photos` | `false` | 5 MB | jpeg, png, webp | `20260612091000_journal_entry_photos.sql:172-186` |
| `conversation-attachments` | `false` | 10 MB | pdf, jpeg, png, webp, txt | `20260712130000_conversation_message_attachments.sql:232-246` |
| `profile-avatars` | `false` | 5 MB | jpeg, png, webp | `20260623200000_profile_avatar.sql:49-59` |

17 RLS policies on `storage.objects`; **every** SELECT/DELETE/UPDATE policy requires `auth.uid() IS NOT NULL` plus either path-segment ownership (`(storage.foldername(name))[1] = auth.uid()::text`), participant membership (`is_conversation_participant_path(name)`), org-manager scope, or `is_admin()`. No always-true policy, no anon-reachable object.

**No `getPublicUrl` exists in application code.** Every read is a signed URL: `apps/web/lib/communication/attachments.ts:82-84` (300 s), `apps/web/lib/journal/project-gallery.ts:144-146`, `apps/web/lib/journal/personal-gallery.ts:99-101`, `apps/web/lib/buyer/customer-request-attachments.ts:256-258`, `apps/web/lib/profile/avatar.ts:35-37` (**3600 s — the outlier, SEC-17**). The invariant is guard-pinned (`apps/web/lib/guards/conversation-attachments.test.ts:150,155`; `journal-modes-gallery.test.ts:83-84`).

**Journal photos are NOT publicly reachable. CV files are never stored at all** — `apps/web/app/api/cv/extract/route.ts:13` parses in memory and returns text only; `worker_documents` holds metadata/status with no bucket binding. Prod holds 14 storage objects total.

---

# 8. Secrets & dependencies

## Secrets — CLEAN (no finding above LOW)

- **Nothing committed.** `git ls-files | grep -i env` returns only `.env.example`, `services/transcribe/.env.example`, `apps/web/lib/env.ts`, `apps/web/lib/ai/schemas/envelope.ts`. `git log --diff-filter=A` confirms only the two `.env.example` files were ever added. `.env.local` and `apps/web/.env.local` exist on disk but are **untracked and ignored** (`.gitignore:14`, `apps/web/.gitignore:34`).
- `git grep` for JWT shapes, bot-token shapes, `sk_live_`/`sk_test_`/`whsec_`/`sk-ant-` with real-length tails, and `(PASSWORD|SECRET|TOKEN|API_KEY)=<16+ chars>` across all tracked files returned **zero real values** — only doc prose, `.env.example` placeholders, and short obvious test literals (`apps/web/lib/billing/config.test.ts:31`, `apps/web/lib/ai/runtime/config-core.test.ts:82`). All values here are and remain `[redacted]`.
- **No service-role key can reach the browser.** `apps/web/lib/supabase/admin.ts:1` begins `import "server-only"` — a client import is a build error. `SUPABASE_SERVICE_ROLE_KEY` appears only in server files, scripts, docs, and guard tests; the one page reference (`apps/web/app/[locale]/dashboard/admin/project-truth/page.tsx:174`) is `Boolean(process.env.…)` in a **server** component and exposes only a boolean.
- **`NEXT_PUBLIC_*` names in use** (values `[redacted]`, all public-by-design): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (declared `apps/web/lib/env.ts:12-99`), plus `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` which is declared in `.env.example:23` but referenced **only** by a negative guard (`apps/web/lib/guards/map-locator-real.test.ts:41,118`). **No server-only secret is `NEXT_PUBLIC_`-prefixed.**
- **No secret is logged.** `apps/web/app/api/auth/google/route.ts:131,164` logs a trace id; `services/transcribe/server.mjs:44` logs only that `TRANSCRIBE_TOKEN` is missing/short; `apps/web/lib/notifications/telegram-owner-alerts.ts:142` logs a label, never the tokens used at `:154,161,173,176`.
- **SEC-15 (LOW):** `apps/web/lib/guards/no-secret-leakage.test.ts:50-53` scans only `apps/web/{lib,app,scripts}` and root `.env.example`. `supabase/`, `docs/`, `services/`, and root `scripts/` are **outside its scope** — nothing leaks there today (manually verified), but a future leak would not fail the build.

## Dependencies — `pnpm audit --json`, pnpm 10.33.2, 622 deps

**critical 0 · high 5 · moderate 3 · low 1 (9 advisories). No direct production dependency is affected.**

| Package | Present | Severity | Path | Fix |
|---|---|---|---|---|
| `sharp` | 0.34.5 | **HIGH** | `apps/web > next > sharp` — **production build path** | ≥ 0.35.0 |
| `vite` | 8.0.14 | HIGH | `vitest` (dev) — `server.fs.deny` bypass on Windows | ≥ 8.0.16 |
| `brace-expansion` | 1.1.14 | HIGH | `@eslint/eslintrc > minimatch` (dev) — ReDoS | ≥ 1.1.16 |
| `brace-expansion` | 5.0.6 | HIGH | `eslint-config-next > @typescript-eslint/* > minimatch` (dev) | ≥ 5.0.7 |
| `js-yaml` | 4.1.1 | HIGH | `@eslint/eslintrc` (dev) — quadratic CPU via merge keys | ≥ 4.3.0 |
| `js-yaml` | 4.1.1 | MODERATE | same path — alias DoS | ≥ 4.2.0 |
| `vite` | 8.0.14 | MODERATE | `vitest` (dev) — NTLMv2 hash disclosure via UNC path | ≥ 8.0.16 |
| `postcss` | 8.4.31 | MODERATE | `apps/web > next > postcss` — **production build path** (a patched `^8.5.15` is a direct devDep at `apps/web/package.json:66`, but `next` pins its own copy) | ≥ 8.5.10 |
| `esbuild` | 0.28.0 | LOW | `tsx` (dev) | ≥ 0.28.1 |

Only `sharp` (HIGH) and `postcss` (MODERATE) touch production, both via `next` 15.5.18 — fixing them needs a Next bump or a pnpm `overrides` entry. The other seven are dev-toolchain and not attacker-reachable in production. **No dependency audit step exists in `.github/workflows/quality.yml`.**

---

# 9. Auth configuration, webhooks, rate limiting

## Supabase auth configuration (advisor-confirmed)

| Setting | State | Impact |
|---|---|---|
| Leaked-password protection (HaveIBeenPwned) | **DISABLED** | Users may set known-breached passwords. One-click fix in the Supabase dashboard. |
| OTP / magic-link expiry | **> 1 hour** (recommended ≤ 1 h) | Wider window for interception of an emailed one-time link. |
| MFA enrollment | **Unavailable** — 0 verified factors / 27 users | No second factor for anyone, including the single admin. |

## Webhooks — correctly authenticated

Exactly **one** inbound webhook exists: `apps/web/app/api/billing/webhook/route.ts`. It reads the **raw** body via `req.text()` at `:29-40` (not `req.json()`), passes it plus the `stripe-signature` header to `provider.constructWebhookEvent`, and returns 400 on any throw — business logic is unreachable without a verified signature. Actual verification at `apps/web/lib/billing/providers/stripe-test.ts:57-65` uses the Stripe SDK's `webhooks.constructEvent`, i.e. timing-safe HMAC-SHA256 with a replay window. Extra hardening: live events rejected at `route.ts:43-45`; event-id idempotency at `:48-56`. **No hand-rolled HMAC anywhere**, so no timing-safety bug to audit. The self-hosted transcribe service also does it correctly — `crypto.timingSafeEqual` with a length pre-check at `services/transcribe/server.mjs:51-55`, plus a 10 req/min limiter at `:58-63,119`.

## Rate limiting — present where authenticated, absent where public

**Working:**
- `supabase/migrations/20260716121000_request_rate_limits_v3.sql` — `propose_booking_request_v3`, 10 open + 30 per rolling 24 h (`:54-63`), granted to `authenticated` only with `revoke … from public/anon` (`:73-75`). **Applied** (`APPLIED_LEDGER.md:71`, ledger `20260716195042`) and **actually called** at `apps/web/lib/booking/booking-actions.ts:149`. Verified in prod: `has_function_privilege('anon', …)` = **false** — this migration got the revoke right.
- `apps/web/lib/limits/request-rate-limits.ts:60-71` — shared app-layer budget, **fail-closed** when counts are unreadable; consumed by booking, contact-disclosure, and conversation paths; wiring pinned by `apps/web/lib/guards/request-rate-limit-wiring.test.ts`.
- `apps/web/lib/communication/rate-caps.ts:37,42` — 120 messages/h, 20 new conversations/24 h; deny on read failure.
- `apps/web/app/api/auth/google/route.ts:36-56,85-90` — per-IP sliding window (20 attempts) + Origin/CSRF gate. Honest limitation: in-memory per serverless instance, so it degrades under fan-out.
- Native DB caps in `20260716120000_contact_disclosure_requests_v1.sql` and `20260716131000_team_enquiries_v1.sql` (both applied).

**Absent — SEC-04:**
- `submit_company_need_public_v1` (`20260707120000`, EXECUTE granted to `anon` at `:209`) has **no volume cap, no per-IP counter, no time-window check**. Called through the **anon** client at `apps/web/lib/staffing/company-need-public-intake.ts:72-91`. Its sibling public intakes (`submit_help_request_v1`, contact-disclosure) all carry caps; this one does not.
- `apps/web/app/api/leads/route.ts:44-51` — unauthenticated POST inserting into `leads` via the **service-role** (RLS-bypassing) client. No rate limit, no captcha, no honeypot. Described as dormant at `:8-11` but the route is live.
- `apps/web/app/api/waitlist/route.ts:50-56` — unauthenticated anon insert; a unique-email constraint is the only dedupe.
- `apps/web/app/api/cv/extract/route.ts` — auth-gated (401 at `:27`), 5 MB cap, but **no rate limit**; each call runs PDF/DOCX parsing (SEC-16).
- **Zero captcha / Turnstile / hCaptcha / reCAPTCHA / honeypot implementation exists in the repo** — every match for those terms is i18n copy or doc prose.

---

# 10. Findings

Each finding: problem · evidence · affected user · affected paths · business impact · risk · blocker flags · fix · acceptance criteria · dependencies · effort · suggested loop.

---

## SEC-01 — Unauthenticated delete/modify of contracts, proposals, marketplace listings

- **Problem.** Seven `SECURITY DEFINER` RPCs authorize with `if v_owner <> auth.uid() then raise`. For an anonymous caller `auth.uid()` is NULL, the comparison yields NULL, PL/pgSQL treats it as false, and the guarded DELETE/UPDATE executes with definer privileges (RLS bypassed).
- **Evidence.** `supabase/migrations/20260718190000_commercial_crm.sql:120,137,173,184`; `supabase/migrations/20260718210000_marketplace_listings.sql:125,148,159`. Live prod probes (all rolled back): `delete=NO_ERROR rows_left=0`; `del_contract=NO_ERROR del_listing=NO_ERROR contracts_left=0 listings_left=0`; `set_listing_status=NO_ERROR status_now=closed`. Reachability: `proacl = {=X/postgres,postgres=X/postgres,authenticated=X/postgres}` — the leading `=X` is the PUBLIC grant `anon` inherits.
- **Affected user.** Every company/agency using the Commercial CRM or the Marketplace. Attacker profile: any anonymous internet user holding the public anon key (which ships in the browser bundle by design) plus one object UUID.
- **Affected paths.** The 7 RPCs; tables `public.contracts`, `public.proposals`, `public.marketplace_listings`; callers under `apps/web/lib/**` for CRM/marketplace.
- **Business impact.** Silent destruction of commercial records (proposals, signed-contract references) with no audit trail — none of these RPCs write to `audit_logs`. Listing content can be replaced with arbitrary text on a public-facing surface (defacement / spam vector). For a platform positioning itself on evidence integrity, an anonymous delete primitive is existential to trust.
- **Risk level.** **CRITICAL (P0).** Mitigated *today* only by all three tables holding 0 rows.
- **Security blocker.** YES. **Legal blocker:** YES — Art. 32 integrity/confidentiality; unauthorized erasure of personal-data-bearing records is a notifiable-breach candidate.
- **Recommended fix.** One migration replacing the authorization preamble in all 7 functions:
  ```sql
  declare v_uid uuid := auth.uid();
  begin
    if v_uid is null then
      raise exception 'Not authenticated' using errcode = '42501';
    end if;
    ...
    if v_owner is distinct from v_uid then raise exception 'not authorized'; end if;
  ```
  Use **both** belts: the explicit NULL check (matching `20260716121000:50-52`) **and** `is distinct from`. In the same migration, `revoke execute … from public, anon` for all 7. Do not rely on the revoke alone — SEC-01 and SEC-02 must be fixed independently.
- **Acceptance criteria.**
  1. A rolled-back prod probe as role `anon` returns a raised exception for all 7 functions and the seeded rows survive unchanged.
  2. `has_function_privilege('anon', oid, 'EXECUTE')` is `false` for all 7.
  3. An authenticated non-owner is still rejected (no regression).
  4. An authenticated owner still succeeds end-to-end.
  5. A new guard test fails the build on any `(<>|!=)\s*auth\.uid\(\)` in `supabase/migrations/**`.
  6. `APPLIED_LEDGER.md` records the fix and **corrects** the false "verified" claims at lines 92 and 96.
- **Dependencies.** None. Ships independently of SEC-02.
- **Effort.** ~2–4 h (one migration, one guard test, one rolled-back prod probe battery).
- **Suggested loop.** Immediate hotfix, ahead of any remaining audit loop.

---

## SEC-02 — Residual `PUBLIC` EXECUTE grant on 50 SECURITY DEFINER functions

- **Problem.** Migrations ran `GRANT EXECUTE … TO authenticated` without `REVOKE EXECUTE … FROM PUBLIC`, leaving the default PUBLIC grant intact. 54 of 205 definer functions are `anon`-executable; only 4 intentionally so.
- **Evidence.** Catalog: `secdef_anon_exec=54`, `explicit_anon_grant=4`, `anon_via_default_public_only=18` (`proacl IS NULL`), remainder via the leading `=X/postgres` ACE. Contrast the intentional `submit_company_need_public_v1` → `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}` (no PUBLIC ACE). Only `supabase/migrations/20260608140000_worker_work_card_execute_hardening.sql:21-24` does the revoke — 4 lines out of 161 migrations. **False documentation:** `docs/APPLIED_LEDGER.md:34,36,82,84,88` all claim "no anon" / "authenticated only" for functions that are demonstrably anon-executable.
- **Affected user.** All users (defence-in-depth). Directly harmful only where an in-body check is missing (SEC-01, SEC-03).
- **Affected paths.** All 161 files in `supabase/migrations/`; `docs/APPLIED_LEDGER.md`.
- **Business impact.** Every future RPC inherits the flaw; the ledger — the repo's own accountability record — is unreliable on precisely the property that matters most. Any external security review will find this immediately.
- **Risk level.** HIGH (P1).
- **Security blocker.** YES for new-RPC work. **Legal blocker:** NO on its own.
- **Recommended fix.** (a) One remediation migration revoking EXECUTE from `PUBLIC` and `anon` for the 50 non-intentional functions, keeping the 4 public ones explicit. (b) `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` so new functions are closed by default. (c) A guard test asserting every migration that creates a definer function also revokes from PUBLIC. (d) Correct the ledger rows.
- **Acceptance criteria.**
  1. `count(*) FILTER (WHERE prosecdef AND has_function_privilege('anon', oid,'EXECUTE'))` = **4**, and those 4 are exactly the intended public functions.
  2. The 4 keep working from a signed-out browser session (public business profile + company-need form).
  3. No authenticated flow regresses (full route smoke).
  4. New guard test fails on a definer function created without a PUBLIC revoke.
  5. Ledger rows 34/36/82/84/88/92/96 corrected.
- **Dependencies.** Run *after* SEC-01's functional fix so the two are independently verifiable.
- **Effort.** ~4–8 h (large but mechanical; the risk is over-revoking, so verify the 4 public paths explicitly).
- **Suggested loop.** Same hotfix train, immediately after SEC-01.

---

## SEC-03 — Three create-RPCs have no authorization check at all

- **Problem.** `create_contract_v1`, `create_proposal_v1`, and `create_marketplace_listing_v1` (when both `p_organization_id` and `p_project_id` are NULL) contain **zero** authorization logic. They validate inputs, then insert with `owner_id = auth.uid()`. The only thing stopping an anonymous insert is the `NOT NULL` constraint on `owner_id`.
- **Evidence.** Function bodies (`pg_get_functiondef`) contain no `can_manage_*`, no `manages_organization`, no NULL-uid check. `contracts.owner_id`, `proposals.owner_id`, `marketplace_listings.owner_id` all `attnotnull = true`. Probe: `create_proposal=BLOCKED[23502]`, `create_listing=BLOCKED[23502]` — SQLSTATE 23502 is `not_null_violation`, **not** an authorization refusal.
- **Affected user.** All CRM/marketplace users.
- **Affected paths.** `supabase/migrations/20260718190000_commercial_crm.sql`, `20260718210000_marketplace_listings.sql`.
- **Business impact.** The defence is accidental. Any future migration making `owner_id` nullable, adding a default, or a new create-RPC copying this template turns it into anonymous row injection on a public surface.
- **Risk level.** HIGH (P1) — latent, not currently exploitable.
- **Security blocker.** YES (bundle with SEC-01). **Legal blocker:** NO.
- **Recommended fix.** Add the same `if auth.uid() is null then raise … errcode '42501'` preamble; for `create_marketplace_listing_v1`, run the ownership check unconditionally rather than only when an org/project id is supplied.
- **Acceptance criteria.** Anonymous calls fail with `42501` (authorization) rather than `23502` (constraint); authenticated create flows unchanged; guard test asserts every `create_*_v1` definer function contains an explicit NULL-uid check.
- **Dependencies.** Same migration as SEC-01.
- **Effort.** ~1 h (inside the SEC-01 migration).
- **Suggested loop.** SEC-01 hotfix.

---

## SEC-04 — Public intake surfaces accept unbounded anonymous PII with no bot protection

- **Problem.** The company-need intake, `/api/leads`, and `/api/waitlist` accept unauthenticated writes with no volume cap, no per-IP throttle, no captcha, no honeypot. `/api/leads` writes through the **service-role** client, bypassing RLS entirely.
- **Evidence.** `supabase/migrations/20260707120000_company_need_public_intake.sql` grants EXECUTE to `anon` at `:209` and contains no cap (grep for `limit|rate|count(*)|interval|honeypot|captcha` → nothing); called via the anon client at `apps/web/lib/staffing/company-need-public-intake.ts:72-91`; no honeypot/captcha in `apps/web/lib/staffing/company-need-form-actions.ts` or `apps/web/components/app/company-need-form.tsx`. `apps/web/app/api/leads/route.ts:44-51` (service-role insert). `apps/web/app/api/waitlist/route.ts:50-56`. Prod probe: `submit_need=NO_ERROR` as `anon`. Sibling intakes (`submit_help_request_v1`, contact-disclosure, team-enquiries) all carry caps — this one is the outlier. Zero captcha implementation exists repo-wide.
- **Affected user.** The operator (queue flooding, cost), and third parties whose contact details a malicious submitter could inject.
- **Affected paths.** As above, plus `public.company_need_public_intakes`, `public.leads`, `public.waitlist`.
- **Business impact.** The company-need queue is the primary commercial lead funnel. A trivial script can fill it with junk or, worse, with real third-party contact details the operator would then process — creating a controller obligation over data collected without any lawful basis. Storage and review cost scale with the attacker's patience.
- **Risk level.** HIGH (P1).
- **Security blocker.** YES for any public marketing push. **Legal blocker:** partial — unbounded third-party PII intake without verification is an Art. 5(1)(a)/6 exposure.
- **Recommended fix.** DB-side cap inside `submit_company_need_public_v1` matching the sibling pattern (N per rolling window keyed on a coarse bucket), plus a honeypot field and a bot-check (Turnstile is the lowest-friction) on the public forms. Move `/api/leads` off the service-role client or delete the route if genuinely dormant.
- **Acceptance criteria.** (1) Submitting > N intakes in the window from one origin is refused server-side. (2) A headless script without JS cannot submit. (3) `/api/leads` no longer uses service-role, or returns 410. (4) A guard test asserts every anon-executable RPC either carries a cap or is on an explicit exemption list. (5) Legitimate human submission still succeeds (manual smoke).
- **Dependencies.** Bot-check requires an owner decision on the provider (new third-party + a cookie/consent consequence — coordinate with SEC-08).
- **Effort.** ~1 day.
- **Suggested loop.** Next hardening loop, before any paid acquisition.

---

## SEC-05 — Every authenticated user can read every organization row

- **Problem.** `organizations_select` is `USING (true)` with no role restriction, so any authenticated user reads all organization rows including `public_contact_email` and `public_contact_phone`, regardless of `public_profile_enabled`.
- **Evidence.** `pg_policy`: `organizations_select`, cmd `r`, roles NULL (PUBLIC), `using_expr = true`. Table ACL `{postgres=arwdDxtm/postgres,authenticated=r/postgres}` — `anon` cannot read, so exposure is authenticated-only. This defeats the `public_profile_enabled` gate that `get_public_business_profile_v1`, `get_public_business_listings_v1`, `get_public_business_services_v1` and `set_business_public_profile_v1` all enforce.
- **Affected user.** Every organization on the platform, including those that deliberately left their public profile disabled.
- **Affected paths.** `public.organizations`; the `get_public_business_*` RPCs whose gating is bypassed by direct table reads.
- **Business impact.** Any user who registers can enumerate the full customer list with contact details — a competitor-intelligence and outbound-spam gift, and a broken promise to organizations that chose not to be public.
- **Risk level.** MEDIUM (P2).
- **Security blocker.** NO. **Legal blocker:** partial — business contact details of sole traders are personal data; Art. 5(1)(f).
- **Recommended fix.** Replace with a scoped policy: `public_profile_enabled = true OR manages_organization(id) OR owner_profile_id = auth.uid() OR is_admin()`; and/or move `public_contact_email`/`public_contact_phone` behind the existing definer RPCs and revoke column SELECT.
- **Acceptance criteria.** A user with no relationship to org X reads no row (or a row with contact columns NULL) when X is not public; managers and admins are unaffected; the public business-profile page still renders for anonymous visitors; a guard test pins the policy expression.
- **Dependencies.** Audit read paths first — some dashboard surfaces may currently depend on the open read.
- **Effort.** ~4 h including read-path audit.
- **Suggested loop.** Next hardening loop.

---

## SEC-06 — GDPR erasure (Art. 17) is not implemented

- **Problem.** Deletion requests are captured; nothing deletes. No erasure or anonymisation code exists.
- **Evidence.** `supabase/migrations/20260706150000_privacy_request_intake.sql:14-16` states it explicitly. UI `apps/web/components/app/privacy-deletion-request.tsx:49-111`; action `apps/web/lib/privacy/actions.ts:40-66`. No `deleteUser`/`admin.deleteUser`/anonymisation/storage-cleanup anywhere in `apps/`; the only `deleteUser` occurrence is a negative assertion at `apps/web/lib/auth/logout-route.test.ts:107`. Manual cascade documented at `docs/compliance/privacy-requests-v1.md:43-47`.
- **Affected user.** Every data subject; workers most of all (journal entries, photos, documents, skill claims).
- **Affected paths.** `apps/web/lib/privacy/**`, `supabase/migrations/20260706150000_*`, `docs/compliance/privacy-requests-v1.md`.
- **Business impact.** Art. 17 requires action without undue delay and within one month. A manual, undocumented, unrehearsed cascade will not reliably meet that, and storage objects (journal photos, avatars, attachments) are not covered by any DB cascade — they would be orphaned, i.e. **retained personal data after an erasure request**.
- **Risk level.** MEDIUM (P2) technically; HIGH legally once real users exist.
- **Security blocker.** NO. **Legal blocker:** **YES** for public launch.
- **Recommended fix.** An owner-triggered, audited erasure RPC + admin action that (a) deletes or anonymises `profiles` and cascades, (b) **explicitly removes storage objects** across all four buckets, (c) preserves the append-only consent/LMC ledgers in pseudonymised form (documenting the Art. 17(3)(b) retention basis), (d) writes one `audit_logs` row per erasure, (e) returns a completion receipt to the subject.
- **Acceptance criteria.** A disposable test account created and fully erased in production; a post-erasure sweep across every personal-data table **and all four buckets** returns zero rows/objects; the erasure is audit-logged; the documented turnaround is ≤ 30 days; `docs/compliance/gdpr-readiness-v1.md` updated.
- **Dependencies.** Owner decision on erase-vs-anonymise for ledger-referenced rows (legal call).
- **Effort.** ~2–3 days including a real erasure rehearsal.
- **Suggested loop.** Dedicated GDPR-completion loop before public launch.

---

## SEC-07 — No retention period is enforced anywhere

- **Problem.** Retention is written down and promised in UI copy, but no code or job enforces any period.
- **Evidence.** `pg_cron` **not installed** in prod. No `schedule:`/`cron:` in `.github/workflows/`. No `vercel.json`. Guard tests assert the absence (`apps/web/lib/guards/booking-lifecycle.test.ts:233`). `expire_contact_disclosure_requests_v1`, `expire_stale_team_enquiries_v1`, `lmc_expire_lots_v1` exist with **no caller**. Docs concede: `docs/legal/processing-activities-register-v1.md:7,16` (a retention cell reading `VERIFY`), `docs/legal/legal-basis-matrix-v1.md:35`, `apps/web/messages/en.json:4976`. **False UI promise:** `apps/web/messages/en/journal.json:296` (all locales), rendered at `apps/web/components/app/voice-journal-recorder.tsx:273`, promises 30-day recording retention *and* a delete control; `apps/web/lib/voice/transcribe-action.ts:21-26` confirms no persistence at all and no delete path.
- **Affected user.** Every data subject; voice-journal users get a specifically inaccurate statement.
- **Affected paths.** `docs/legal/**`, `apps/web/messages/**/journal.json`, `apps/web/components/app/voice-journal-recorder.tsx`, the three orphaned expiry RPCs.
- **Business impact.** Art. 5(1)(e) non-compliance, and a user-facing statement that is wrong in both directions (over-states storage, promises a control that does not exist) — which is the more damaging half, because it is the kind of inaccuracy a regulator reads as a transparency failure rather than a bug.
- **Risk level.** MEDIUM (P2) technically; HIGH legally.
- **Security blocker.** NO. **Legal blocker:** **YES** for public launch.
- **Recommended fix.** (1) Immediately correct the voice-journal copy to state the truth (nothing is stored). (2) Owner + counsel set concrete periods per category in the processing register. (3) Install a scheduler — Supabase `pg_cron` or a GitHub Actions `schedule:` calling an authenticated job route — and wire the three existing expiry RPCs plus new purge routines. (4) Publish the periods in the privacy notice.
- **Acceptance criteria.** Every register category names a period (no `VERIFY` cells); a scheduled job demonstrably deletes/expires at least one category in prod with before/after counts; the expiry RPCs have callers; no UI string promises a retention or control that does not exist (guard-pinned); the privacy notice lists the periods.
- **Dependencies.** Owner + legal decision on the periods; the copy fix (1) is independent and should ship now.
- **Effort.** Copy fix ~1 h. Full enforcement ~2–3 days after the periods are set.
- **Suggested loop.** Copy fix immediately; enforcement in the GDPR-completion loop.

---

## SEC-08 — No cookie/ePrivacy consent while analytics runs on anonymous visitors

- **Problem.** No consent banner exists, on the stated basis that no analytics exists. First-party analytics **does** run for anonymous visitors on public pages, including a `sessionStorage` identifier.
- **Evidence.** No banner/CMP component anywhere. `apps/web/components/marketing/answer-analytics.tsx:10-17` fires `answer_page_viewed` on mount of public answer pages. `apps/web/lib/telemetry/task.ts:30-51` mints and stores `lm.pilot.session` in **sessionStorage**. `supabase/migrations/0020_pilot_events.sql:30-40` persists `session_id`, `route`, `locale`, `event_name`, `profile_id`, with an anonymous INSERT grant (applied `20260702131913`). Contradicted by `apps/web/app/[locale]/(marketing)/legal/cookies/page.tsx:16` and `apps/web/messages/en.json:5004`; `en.json:5003` discloses only a theme value in localStorage.
- **Affected user.** Every anonymous visitor to public marketing/answer pages.
- **Affected paths.** As above, plus `public.pilot_events`.
- **Business impact.** ePrivacy Art. 5(3) applies to *any* storage on terminal equipment that is not strictly necessary — an analytics session id is not. Compounded by a published policy stating the opposite, which converts a fixable technical gap into a transparency/accuracy problem. Note in mitigation: the payloads themselves are genuinely PII-free and allowlisted (§5), so the exposure is the *storage and disclosure*, not the content.
- **Risk level.** MEDIUM (P2), legally weighted.
- **Security blocker.** NO. **Legal blocker:** **YES** for EU public marketing.
- **Recommended fix.** Pick one and be accurate: **(a)** drop the `sessionStorage` id and make public-page analytics fully stateless/aggregate, then keep the "no consent needed" position and correct the policy to disclose the aggregate telemetry; or **(b)** keep the id and add a real consent gate that blocks `answer-analytics` and telemetry until opt-in. (a) is cheaper and fits the product's existing minimisation posture.
- **Acceptance criteria.** The cookie policy matches observable behaviour exactly (verified by a fresh-session network + storage inspection); if (a), no non-essential storage is written pre-consent; if (b), no analytics event fires before opt-in; the policy enumerates every storage key; a guard test pins the invariant.
- **Dependencies.** Coordinate with SEC-04 — adding Turnstile would itself introduce a third-party consent question.
- **Effort.** Option (a) ~4 h. Option (b) ~2 days.
- **Suggested loop.** GDPR-completion loop, jointly with SEC-04's bot-check decision.

---

## SEC-09 — `audit_logs` is not append-only despite in-schema claims

- **Problem.** Two schema comments assert append-only; nothing enforces it.
- **Evidence.** `supabase/migrations/0001_initial_schema.sql:268` `-- audit_logs (append-only; service-role writes)` and `:624-630` (SELECT/INSERT policies `is_admin()`, no UPDATE/DELETE policy). But: (1) **no blocking trigger** — verified live, `audit_logs` has only `set_updated_at`, whereas `privacy_consent_events` has `privacy_consent_events_append_only` and `lmc_transactions` has `lmc_transactions_append_only` (both → a `raise exception` mutation blocker); (2) `audit_logs` is in the `set_updated_at` **BEFORE UPDATE** loop at `0001:640-651` (list at `:644`) — an append-only table has no reason to maintain `updated_at`; (3) no `FORCE ROW LEVEL SECURITY`, so `service_role` and the table owner bypass RLS entirely; (4) the repo contradicts itself at `supabase/migrations/20260713210000_multi_source_talent_v1.sql:28` — *"audit_logs is free-form and mutable-by-policy design"*.
- **Affected user.** The operator and any party relying on the audit trail (dispute resolution, breach investigation, Art. 5(2) accountability).
- **Affected paths.** `supabase/migrations/0001_initial_schema.sql`, `public.audit_logs`.
- **Business impact.** The audit trail is the evidentiary backstop for a platform whose core value proposition is verified work evidence. Any service-role code path — including a compromised deploy — can rewrite history undetected. Prod currently holds 31 rows across 7 action types (2026-05-30 → 2026-07-12), so the stakes are small today and the fix is cheap.
- **Risk level.** MEDIUM (P2).
- **Security blocker.** NO. **Legal blocker:** partial (Art. 5(2) accountability).
- **Recommended fix.** Add a `BEFORE UPDATE OR DELETE` trigger reusing the proven `privacy_ledger_block_mutation()` pattern; remove `audit_logs` from the `set_updated_at` loop and drop the `updated_at` column (or freeze it); set `FORCE ROW LEVEL SECURITY`; reconcile the three contradictory comments to one true statement.
- **Acceptance criteria.** A rolled-back prod probe as `service_role` proves UPDATE and DELETE both raise; existing INSERT paths (~50 RPCs) still work; the 31 existing rows are untouched; a guard test asserts the trigger exists.
- **Dependencies.** Confirm no code currently updates `audit_logs` (a `set_updated_at` trigger suggests something might).
- **Effort.** ~3 h.
- **Suggested loop.** Next hardening loop.

---

## SEC-10 — MFA unavailable; leaked-password protection off; OTP window too long

- **Problem.** No account, including the single admin, can enable a second factor. Breached passwords are accepted. Emailed one-time links stay valid for over an hour.
- **Evidence.** `apps/web/app/[locale]/dashboard/account/page.tsx:81-91` reads `mfa.listFactors()` only; `:72-77` states enrollment is deferred; `apps/web/lib/guards/account-security-benefit.test.ts:56` **forbids** enrollment code. No `aal2` reference anywhere in `apps/`. Prod: `auth.mfa_factors` verified = **0** across 27 users. Supabase auth advisors: leaked-password protection DISABLED, OTP expiry > 1 h.
- **Affected user.** All 27 accounts; the single admin most critically — that one credential controls `is_admin()` reads on `audit_logs`, `pilot_events`, all four storage buckets, and `organizations` writes.
- **Affected paths.** `apps/web/app/[locale]/dashboard/account/page.tsx`, `apps/web/lib/guards/account-security-benefit.test.ts`, Supabase Auth dashboard config.
- **Business impact.** Single-factor admin compromise yields platform-wide personal-data access. Art. 32 expects measures appropriate to the risk; for a platform holding worker identity documents and journals, no-MFA-for-admin is hard to defend.
- **Risk level.** MEDIUM (P2) overall; **HIGH for the admin account specifically**.
- **Security blocker.** YES for admin. **Legal blocker:** partial (Art. 32).
- **Recommended fix.** Two independent tracks: **(a) config-only, today** — enable leaked-password protection and set OTP expiry ≤ 1 h in the Supabase dashboard (no code, no deploy). **(b)** Implement TOTP enrollment (`mfa.enroll` + `challengeAndVerify`), retire the forbidding guard, and require `aal2` for the admin surfaces.
- **Acceptance criteria.** (a) Advisors no longer report either auth warning; a known-breached password is rejected at signup. (b) The admin has ≥ 1 verified factor in prod; `/dashboard/admin/**` returns 403 below `aal2`; the guard is replaced by one asserting enrollment **is** present.
- **Dependencies.** (b) needs recovery-code UX and an owner-tested lockout path before enforcement.
- **Effort.** (a) ~15 min, owner-executed. (b) ~2 days.
- **Suggested loop.** (a) OWNER GATE, immediate. (b) auth-hardening loop.

---

## SEC-11 — Vulnerable transitive dependencies reach the production build; no audit in CI

- **Problem.** `sharp` 0.34.5 (HIGH) and `postcss` 8.4.31 (MODERATE) reach production via `next` 15.5.18. No dependency audit runs in CI.
- **Evidence.** `pnpm audit --json`: critical 0 / high 5 / moderate 3 / low 1 (full table §8). `.github/workflows/quality.yml` runs typecheck, lint, vitest, placeholder governance — no `pnpm audit`.
- **Affected user.** All users indirectly (`sharp` processes uploaded images; `postcss` runs at build time).
- **Affected paths.** `pnpm-lock.yaml`, `apps/web/package.json`, `.github/workflows/quality.yml`.
- **Business impact.** `sharp`'s libvips CVEs are the material one — it is in the image pipeline that handles journal photos and avatars, i.e. attacker-supplied input. The seven dev-only advisories are noise for production but keep the audit output permanently red, which trains everyone to ignore it.
- **Risk level.** MEDIUM (P2).
- **Security blocker.** NO. **Legal blocker:** NO.
- **Recommended fix.** Bump `next` to a release pulling `sharp` ≥ 0.35.0 and `postcss` ≥ 8.5.10, or add pnpm `overrides` for both. Bump the dev toolchain (`vite` ≥ 8.0.16, `js-yaml` ≥ 4.3.0, `brace-expansion`, `esbuild`) opportunistically. Add a CI step failing on **high or critical in production dependencies only** (`pnpm audit --prod --audit-level=high`) so the signal stays meaningful.
- **Acceptance criteria.** `pnpm audit --prod --audit-level=high` exits 0; `pnpm why sharp` shows ≥ 0.35.0; build + route smoke green; the CI step is present and required.
- **Dependencies.** A Next bump needs a full route smoke.
- **Effort.** ~4 h if the Next bump is clean; ~1 day with overrides and verification.
- **Suggested loop.** Maintenance loop.

---

## SEC-12 — No backup/restore or DR runbook; stale deployment doc; thin incident response

- **Problem.** No documented recovery procedure, no RPO/RTO, no evidence a restore was ever tested. The deployment doc has no rollback section and is materially wrong. The incident-response doc names no owner or contact.
- **Evidence.** `docs/DEPLOYMENT.md` — grep for rollback/revert/backup/restore returns **zero** hits; it still claims the Supabase project "exists but is empty" and "no agent has applied them", and instructs `pnpm db:push`, which `docs/APPLIED_LEDGER.md` explicitly forbids. No DR runbook exists; the only PITR references are `docs/VPS_MIGRATION_FEASIBILITY_AUDIT.md:50,69,108,109,156` (a hosting comparison) and a one-line pre-check in `docs/runbooks/apply-deferred-intake-grants-and-agency-clients-v1.md:30`. `docs/security/incident-response-v1.md` is self-labelled draft with no owner/contact/severity tiers/time thresholds; `:59-60` admits no published disclosure contact and no secret-rotation runbook. **In fairness**, several runbooks ARE concrete and good: `docs/ops/deploy-pipeline-followup-20260719.md` (named SHAs, exact commands, a recorded negative probe result), `docs/runbooks/apply-deferred-intake-grants-and-agency-clients-v1.md`, `docs/runbooks/apply-migration-0030-ops-bridge.md`, `docs/runbooks/local-db-validation-safety.md`, `docs/audits/stripe-test-activation-runbook.md`, `docs/GOOGLE_OAUTH_BRANDING_RUNBOOK.md`.
- **Affected user.** All users during an incident; the operator, who would improvise under pressure.
- **Affected paths.** `docs/DEPLOYMENT.md`, `docs/security/incident-response-v1.md`, missing `docs/runbooks/disaster-recovery-v1.md`.
- **Business impact.** SEC-01 is precisely the scenario needing a tested restore: had those tables held data, recovery would depend on a PITR procedure nobody has written or rehearsed. A stale doc instructing a forbidden command is an active hazard, not just debt.
- **Risk level.** MEDIUM (P2).
- **Security blocker.** NO. **Legal blocker:** partial (Art. 32(1)(c) restore availability; Art. 33 72-hour readiness).
- **Recommended fix.** (1) Write `docs/runbooks/disaster-recovery-v1.md` with the exact Supabase PITR steps, stated RPO/RTO, and a **rehearsed** restore to a branch project with the result recorded. (2) Rewrite or delete `docs/DEPLOYMENT.md`; add a rollback section (`vercel promote`, migration `.down.sql` procedure). (3) Add to incident-response: named owner, published security contact, severity tiers with time thresholds. (4) Publish `security.txt` / a disclosure address.
- **Acceptance criteria.** A restore to a branch project completed and recorded with timestamps; `DEPLOYMENT.md` contains no forbidden command and no false status; the incident doc names an owner, a contact, and per-severity thresholds; a disclosure address is reachable from the legal pages.
- **Dependencies.** Owner picks the security contact address and confirms the PITR window on the current Supabase plan.
- **Effort.** ~1 day including the rehearsal.
- **Suggested loop.** Operational-readiness loop.

---

## SEC-13 — Documentation contradicts implementation in ≥6 verified places

- **Problem.** The repo's accountability documents are unreliable in both directions.
- **Evidence.**
  1. `docs/APPLIED_LEDGER.md:34,36,82,84,88` claim "no anon"/"authenticated only" for functions that are anon-executable (SEC-02).
  2. `docs/APPLIED_LEDGER.md:92,96` claim post-apply verification for the CRM and marketplace wagons; the verification never covered the unauthenticated case (SEC-01).
  3. `docs/APPLIED_LEDGER.md` has **no entry** for `20260706150000_privacy_request_intake` despite it being applied in prod (ledger `20260706160157`) — a gap on a RED-class SECURITY DEFINER + GRANT migration.
  4. `docs/compliance/privacy-requests-v1.md:29-34` calls that migration DRAFT/unapplied and says the form "degrades honestly" — it is live.
  5. `docs/compliance/gdpr-readiness-v1.md:27-31` records Access as "no export bundle" and Portability as "none" — both shipped.
  6. `supabase/migrations/0001_initial_schema.sql:268,624` vs `20260713210000_multi_source_talent_v1.sql:28` on whether `audit_logs` is append-only (SEC-09).
  7. `apps/web/messages/*/journal.json:296` vs `apps/web/lib/voice/transcribe-action.ts:21-26` on voice retention (SEC-07).
  8. `legal/cookies/page.tsx:16` vs `answer-analytics.tsx` + `lib/telemetry/task.ts` on analytics (SEC-08).
- **Affected user.** Every future reviewer, auditor, and agent session that trusts these files — including this repo's own automation, which is instructed to treat the ledger as authoritative.
- **Affected paths.** `docs/APPLIED_LEDGER.md`, `docs/compliance/**`, `docs/security/**`, `supabase/migrations/0001_initial_schema.sql`.
- **Business impact.** The ledger is the control this project uses in place of a staging environment. Once it is wrong about grants, no claim in it can be trusted without re-verification — which is how SEC-01 survived a "verified" sign-off.
- **Risk level.** LOW (P3) directly; **it is the process failure that produced SEC-01**.
- **Security blocker.** NO. **Legal blocker:** NO.
- **Recommended fix.** Correct all eight. Add the missing ledger row. Change the ledger's verification standard so "verified" for any anon-reachable function requires an explicit **unauthenticated** probe result pasted into the row. Automate: a script that reads live `proacl` and fails when a ledger row's grant claim disagrees with the catalog.
- **Acceptance criteria.** All eight corrected; every ledger row with a grant claim matches live `proacl`; the reconciliation script exists and passes; the verification template requires an unauthenticated probe line.
- **Dependencies.** Do after SEC-01/SEC-02 so corrections are written once.
- **Effort.** ~4 h.
- **Suggested loop.** Same train as SEC-02.

---

## SEC-14 · SEC-15 · SEC-16 · SEC-17 · SEC-18 — Low-severity

| ID | Problem | Evidence | Fix | Effort |
|---|---|---|---|---|
| **SEC-14** | Anonymous existence oracle: `delete_contract_v1`, `delete_proposal_v1`, `delete_marketplace_listing_v1`, `delete_project_budget_v1`, `delete_project_stage_v1` return silently for a missing id but raise for an existing one, letting an anon caller confirm whether a UUID exists. | Bodies: `if v_owner is null then return; end if;` / `if v_project is null then return; end if;` | Raise a uniform `not authorized` for both cases. Largely moot once SEC-02 revokes anon EXECUTE. | ~1 h (fold into SEC-01) |
| **SEC-15** | `no-secret-leakage` guard's scan scope excludes `supabase/`, `docs/`, `services/`, root `scripts/`. | `apps/web/lib/guards/no-secret-leakage.test.ts:50-53` | Extend the scanned roots. Nothing leaks there today (manually verified). | ~1 h |
| **SEC-16** | `/api/cv/extract` is auth-gated with a 5 MB cap but unthrottled; each call runs PDF/DOCX parsing — CPU amplification for any registered user. | `apps/web/app/api/cv/extract/route.ts:27` | Apply the existing `apps/web/lib/limits/request-rate-limits.ts` budget. | ~2 h |
| **SEC-17** | Avatar signed URLs use 3600 s vs 300 s elsewhere. | `apps/web/lib/profile/avatar.ts:35-37` vs `apps/web/lib/communication/attachments.ts:82-84` | Align to ~300 s unless caching requires longer; document the choice. | ~30 min |
| **SEC-18** | `customer_requests_status_transition_guard` has a mutable `search_path` (advisor WARN) — every other definer function pins `search_path=public`. | Supabase security advisor `function_search_path_mutable` | `ALTER FUNCTION … SET search_path = public`. | ~30 min |

---

# 11. OWNER GATE list

Actions this audit must not take, requiring the owner:

1. **SEC-01 hotfix approval.** A migration altering 7 production functions. Under CLAUDE.md §4 autonomous mode this is in-scope build work, but the **P0 nature and prod exposure warrant an explicit owner go** before applying.
2. **Supabase Auth dashboard settings (SEC-10a).** Enable leaked-password protection; set OTP expiry ≤ 1 h. **Config-only, no code, ~15 minutes, highest security-per-effort ratio in this report.**
3. **Retention periods (SEC-07).** Owner + counsel must fix concrete periods per processing category. No agent can decide these.
4. **Erasure policy (SEC-06).** Owner decides delete-vs-anonymise for records referenced by the append-only consent and LMC ledgers, and the documented turnaround.
5. **Bot-protection provider (SEC-04) and cookie-consent strategy (SEC-08).** Both introduce a third-party/consent decision. SEC-08's option (a) (drop the sessionStorage id) avoids a new vendor and is the recommended default — still an owner call.
6. **Security disclosure address (SEC-12).** Owner picks the address before it can be published.
7. **Legal-page finalisation.** Every legal page currently renders `PendingLegalNotice`; binding wording is lawyer work.
8. **Supabase plan / PITR window (SEC-12).** Confirm the retained PITR window before the DR runbook can state an RPO.
9. **Breach assessment for SEC-01.** Whether the confirmed anonymous-write path is notifiable given the affected tables held 0 rows is a lawyer's call, not an agent's. The evidence in §2 is written to support that assessment.

---

# 12. What could not be verified

1. **External HTTP reachability of the vulnerable RPCs.** SEC-01 was proven at the **database authorization layer** with a `SET LOCAL ROLE anon` probe. I did not issue a real `POST /rest/v1/rpc/delete_proposal_v1` against `https://gorgitwvdzxbnaxhrsrw.supabase.co`, because that requires handling the anon key and would be an unauthenticated write to production. PostgREST exposes `public`-schema functions to any role holding EXECUTE, and the product already calls `submit_company_need_public_v1` over exactly this path from the anon client — so external reachability is near-certain, but it is an **inference**, not a measurement. If the owner wants certainty before triaging, a single curl against a seeded throwaway row would settle it.
2. **Whether the 0-row state of `contracts`/`proposals`/`marketplace_listings` has held since 2026-07-18.** I measured the current count. Rows could have been created and deleted (legitimately or otherwise) in between. `audit_logs` cannot answer this — none of the CRM/marketplace RPCs write audit rows (itself a gap). Supabase logs may retain enough history to check; that was out of scope here.
3. **Runtime behaviour of the consent gate and export under real load.** Verified by reading code, RLS predicates, and catalog state — not by driving a browser session as a real worker/employer. A previous loop's live proofs are cited where they exist.
4. **Vercel-side configuration** — environment variable inventory, edge/WAF settings, deployment protection, and whether any secret is set there that is absent from `.env.example`. Not reachable from this repo or from Supabase MCP.
5. **Whether database backups have ever been successfully restored.** No evidence exists either way in the repo (SEC-12). Absence of evidence here is the finding.
6. **Email deliverability paths and their content** (invitations, notifications) for PII-in-transit and misdirection risk. Out of scope for this loop; worth a dedicated pass.
7. **The Agentai OS bridge receiver** authenticated by `AGENTAI_OS_ALERT_TOKEN` (`apps/web/lib/notifications/telegram-owner-alerts.ts:154-161`) lives in a different repo and was not audited, per the no-cross-repo rule.
8. **Advisor auth findings** (leaked-password protection, OTP expiry) were carried forward from the established evidence rather than re-read from the Auth admin API, which is not exposed read-only through the available MCP surface.

---

*End of audit. No production data was created, modified, or deleted. All probe transactions were aborted by design and verified to leave zero rows.*
