# Identity / Capability schema — RED migration plan v1

**Branch:** `docs/cc/identity-capability-schema-red-plan-v1`
**Date:** 2026-06-15
**Type:** PLAN / AUDIT / MIGRATION-DESIGN ONLY.
**Status of all SQL below: `NOT APPLIED · DESIGN ONLY`.**

> ⚠️ This document contains **draft SQL kept deliberately in `docs/`** (NOT in
> `supabase/migrations/`) so `migration-safety` does not treat it as a real
> migration. **Do not copy any SQL into `supabase/migrations/` without explicit
> owner approval + the decision gates in §7.** No Supabase apply, no DB mutation,
> no auth/RLS runtime change, no deploy were performed by this PR.

Follows the no-schema UI/IA cleanup #414–#420 (brand, identity/action framing,
company action rooms, practical flows). Those changed copy/UI only; the DB still
encodes the legacy conflated role model. This plan is how to fix the data model
safely.

---

## 1. Audit — where the legacy role model lives today

### 1.1 Database (schema + RLS + RPC)
| Location | Legacy fact |
|----------|-------------|
| `supabase/migrations/0001_initial_schema.sql` | `profiles.role text check (role in ('worker','company','agency','admin'))`; helper `public.profile_role()`; policies compare `profile_role()`/`role` to `'company'`/`'agency'` (e.g. lines ~310, 480, 525). |
| `supabase/migrations/0003_multi_role.sql` | `profiles.active_role text check (… in ('worker','company','agency','customer','admin'))`; **`profile_roles` junction** (`role text check (role in ('worker','company','agency','customer','admin'))`) + its 4 RLS policies; `handle_new_user` seeds a `profile_roles` row. |
| `0006_complete_onboarding_rpc.sql`, `0007_add_role_rpc.sql`, `0008_professions.sql` | RPCs validate `p_role in ('worker','company','agency','customer')` and **branch on `p_role = 'agency'`**. |
| `0024_is_admin_dual_signal.sql` | `public.is_admin()` = `active_role='admin'` OR a `profile_roles` row `role='admin'`. **Admin is already decoupled** as a permission, not a workspace — good precedent. |
| `0026_customer_entity.sql` | `public.customers` = the **buyer** space entity (`addRole('customer')`). |
| `0027_company_workers.sql`, `0028_customer_requests.sql`, `0013_work_journal_m1.sql` | `organization_type check (… in ('company','agency','other'))`; many RLS policies keyed on company/agency/customer membership. |
| **Scale** | ~**32** direct `role`/`active_role` literal comparisons across migrations (RLS `using`/`with check`, RPC guards), plus 2 helper functions (`profile_role()`, `is_admin()`). |

**Core problem:** a single `role` value conflates **identity** (worker≈person,
company≈organization) with **capability/action** (agency = staffing, customer =
buying). `admin` is a third axis (permission) — already split out.

### 1.2 i18n (active locales en/lt/ru)
Legacy role/space keys still present (kept intentionally through #414–#420 for
compatibility): `spaces.buyer.*`, `roleDashboards.buyer.*`, `roleDashboards.agency.*`,
`auth.signup.role.{worker,company,agency,customer,freelancer,team_lead,service_provider,admin}`,
`roles.{worker,company,agency,customer}.description`. (UI now frames buyer/agency as
*company actions* via `companyActionRooms.*` + `identityActions.*`, but the keys are
still role-shaped.)

### 1.3 Routes
`/dashboard/buyer` and `/dashboard/agency` still exist as route folders (now framed
as company actions, not identities). Also `/dashboard/company`, `/candidates`,
`/projects`, `/dashboard/start/{company,buyer,agency}`.

### 1.4 App code
`lib/config/roles.ts` — `LiveRoleId = "worker"|"company"|"agency"|"customer"`,
`isLiveRoleId`, role catalogue. `lib/auth/{actions,require-role,admin-signal,context,superadmin}.ts`
read/write `active_role` + `profile_roles` and call the RPCs.

---

## 2. Proposed target model

Two orthogonal axes (admin stays a third, already-decoupled permission axis):

### 2.1 `legal_identity` (WHO)
`person` (individual account) · `company` (organization account). One account may
hold a person identity and/or one or more company identities.

### 2.2 `capability` (WHAT they can do) — attached to an identity, not a silo
| capability | replaces / covers | identity |
|------------|-------------------|----------|
| `seek_work` | worker | person (also company-internal later) |
| `offer_services` | freelancer / service_provider | person or company |
| `buy_services` | customer / buyer | person or company |
| `hire_workers` | company hiring | company |
| `offer_workers` | agency / staffing | company (staffing partner) |
| `manage_projects` | company projects / team_lead | company |
| `subcontracting` | subcontractor | company |

`admin` is NOT an identity or capability — it remains `is_admin()` (permission).

### 2.3 Legacy → target mapping (backfill rules)
| legacy `role` | → legal_identity | → capabilities (seed) |
|---------------|------------------|------------------------|
| `worker` | person | `seek_work` |
| `company` | company | `hire_workers`, `manage_projects` |
| `agency` | company | `offer_workers` (staffing_partner) |
| `customer` | person *or* company* | `buy_services` |
| `admin` | (unchanged) | (unchanged — `is_admin()`) |

\* `customer` has no inherent identity today; backfill defaults to **person** unless
the same account also holds `company`/`agency` (then attach `buy_services` to the
company identity). This ambiguity is **owner decision gate G3**.

---

## 3. Migration strategy (additive-first, reversible)

**Phase 0 — Plan + guards (this PR).** Audit, target model, draft SQL (design only),
test plan, decision gates. No DB change.

**Phase 1 — Additive (RED migration #1).** No drops, no behaviour change.
- New `public.account_identities (id, profile_id, identity_type check in ('person','company'), org_id nullable, created_at)`.
- New `public.account_capabilities (id, profile_id, identity_id fk, capability text check in (…), created_at)`.
- RLS: owner-scoped select/insert/update/delete (mirror `profile_roles` policies).
- **Keep `profiles.role`, `profiles.active_role`, `profile_roles` untouched.**

**Phase 2 — Backfill (idempotent).** Populate `account_identities` + `account_capabilities`
from `profile_roles` using §2.3 mapping. Re-runnable (`on conflict do nothing`).
No reads switch yet.

**Phase 3 — Compatibility layer (dual-read).** Add pure SQL helpers
`public.has_capability(profile_id, capability)` and `public.account_identity_types(profile_id)`
that read the NEW tables but **fall back** to the legacy `profile_roles` mapping when
the new rows are missing. RLS policies are migrated **one at a time** to call
`has_capability(...)` instead of `profile_role() = 'agency'` etc., each behind its own
small migration + test. Old + new stay in sync via Phase 4.

**Phase 4 — Dual-write.** The `add_role` / `complete_onboarding` RPCs (and app
actions) write BOTH the legacy `profile_roles` row AND the new identity/capability
rows. Guarantees no drift during the transition. App `lib/auth` keeps reading legacy
until cutover.

**Phase 5 — Cutover.** Flip app reads (`lib/config/roles.ts`, `lib/auth`, route
guards) to the capability model. `active_role` becomes "active identity + active
capability" in the UI. Routes `/dashboard/buyer` + `/dashboard/agency` become
capability-scoped views (route rename is a *separate* later step — out of scope here).

**Phase 6 — Cleanup (final RED).** Only after a soak period + zero legacy reads:
drop the legacy `role`/`active_role` CHECK literals or migrate `profile_roles` to a
view over the new tables. Each drop asserts zero dependence + ships a reversible
recreate (doctrine §16).

**Rollback per phase:** Phases 1–2 → drop the additive tables (zero rows depended on).
Phase 3 → revert each policy migration (legacy columns still authoritative). Phase 4 →
stop dual-write (legacy still written). Phase 5 → flip app reads back. Phase 6 is the
only point-of-no-return → gated behind the longest soak + explicit owner sign-off.

---

## 4. RLS risk analysis

| Risk | Detail | Mitigation |
|------|--------|------------|
| **Policy breakage on literal flip** | ~32 policies/RPCs compare `role`/`active_role` to `'company'`/`'agency'`/`'customer'`. Changing one wrong breaks read/write for that table. | Migrate **one policy per migration** behind a test; never bulk-flip. Compat helper preserves semantics. |
| **`profile_role()` / `is_admin()` semantics** | Helpers are called widely; redefining them changes every caller at once. | Do NOT redefine in place — add NEW helpers (`has_capability`) and migrate callers individually. Keep `is_admin()` exactly as-is (admin axis untouched). |
| **Backfill ambiguity (customer identity)** | `customer` → person vs company is not determinable from data alone. | Default person + attach to company when co-held; flag rows for review; **owner gate G3**. |
| **Anon / unauthenticated** | New tables must not leak. | RLS owner-scoped from creation; explicit anon = no access; test anon SELECT returns 0. |
| **RPC `SECURITY DEFINER`** | `add_role`/`complete_onboarding` bypass RLS; dual-write must keep both stores consistent or RLS reads diverge. | Dual-write inside the same RPC transaction; idempotent; test both stores after each call. |
| **Mirror triggers** | `companies.country → organizations.country` style mirrors exist; identity changes must not desync orgs. | No org-shape change in Phases 1–5; identity tables reference `org_id`, never rewrite org rows. |

**Tests required BEFORE any apply:** see §6.

---

## 5. Draft SQL — `NOT APPLIED · DESIGN ONLY`

> Kept here in `docs/` on purpose. Copying into `supabase/migrations/` is a RED
> action requiring owner approval (§7). Filenames below are illustrative.

```sql
-- DESIGN ONLY — Phase 1 (additive). NOT APPLIED.
create table if not exists public.account_identities (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  identity_type text not null check (identity_type in ('person','company')),
  org_id        uuid null references public.organizations(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (profile_id, identity_type, org_id)
);
alter table public.account_identities enable row level security;
-- owner-scoped policies mirror public.profile_roles (select/insert/update/delete
-- where profile_id = auth.uid()), plus is_admin() bypass for select.

create table if not exists public.account_capabilities (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  identity_id uuid not null references public.account_identities(id) on delete cascade,
  capability  text not null check (capability in
    ('seek_work','offer_services','buy_services','hire_workers',
     'offer_workers','manage_projects','subcontracting')),
  created_at  timestamptz not null default now(),
  unique (identity_id, capability)
);
alter table public.account_capabilities enable row level security;
-- owner-scoped policies as above.
```

```sql
-- DESIGN ONLY — Phase 2 (backfill, idempotent). NOT APPLIED.
-- person identity for every worker/customer; company identity for company/agency.
insert into public.account_identities (profile_id, identity_type)
select distinct pr.profile_id, 'person'
from public.profile_roles pr
where pr.role in ('worker','customer')
on conflict do nothing;
-- … company identities + capability rows per the §2.3 mapping …
```

```sql
-- DESIGN ONLY — Phase 3 (dual-read helper). NOT APPLIED.
create or replace function public.has_capability(p_profile uuid, p_cap text)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.account_capabilities c
    where c.profile_id = p_profile and c.capability = p_cap
  )
  or exists ( -- legacy fallback during transition
    select 1 from public.profile_roles pr
    where pr.profile_id = p_profile and (
      (p_cap = 'seek_work'      and pr.role = 'worker')   or
      (p_cap = 'hire_workers'   and pr.role = 'company')  or
      (p_cap = 'offer_workers'  and pr.role = 'agency')   or
      (p_cap = 'buy_services'   and pr.role = 'customer')
    )
  );
$$;
```

---

## 6. Test plan (must be green before each apply)
- **Unit/guard:** pure mapping `legacyRoleToIdentityCapabilities()` (worker→person+seek_work, agency→company+offer_workers, …) with a vitest guard.
- **migration-safety:** each real migration must pass static `migration-safety` (additive, reversible, no unguarded drop, no RLS loosening). Phases 1–4 are additive/guarded; Phase 6 drops ship reversible recreate + zero-row assertion.
- **RLS checks (per migrated policy):** anon = 0 rows; owner = own rows only; cross-account = denied; admin bypass intact. Run before AND after each policy flip; diff must be empty.
- **Auth-gated smoke:** `/dashboard/{company,candidates,buyer,agency,projects}` stay 307→login (not 404/500); after cutover, capability views render for the right identities.
- **Dual-write consistency:** after `add_role`/`complete_onboarding`, both `profile_roles` and `account_*` agree (test in the same transaction).
- **Rollback checks:** Phase 1–2 drop restores prior schema; Phase 3 policy revert restores prior `using`/`with check`; snapshot RLS policy text before/after.
- **Public SEO unaffected:** `check:public-seo-indexing` GREEN throughout (no public surface touched).

---

## 7. Owner decision gates (answer before any RED apply)
- **G1 — Capability vocabulary:** confirm the final capability list (§2.2). Add/rename any? (e.g. split `offer_workers` vs `subcontracting`.)
- **G2 — `admin` stays a permission** (not identity/capability) — confirm (current `is_admin()` kept verbatim).
- **G3 — `customer` backfill identity:** default to **person**, attach to company when co-held? Or always create a person identity? (Data is ambiguous.)
- **G4 — Route strategy:** keep `/dashboard/buyer` + `/dashboard/agency` as capability views, or rename later (separate PR)? (This plan keeps them; rename is out of scope.)
- **G5 — i18n:** rename `spaces.buyer.*` / `roleDashboards.{buyer,agency}.*` keys to capability-named keys during cutover, or keep legacy keys with new copy? (Affects parity guard scope.)
- **G6 — Soak windows:** how long between Phase 5 (cutover) and Phase 6 (cleanup/drops) before we treat legacy as removable?
- **G7 — Apply mechanism:** confirm RED apply path = Supabase MCP `apply_migration` after approval (never `supabase db push`, per CLAUDE.md), one phase per PR, draft + `needs-human-gate`.

---

## 8. Phase sequence (one RED PR per phase, each human-gated)
1. **(this PR)** Plan + guards — docs only. ✅ GREEN, no DB.
2. Phase 1 additive tables + RLS (RED draft, `needs-human-gate`).
3. Phase 2 backfill (RED draft).
4. Phase 3 compat helpers + first migrated policy (RED draft).
5. Phase 3b… remaining policies, one PR each (RED drafts).
6. Phase 4 dual-write RPCs (RED draft).
7. Phase 5 app cutover (GREEN-class code once helpers are authoritative).
8. Phase 6 cleanup drops (RED draft, longest soak, point-of-no-return).

---

## Confirmation (this PR)
Supabase apply **0** · DB mutation **0** · auth/RLS runtime change **0** · enum rename in real schema **0** · route rename **0** · billing/env/secrets **0** · deploy **0**. Docs/plan only. `migration-safety` GREEN (no files under `supabase/migrations/`). Public SEO (#410/#411/#412) untouched.
