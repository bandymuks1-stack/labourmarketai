# W10 closure + P0 Compact Marketplace Completion Train (for owner approval)

> **Status: PLAN + EVIDENCE. No DB mutated. No code written.** Read-only audit
> queries were run against prod (`gorgitwvdzxbnaxhrsrw`). Two RED decision points
> at the end.

---

# PART 1 — W10 stale-data backfill

## 1. What W10 is
W10 was never formally specified — it appears only as a *deferred* "staleness
handling" placeholder (out-of-scope note in the W6 plan). So the task is an
**audit-and-quantify**: find any real stale data, and per the hard rule —
*"if stale data does not require mutation, report no-op with evidence and move on."*

## 2. Live evidence (read-only counts, prod, 2026-06-27)
| Candidate | Count | Verdict |
|---|---|---|
| `projects` with `organization_id IS NULL` AND `company_id` set | **4** | **Real stale data — one scoped backfill** |
| `journal_entries.project_id IS NULL` | 19 (all) | **No-op — intentional** ("no invented history", migration `20260610213000`) |
| `journal_entries.engagement_context_id IS NULL` | 0 | clean |
| manager/external_manager engagements with `operations_role IS NULL` | 0 | clean |
| `organizations` missing both legacy bridge cols | 0 | clean (mirroring complete) |
| `companies` with no mirrored org | 0 | clean |
| `agencies` with no mirrored org | 0 | clean |
| `worker_skills` verified but missing `verified_by`/`verified_at` | 0 | clean |
| `customer_requests` submitted/in_review missing role/country | 8 | **No-op for W10 — handled by the EXISTING admin need-structuring tool** (deterministic + admin review; not a blind backfill, not a new migration) |
| `booking_requests` / `service_offerings` rows | 0 / 0 | nothing to backfill |

**The only mutation-worthy item: 4 `projects` un-rerouted to the canonical org
model.** Dry-run confirms each maps to **exactly one** organization via the legacy
bridge (`organizations.legacy_company_id = projects.company_id`) — fully
deterministic, no guessing. All 4 are `draft`. (The newest is 2026-06-16, *after*
the reroute migration — so the app's project-creation path doesn't set
`organization_id`; that recurrence is a separate GREEN app finding, below.)

## 3. Does W10 block the marketplace loop?
**No.** `projects` relate to work-journal/proof linkage, not buyer↔seller
discovery. `service_offerings` / `customer_requests` / `booking_requests` carry no
blocking stale data. **W10 is a proven no-op for the marketplace loop.**

## 4. The one optional backfill — exact plan
Tightly-scoped, additive, reversible. **NOT applied** (awaiting approval).

**Apply method:** Supabase MCP `apply_migration` (a one-time data migration) — or,
if you prefer, a single reviewed `execute_sql` UPDATE. Never `db push`.

**Dry-run (already run, read-only):** 4 rows, each → exactly 1 org. ✓

**Backfill SQL (tight WHERE, ambiguity-guarded):**
```sql
update public.projects p
   set organization_id = o.id, updated_at = now()
  from public.organizations o
 where p.organization_id is null
   and p.company_id is not null
   and o.legacy_company_id = p.company_id
   -- refuse any company that maps to !=1 org (no guessing):
   and (select count(*) from public.organizations o2
         where o2.legacy_company_id = p.company_id) = 1;
```
**Before/after counts:** before `organization_id IS NULL AND company_id NOT NULL`
= 4; expected after = **0** (4 rows updated). No rows deleted, no other column
touched.

**Rollback:** capture the 4 ids first; rollback sets them back to NULL (they were
NULL):
```sql
-- capture: select id from public.projects where organization_id is null and company_id is not null;
update public.projects set organization_id = null, updated_at = now()
 where id in (<the 4 captured ids>);
```

**Risk list:** (1) wrong org assignment → mitigated by the `=1` ambiguity guard +
deterministic legacy bridge; (2) recurrence → the backfill is one-time; the
app-creation-path gap is a separate fix (below); (3) RLS/visibility → projects RLS
is `owns_company(company_id) or is_admin() or (status='live' ...)`; adding
`organization_id` does not widen visibility (no policy reads it for projects);
the rows are `draft` so not even `live`-visible. **No privacy expansion.**

**Validation/smoke after apply:** re-run the count (expect 0); confirm the 4 rows'
`company_id` unchanged and `organization_id` now set to the dry-run target; spot
the owning company can still see its projects (RLS unchanged). typecheck/lint/
build/vitest unaffected (no code change) but re-run to be safe.

**Separate GREEN finding (not part of this backfill):** the project-creation
server action should set `organization_id` from the org at creation so this does
not recur. Recommend folding that one-line fix into Train B/D app work, not W10.

## 5. W10 decision point
- **A) Approve the 4-row backfill** (apply via MCP) → I apply, verify, done.
- **B) Skip it** — it's non-blocking; leave the 4 draft projects as-is and fix the
  creation path app-side later. (W10 = pure no-op.)
- **C) No-op only** — accept the evidence; do nothing.

**Recommendation: A** (it's tiny, deterministic, reversible, and aligns legacy
rows with the canonical model) — but it does **not** gate the marketplace work
either way, since W10 is a proven no-op for the loop.

---

# PART 2 — P0 Compact Marketplace Completion Train

**Purpose:** make the system one real compact commercial product — a working
buyer↔provider request loop and one compact next-action dashboard — not separate
modules.

## A. Loop audit (current reality)
| Loop step | State | GREEN/RED |
|---|---|---|
| 1. Provider publishes offering | ✅ W8 `/dashboard/services` (create/edit/activate-pause/delete), owner-scoped | done |
| 2. Buyer discovers active offerings | ❌ `service_offerings` SELECT is owner+admin only — **no cross-user discovery exists** | **RED** (RLS) |
| 3. Buyer sends request for an offering | ❌ no offering-request path (`booking_requests` is demand+worker-centric; `customer_requests` is demand posting) | **RED** (table+RPC) |
| 4. Provider sees incoming request | ❌ no provider request inbox (bookings inbox is worker-addressed) | RED schema → GREEN UI |
| 5. Provider accepts/rejects/responds | ◐ pattern exists for bookings (`respond_booking_request`) — reuse the shape | RED RPC |
| 6. Buyer sees status | ◐ booking status RLS exists; offering-request status needs the new object | GREEN UI on RED object |
| 7. Work → journal/proof | ✅ journal + confirm spine exist | done (link is later) |
| 8. Manager confirmation → work history | ✅ confirm spine | done |
| 9. Learning separate from confirmed facts | ✅ W6 keeps signals/suggestions separate | done |
| 10. One compact next-action dashboard | ◐ surfaces scattered (overview/market-map/journal/communication primary; services/buyer/bookings not unified) | **GREEN** |

**Conclusion:** the loop's missing heart is **discovery of active offerings + a
structured request that lands in a provider inbox with accept/reject status.**
That first slice is **RED** (needs an additive RLS policy + a new request object +
RPCs). Everything downstream (UI, dashboard unification) is GREEN once the object
exists.

## B. The trains (compact, reuse-first)
- **Train A — Real marketplace request loop (FIRST).** Discovery visibility →
  request a selected offering → provider inbox → accept/reject/respond → buyer
  status → history/audit. *No fake demand/services, no payment.* **First slice =
  RED (below).**
- **Train B — Compact dashboard / next action.** One person dashboard + one
  company dashboard that fold map/services/requests/learning into a single
  "what can I do next?" flow; remove/hide dead/preparing cards. Mobile-first.
  **GREEN** (after the loop object exists, so the dashboard has a real request
  surface to show).
- **Train C — Profile / CV / Player Card completion.** CV import/upload, skill
  extraction as **suggestions only** (reuse W6), profile completion, player-card
  identity, avatar/map consistency, self-claimed vs suggested vs confirmed kept
  separate. Mostly **GREEN**; CV upload storage may be **RED** (bucket) — audit
  when reached.
- **Train D — Work passport / proof.** Work object/passport, photos/docs (audit
  whether storage exists), checklist/proof, responsible person/company, sign-off
  → connect to the confirm spine. Likely **RED** (storage + schema) — plan when
  reached.
- **Train E — Paid pilot readiness.** Pilot offer/contact flow, first
  company/agency onboarding, admin monitoring, **manual invoice acceptable, no
  payment system**. Mostly **GREEN** + ops; no commerce schema yet.

## C. FIRST SLICE — exact RED plan (Train A, smallest complete loop)
"Buyer discovers an active offering → requests it → provider sees it → provider
accepts/declines → buyer sees status." Additive, owner/2-party-scoped, reversible.
Mirrors the proven `booking_requests` pattern. **NOT built — awaiting approval.**

**New migration (NOT editing the frozen W8 file): `<UTC>_service_offering_requests.sql`**

1. **Discovery RLS (additive SELECT policy on `service_offerings`):**
```sql
drop policy if exists service_offerings_discover_active on public.service_offerings;
create policy service_offerings_discover_active on public.service_offerings
  for select to authenticated
  using (status = 'active');
```
Owners still see their own (any status) via the existing policy; authenticated
users additionally see **active** offerings only. No insert/update/delete
cross-user. Exposes only the offering columns the provider already published as
active (title/description/category/country/remote/rate_text/provider_id) — no
contact details (none are stored). *This is the intended marketplace semantics:
"active" = discoverable.*

2. **New table `public.service_offering_requests` (the request object):**
```sql
create table public.service_offering_requests (
  id            uuid primary key default gen_random_uuid(),
  offering_id   uuid not null references public.service_offerings(id) on delete cascade,
  provider_id   uuid not null references public.profiles(id) on delete cascade, -- = offering.provider_id
  buyer_id      uuid not null references public.profiles(id) on delete cascade,
  message       text check (message is null or char_length(message) <= 2000),
  status        text not null default 'sent'
                  check (status in ('sent','accepted','declined','withdrawn')),
  response_note text check (response_note is null or char_length(response_note) <= 2000),
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index service_offering_requests_provider_idx on public.service_offering_requests (provider_id, status, created_at desc);
create index service_offering_requests_buyer_idx    on public.service_offering_requests (buyer_id, created_at desc);
```
RLS (both parties see, neither edits raw):
```sql
alter table public.service_offering_requests enable row level security;
create policy sor_select on public.service_offering_requests for select to authenticated
  using (buyer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
-- writes go through the RPCs below; no direct insert/update policy (RPC-only).
grant select on public.service_offering_requests to authenticated;
```

3. **Three SECURITY DEFINER RPCs (mirror `booking_requests`; each re-checks live
   identity, validates state, returns tagged strings):**
   - `request_service_offering(p_offering_id uuid, p_message text) returns uuid` —
     buyer path. Validates: `auth.uid()` set; the offering exists and `status =
     'active'`; buyer ≠ the offering's provider; pins `buyer_id = auth.uid()`,
     `provider_id =` the offering's provider; inserts `status='sent'`. Returns the
     new id. (Definer because the insert must bind provider_id from the offering
     and assert active — same shape as `propose_booking_request`.)
   - `respond_service_offering_request(p_id uuid, p_decision text, p_note text)
     returns text` — provider path. Asserts caller `= provider_id`; status is
     `sent`; sets `accepted`/`declined` + `responded_at` + note. Tagged returns.
   - `withdraw_service_offering_request(p_id uuid) returns text` — buyer path.
     Asserts caller `= buyer_id`; status `sent` → `withdrawn`.
   Each: `security definer set search_path = public`, `revoke all … from public;
   grant execute … to authenticated`. No `verified` writes, no payment.

**Rollback:** guarded drops (refuse non-empty); `drop policy
service_offerings_discover_active`; drop the 3 RPCs; drop the table.

**GREEN app (same PR or fast-follow):**
- Buyer **discover** surface: a route listing active offerings (reads via the new
  discovery policy) with a "Request this service" action calling
  `request_service_offering`. Honest empty state.
- Provider **inbox**: incoming `service_offering_requests` with accept/decline
  (calls `respond_…`). Lands as a real next-action on the provider dashboard.
- Buyer **status**: the buyer sees each request's status (sent/accepted/declined).
- i18n lt/en/ru; honest degradation (`needs-migration`); guards (RLS-safety,
  no-anon/public/using(true), no-fake-data, no-payment, honest-degradation,
  i18n parity, discovery-policy-active-only, RPC-authority).

**Why RED & safe:** the discovery policy is additive and read-only for `status=
'active'`; the request object is 2-party-scoped (buyer+provider+admin) with no
cross-company leakage; writes are RPC-gated with live-identity re-checks; no
payment, no ratings, no broad public/anon discovery (authenticated only). It does
not touch W8's frozen migration, booking_requests, customer_requests, learning,
or the confirm spine.

**Out of scope for the first slice (later trains / explicit approval):** payments,
ratings/reviews, public/anon discovery, auto-matching, contact-detail exposure,
CV upload storage, work-passport media.

## D. First-slice decision point
- **A) Approve building the first RED slice** as specified (discovery RLS + 
  `service_offering_requests` + 3 RPCs + GREEN buyer/provider UI), migration
  **drafted but NOT applied**, draft + `needs-human-gate` PR, full validation.
- **B) Adjust** — e.g. ship discovery + request + provider-inbox now and defer
  accept/reject; or reuse conversations for the contact intent instead of a
  structured request object (less structured status); or change scope.
- **C) Stop.**

**Recommendation: A.** It is the smallest *complete* honest loop and reuses the
proven booking pattern. The conversation-only alternative (B-variant) is smaller
but gives no structured accept/reject status, which the loop explicitly needs.
