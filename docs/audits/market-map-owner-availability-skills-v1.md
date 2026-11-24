# Market Map — owner availability + skills hints v1 (audit)

**Scope:** add an owner-only **availability / mobility** summary and an
owner-only **capability (skills) signal** summary to the Market Map. **No public
aggregate, no cross-user read, no SECURITY DEFINER RPC, no DB migration, no
billing/auth/env, no fake data.**

## Fields reviewed (all already exist — no migration needed)

| Source | Fields | Use |
|---|---|---|
| `workers` | `availability_status` (`available`/`busy`/`unavailable`), `available_from` (date), `current_location_country`, `preferred_countries[]` | availability + mobility |
| `worker_skills` | `skill_id`, `self_rated_level` (1–5), `verified` (bool), `verified_by`, `verified_at` | capability status |
| `journal_entry_skills` | `worker_id`, `skill_id` | real work evidence → "suggested" |
| `skills` | `name_lt`, `name_en`, `category` | localized skill names (public taxonomy) |

## RLS — owner self-read confirmed (no cross-user)

- `workers_select`: `profile_id = auth.uid()` (owner reads own worker).
- `worker_skills_select`: `owns_worker(worker_id)`.
- `journal_entry_skills_select`: `owns_worker(worker_id)`.
- `skills_select`: `using (true)` — taxonomy names only, not user data.

Every fetch is filtered to the caller's own worker row and double-guarded by
RLS, so no other user's data is ever read.

## Answers

1. **Can availability be shown without a migration?** Yes —
   `availability_status` + `available_from` give *available now / from a date /
   unknown*; `current_location_country` + `preferred_countries` give the
   mobility signal. **Accommodation** is a *company-need* field
   (`company_demand_locations.accommodation_needed`, already shown since #465);
   the `workers` table has no accommodation field, so the availability block
   does **not** invent one.

2. **Can capabilities be shown owner-only?** Yes. Classification from real data:
   - **confirmed** — `worker_skills.verified = true` (real `verified_by` /
     `verified_at` evidence). Never set otherwise — no fake verification.
   - **suggested** — the skill has real journal-work evidence
     (`journal_entry_skills`) but is not verified.
   - **self_declared** — a `worker_skills` row (self-rated) with no verification
     and no journal evidence.

3. **Empty states:** a company owner (or a worker with no data yet) gets an
   action to complete the profile — never a fake/empty state.

## What this PR builds

- `lib/market-map/owner-readiness.ts` — owner-scoped `getOwnAvailability()` +
  `getOwnCapabilities()` (RLS-scoped, no aggregate, no cross-user).
- `components/app/market-map-owner-readiness.tsx` — two owner blocks
  ("Availability & mobility", "Capability signals") with self_declared /
  suggested / confirmed separation.
- `messages/{lt,en,ru}.json` — `marketMap.readiness.*` + `marketMap.capabilities.*`.

## Safety confirmation

No `marketSignals` (public aggregate) in the UI, no cross-user read, no
`service_role`, no `.rpc`, no SECURITY DEFINER, **no DB migration**, no
billing/auth/env, no fake availability / skills / verification.

## Next PR (rates / projects)

- Honest four-way **rate-type** structure (worker take-home / freelancer-ZZP /
  company-subcontract / client price) — no fake rates.
- Per-project confirmation badge + project-page CTA.
- Optional: surface availability on the public layer only once an aggregated,
  min-bucket-safe source exists (owner-gated).
