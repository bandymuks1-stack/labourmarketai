# Full Cycle Sprint v1 — company-facing scouting/shortlist: OWNER GATE

> **Status:** PROPOSED, **not built**. The remaining cycle link (a company
> picks its demand → sees ranked candidate workers → shortlists them) requires
> a visibility decision that the sprint command file explicitly routes to the
> owner: *"jei RLS keitimas būtinas, sustop ir reportuok kaip owner-gated RED,
> nedaryk savavališkai."* This doc is that report.

## Why this part is owner-gated (not autonomous)

Everything else in the cycle was buildable GREEN and is done / proposed without
touching RLS:

- **Worker player card** shows the three evidence tiers (manager-confirmed →
  **work-journal-supported (new this PR)** → self-declared). Worker-facing,
  own data, no RLS change.
- **Matching v1 engine** (`lib/market/match-v1.ts`) — deterministic, evidence-
  weighted, §19-compliant. Pure, no RLS.
- **Company need intake** — already live (`customer_requests` §17).

The one link that cannot be built without an RLS/visibility decision is the
**company seeing candidate workers**. Per doctrine §4 (default-closed) and §20
(privacy base, symmetric), workers are NOT openly visible to companies. Today
matching is human/admin-mediated (the admin matching workbench has supply
access by design). Opening a worker supply to a company is exactly the kind of
visibility change that must be an explicit owner decision.

## Two options for the owner to choose

### Option A — narrow, GREEN-feasible: scout only the company's OWN workers
The company runs match-v1 over workers it already has a relationship with
(its `engagement_contexts` / `company_workers` + its own `candidate_drafts`).
No new worker-pool visibility → uses existing RLS only. Buildable as a GREEN
slice (additive shortlist table below + a company page + the read layer). This
is honest but narrow (no open-talent discovery).

### Option B — broad: open a consented worker talent pool to companies
A company searches/scouts workers beyond its own. This REQUIRES a new
worker-discoverability/visibility model (a worker opt-in/consent + a curated,
default-closed projection, mirroring the S5 agency-demand pattern). This is a
**RED** change (new RLS + likely a SECURITY DEFINER curated read) and a §20
privacy decision. Must be designed + owner-approved before any code.

## The shortlist table (additive, GREEN — same owner-scoped pattern as candidate_drafts)

Ready to ship under **Option A** (no existing RLS touched; new table only):

```sql
-- supabase/migrations/<ts>_demand_shortlist.sql  (additive, GREEN)
create table if not exists public.demand_shortlist (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  request_id    uuid not null references public.customer_requests(id) on delete cascade,
  worker_id     uuid not null references public.workers(id) on delete cascade,
  status        text not null default 'saved'
                  check (status in ('saved','interested','not_fit','reviewed')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, request_id, worker_id)
);
create index if not exists demand_shortlist_owner_request_idx
  on public.demand_shortlist (owner_id, request_id);

alter table public.demand_shortlist enable row level security;
-- Owner-scoped, mirrors candidate_drafts — NO existing policy is modified.
create policy demand_shortlist_select on public.demand_shortlist for select
  using (owner_id = auth.uid() or public.is_admin());
create policy demand_shortlist_write on public.demand_shortlist for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.demand_shortlist to authenticated;
```

- Statuses are scoped to the demand owner (`owner_id = auth.uid()`); another
  company can never see a foreign shortlist (existing auth model, no new RLS
  semantics on existing tables).
- `migration-safety` note: this is `create policy` on a NEW table (not
  `alter/drop policy`, no `using(true)`, no `to anon`) → classifier GREEN. It
  still ships a paired `.down.sql` + the dual baseline bump, and prod apply
  stays a separate owner step (no `db push`).

## What I need from the owner

1. **Option A or B?** (A = scout own workers, GREEN; B = open talent pool, RED.)
2. If **A**: approve the additive `demand_shortlist` table → I build the GREEN
   slice (table + company scouting page over own workers + match-v1 wiring +
   tests), no prod apply until you approve the migration.
3. If **B**: I first write the worker-consent/visibility design for your
   review before any RLS/SECURITY DEFINER code.

No production DB change and no RLS change has been made. Billing/checkout for
broader scouting is intentionally out of scope (no fake locked candidates).
