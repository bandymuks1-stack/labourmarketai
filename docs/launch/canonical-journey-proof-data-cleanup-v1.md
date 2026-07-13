# Canonical-journey proof data — cleanup list v1 (OWNER GATE)

**Status:** LIST ONLY. Nothing here has been deleted. Deletion is permanent
and is a separate owner decision — do not run any step below without owner OK.
**Project ref:** `gorgitwvdzxbnaxhrsrw` (production).
**Source:** `docs/launch/canonical-user-journey-browser-proof-v1.md` (the
2026-07-13 canonical-journey browser proof created these records in
production). No repo code, seed, or test references them — they are pure
production data artifacts.

## What exists (inventory)

### 1. Auth users (Supabase Auth, tagged `user_metadata.e2e_proof = "canonical-journey-v1"`)

| Email | Role | Profile id |
|---|---|---|
| `canonical.journey.proof.worker@e2e-proof.local` | worker | `a34dd6aa-…373d` |
| `canonical.journey.proof.company@e2e-proof.local` | company "E2E Proof Statyba UAB" (`company_type='staffing_agency'`, unverified) | `d808a6e6-…cfb98` |

### 2. Worker-side records (owned by `a34dd6aa-…`)

- `profiles` + `workers` row
- imported CV text (profile text fields)
- 2 catalogued skill claims + 2 own-profile items, work direction "Plytelių klojėjas"
- ≥1 journal entry, Verified-CV composition
- privacy/discoverability consent event — **append-only by design; do NOT delete**

### 3. Company-side records (owned by `d808a6e6-…`)

- `companies` row "E2E Proof Statyba UAB"
- `company_need_public_intakes` row **`b3e0352c-…`** (`status='new'`)
- `customer_requests`: one closed draft + one submitted demand (later closed)
- `demand_shortlist` / scouting pipeline rows for that demand
- ADDED 2026-07-13 (labour-market-os browser proof): one submitted demand
  "Plytelių klojėjų brigada biurų apdailai (E2E PROOF)" (+ its auto-saved
  draft if persisted) — see
  `docs/launch/labour-market-os-browser-proof-v1.md` §7

## Cleanup sequence (owner-run, in this order)

1. **Verify targets first** (read-only):

```sql
select id, email, raw_user_meta_data->>'e2e_proof' as tag
from auth.users
where email in ('canonical.journey.proof.worker@e2e-proof.local',
                'canonical.journey.proof.company@e2e-proof.local');

select id, status, company_name, contact_email
from public.company_need_public_intakes
where id::text like 'b3e0352c%';

select id, title, status, kind from public.customer_requests
where profile_id in ('<worker-profile-id>','<company-profile-id>');
```

Proceed only if every returned row carries the proof tag / proof emails.
If anything looks like real user data — STOP.

2. **Delete the intake row** `b3e0352c-…` from `company_need_public_intakes`
   (service-role SQL; requires migration `20260713190000` applied, or run as
   `postgres` from the SQL editor).

3. **Delete the two auth users** from the Supabase dashboard
   (Authentication → Users). Cascades via FK to `profiles`, `workers`,
   `companies`, `customer_requests`, `demand_shortlist`, journal entries,
   skill claims.

4. **Post-check** (read-only): re-run step 1 queries — all should return
   zero rows (consent events are append-only and may retain a historical row
   keyed by a now-deleted profile id; that is accepted by design).

## Explicitly NOT deleted

- Privacy-consent events (append-only ledger by design).
- Any record not returned by the step-1 verification queries.
- Nothing in this list is touched by agents — owner-only, permanent action.
