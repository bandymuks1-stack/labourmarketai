-- 20261024090000 - one lifecycle contract for needs, offers and listings (v1).
--
-- WHY (owner architecture decision 2026-10-24): every need, offer and listing
-- has the same owner-facing actions — publish, edit, pause, resume, complete,
-- withdraw from the market — through ONE contract
-- (apps/web/lib/market-lifecycle/contract.ts). Two things the contract needs
-- are not stored on the owner-updatable tables today:
--
--   1. WHY a closed entry is closed. `completed` (the need was met / the offer
--      delivered), `withdrawn` (taken off the market without being met) or
--      `discarded` (a draft that was never published). Without it a discarded
--      draft and a closed need are the same row, and "reopen" published a
--      draft nobody submitted. Production 2026-10-24: every need submitted
--      from a draft leaves that draft behind as `closed`.
--   2. A closed state for a service offering — today a provider can only
--      pause one or delete it permanently.
--
-- WHAT: one nullable column, the same name and closed set on both tables,
-- and `closed` added to the service_offerings status CHECK by the drop +
-- re-add idiom. Listings (`marketplace_listings`, RPC-only writes) and the
-- demand transition trigger are a SEPARATE human-gated migration.
--
-- STRICT SUPERSET: every row valid before is valid after; existing rows keep
-- closed_outcome NULL ("closed before outcomes were recorded") — nothing is
-- inferred or backfilled. NO data change, NO RLS change, NO grant, NO
-- function. Discovery is unchanged: every SQL reader of service_offerings
-- already filters on status = 'active', so a closed offering is never found.
-- ROLLBACK: supabase/rollbacks/20261024090000_market_lifecycle_closed_outcome_v1.down.sql
--   (refuses while any closed offering or recorded outcome exists).
-- POST-APPLY: select conrelid::regclass, conname, pg_get_constraintdef(oid)
--   from pg_constraint where conname in ('service_offerings_status_check',
--   'service_offerings_closed_outcome_check', 'customer_requests_closed_outcome_check');

begin;

alter table public.customer_requests
  add column if not exists closed_outcome text;
alter table public.customer_requests
  add constraint customer_requests_closed_outcome_check
  check (closed_outcome is null or closed_outcome in ('completed', 'withdrawn', 'discarded'));

alter table public.service_offerings
  add column if not exists closed_outcome text;
alter table public.service_offerings
  add constraint service_offerings_closed_outcome_check
  check (closed_outcome is null or closed_outcome in ('completed', 'withdrawn', 'discarded'));

alter table public.service_offerings
  drop constraint service_offerings_status_check;
alter table public.service_offerings
  add constraint service_offerings_status_check
  check (status in ('draft', 'active', 'paused', 'closed'));

comment on column public.customer_requests.closed_outcome is
  'Why a closed need is closed: completed | withdrawn | discarded (a never-published draft). NULL = closed before outcomes were recorded. lib/market-lifecycle/contract.ts';
comment on column public.service_offerings.closed_outcome is
  'Why a closed offering is closed: completed | withdrawn | discarded. lib/market-lifecycle/contract.ts';

commit;
