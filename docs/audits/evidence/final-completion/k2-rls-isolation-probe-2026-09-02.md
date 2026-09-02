# Train K2 — RLS / tenant-isolation probe on production, three bounded identities (2026-09-02)

Identities: **walker** (owner/manager of `E2E Walker UAB`), **worker2** (on that roster, 5 imported allocations),
**outsider** (unrelated onboarded worker). Every probe = a PostgREST `SELECT` through the caller's own JWT,
so RLS decides. Cells = HTTP status / rows returned.

| Probe | walker | worker2 | outsider | Expected | Verdict |
|---|---|---|---|---|---|
| `profiles` (walker's row) | 200/1 | 200/0 | 200/0 | own only | PASS |
| `workers` (walker's worker) | 200/1 | 200/0 | 200/0 | own / managed only | PASS |
| `company_workers` (walker company roster) | 200/1 | 200/1 | 200/0 | manager + the rostered worker | PASS |
| `work_objects` (walker org) | 200/1 | 200/0 | 200/0 | org managers | PASS (worker sees none — by current policy) |
| `work_hour_allocations` (walker org) | 200/5 | 200/5 | 200/0 | manager + the worker's own | PASS |
| `journal_entries` (worker2's) | 200/0 | 200/0 | 200/0 | (none exist) | — |
| `engagement_contexts` (walker's) | 200/3 | 200/0 | 200/0 | own only | PASS |
| `organizations` (walker org) | 200/1 | 200/0 | 200/0 | members only | PASS |
| **`companies` (walker company)** | 200/1 | 200/1 | **200/1** | owner / roster / admin | **FINDING K2-1** |
| `profiles` unfiltered | 200/1 | 200/1 | 200/1 | own only | PASS |
| `workers` unfiltered | 200/4 | 200/1 | 200/1 | own + managed | PASS |
| outsider `INSERT work_objects` (walker org) | — | — | **403 42501** | refused | PASS |
| outsider `INSERT company_workers` | — | — | **403** | refused | PASS |
| outsider `UPDATE profiles` (walker) | — | — | 200 / 0 rows | filtered | PASS |

## Finding K2-1 — `companies` rows readable by every signed-in person (P1, privacy / data minimisation)

Policy `companies_select` is `auth.uid() IS NOT NULL`: any authenticated user can read every company row,
including `contact_email`, `contact_phone`, `address`, `registration_code`, `requester_role`,
`verification_note`. The product's own contact model requires consent before contact details are disclosed
(`contact_disclosure_requests`, `contact-permission.ts`), so this policy bypasses it for company contacts. It
is not exploitable anonymously (no anon grant; K1 PASS) and the owner's own fields are legitimately needed by
the setup form — the fix is COLUMN-level:

1. keep row visibility for discovery (name, country, type, verification status, website, description);
2. `revoke select on public.companies from authenticated; grant select (id, profile_id, legal_name,
   display_name, country, website, description, company_type, verification_status, trust_score, created_at,
   updated_at) on public.companies to authenticated;`
3. a SECURITY DEFINER `get_own_company_private_v1(p_company_id)` returning the private columns for the
   owner (`profile_id = auth.uid()`) or an admin; the setup form and the employer context read them from it;
4. the consented contact path stays where it is (`contact-permission.ts` decides, then reads).

RED by rule (grants + SECDEF) → DRAFT + `needs-human-gate` **PR #1430** with the app-side reads adapted in the same PR;
until applied, the exposure stands and is recorded in the register as P1 open (contained by the fact that it
needs an account and reveals business contact data, not personal profiles).

Script: scratchpad `k2-rls-probe.mjs` (statuses and counts only). Residue: identity `e2e-outsider-…` (gate G-9).
