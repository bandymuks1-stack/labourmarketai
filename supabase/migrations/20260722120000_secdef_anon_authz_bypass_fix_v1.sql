-- @human-gate-approved
--
-- P0 SECURITY HOTFIX — anonymous SECURITY DEFINER authorization bypass (2026-07-22)
-- ============================================================================
--
-- WHAT WAS WRONG (verified in production 2026-07-22, project gorgitwvdzxbnaxhrsrw):
--
--   Seven SECURITY DEFINER RPCs guarded ownership with
--
--       if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
--
--   For an unauthenticated caller auth.uid() is NULL, so `v_owner <> NULL`
--   evaluates to NULL, PL/pgSQL treats NULL as false, the exception never
--   fires, and the UPDATE/DELETE proceeds with DEFINER privileges.
--
--   The functions were reachable by `anon` because their ACL was
--       {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
--   The leading `=X/postgres` is the default PUBLIC grant: the migrations that
--   created these functions ran `GRANT EXECUTE ... TO authenticated` but never
--   `REVOKE EXECUTE ... FROM PUBLIC`. `anon` therefore inherited EXECUTE
--   through PUBLIC — it was never granted to `anon` explicitly.
--
--   Live proof (rolled back, zero rows left behind):
--       set_marketplace_listing_status_v1 as role anon -> NO_ERROR, status_now=closed
--
--   Source migrations that introduced the defect:
--       20260718190000_commercial_crm.sql        (contracts, proposals)
--       20260718210000_marketplace_listings.sql  (marketplace listings)
--
-- WHAT THIS MIGRATION CHANGES:
--
--   1. Replaces the NULL-unsafe check in exactly 7 functions with an explicit
--      unauthenticated rejection plus a NULL-safe ownership comparison:
--
--          if auth.uid() is null then raise exception 'not authorized'; end if;
--          ...
--          if v_owner is distinct from auth.uid() then
--            raise exception 'not authorized';
--          end if;
--
--      The unauthenticated rejection is placed BEFORE the row lookup so that a
--      non-existent id can never be answered as if the caller were authorized.
--
--   2. Fixes EXECUTE privileges on those 7 exact signatures only:
--      REVOKE FROM PUBLIC, REVOKE FROM anon (explicit and defensive — anon holds
--      no direct grant today, it inherits via PUBLIC), GRANT TO authenticated.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES **NOT** DO:
--
--   - It does NOT touch the other 47 functions that also inherit PUBLIC EXECUTE.
--     Some of those are intentionally public (e.g. submit_company_need_public_v1,
--     get_public_business_profile_v1). A blanket revoke would break them. They are
--     inventoried in docs/security/secdef-public-execute-inventory-v1.md and are a
--     separate, non-P0 follow-up.
--   - It does NOT change any table, column, row, RLS policy, or trigger.
--   - It does NOT change function ownership, return types, signatures, argument
--     defaults, search_path, or any legitimate-owner behaviour.
--
-- IDEMPOTENCY / RE-RUN SAFETY:
--   Every statement is CREATE OR REPLACE / REVOKE / GRANT — safe to run more than
--   once. CREATE OR REPLACE FUNCTION preserves the existing owner and does not
--   reset the ACL, so the REVOKE/GRANT block below is what fixes privileges.
--   Argument defaults are restated verbatim because CREATE OR REPLACE replaces
--   the whole definition.
--
-- ROLLBACK: supabase/rollbacks/20260722120000_secdef_anon_authz_bypass_fix_v1.down.sql
--   The rollback restores the previous BUSINESS logic only. It never restores
--   PUBLIC/anon EXECUTE and never restores the NULL-unsafe comparison.
--
-- CLASS: RED (SECURITY DEFINER + GRANT/REVOKE). Human gate required.
--        Production apply is a separate OWNER GATE — not applied by this PR.

begin;

-- ---------------------------------------------------------------------------
-- 1/7  public.delete_contract_v1(p_contract_id uuid) -> void
-- ---------------------------------------------------------------------------
create or replace function public.delete_contract_v1(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id into v_owner from public.contracts where id = p_contract_id;
  if v_owner is null then return; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  delete from public.contracts where id = p_contract_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 2/7  public.set_contract_status_v1(p_contract_id uuid, p_status text) -> void
-- ---------------------------------------------------------------------------
create or replace function public.set_contract_status_v1(p_contract_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id into v_owner from public.contracts where id = p_contract_id;
  if v_owner is null then raise exception 'contract not found'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if p_status not in ('draft','active','completed','cancelled') then raise exception 'invalid status'; end if;
  update public.contracts set status = p_status, updated_at = now() where id = p_contract_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 3/7  public.delete_proposal_v1(p_proposal_id uuid) -> void
-- ---------------------------------------------------------------------------
create or replace function public.delete_proposal_v1(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id into v_owner from public.proposals where id = p_proposal_id;
  if v_owner is null then return; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  delete from public.proposals where id = p_proposal_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 4/7  public.set_proposal_status_v1(p_proposal_id uuid, p_status text,
--                                    p_rejection_reason text) -> void
-- ---------------------------------------------------------------------------
create or replace function public.set_proposal_status_v1(p_proposal_id uuid, p_status text, p_rejection_reason text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id into v_owner from public.proposals where id = p_proposal_id;
  if v_owner is null then raise exception 'proposal not found'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if p_status not in ('draft','sent','accepted','rejected','withdrawn') then raise exception 'invalid status'; end if;
  update public.proposals set status = p_status,
    sent_at = case when p_status = 'sent' and sent_at is null then now() else sent_at end,
    accepted_at = case when p_status = 'accepted' then now() when p_status in ('draft','sent') then null else accepted_at end,
    rejection_reason = case when p_status = 'rejected' then nullif(left(coalesce(p_rejection_reason,''),1000),'') else null end,
    updated_at = now() where id = p_proposal_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 5/7  public.delete_marketplace_listing_v1(p_id uuid) -> void
-- ---------------------------------------------------------------------------
create or replace function public.delete_marketplace_listing_v1(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id into v_owner from public.marketplace_listings where id = p_id;
  if v_owner is null then return; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  delete from public.marketplace_listings where id = p_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 6/7  public.set_marketplace_listing_status_v1(p_id uuid, p_status text) -> void
-- ---------------------------------------------------------------------------
create or replace function public.set_marketplace_listing_status_v1(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id into v_owner from public.marketplace_listings where id = p_id;
  if v_owner is null then raise exception 'listing not found'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if p_status not in ('draft','active','closed') then raise exception 'invalid status'; end if;
  update public.marketplace_listings set status = p_status, updated_at = now() where id = p_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 7/7  public.update_marketplace_listing_v1(p_id uuid, p_title text,
--        p_category text, p_listing_kind text, p_description text,
--        p_location_country text, p_location_label text, p_price_text text) -> void
-- ---------------------------------------------------------------------------
create or replace function public.update_marketplace_listing_v1(p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text default null::text, p_location_country text default null::text, p_location_label text default null::text, p_price_text text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select owner_id into v_owner from public.marketplace_listings where id = p_id;
  if v_owner is null then raise exception 'listing not found'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if p_listing_kind not in ('sale','rental','wanted') then raise exception 'invalid listing_kind'; end if;
  if p_category not in ('accommodation','premises','vehicle','tools','equipment','machinery','safety_equipment')
    then raise exception 'invalid category'; end if;
  if p_title is null or char_length(trim(p_title)) < 3 then raise exception 'title required'; end if;
  update public.marketplace_listings set
    title = left(trim(p_title),160),
    category = p_category,
    listing_kind = p_listing_kind,
    description = nullif(left(coalesce(p_description,''),2000),''),
    location_country = nullif(upper(left(coalesce(p_location_country,''),2)),''),
    location_label = nullif(left(coalesce(p_location_label,''),120),''),
    price_text = nullif(left(coalesce(p_price_text,''),80),''),
    updated_at = now()
  where id = p_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- EXECUTE privileges — exact signatures only, scoped to these 7 functions.
-- REVOKE FROM PUBLIC removes the inherited grant that made anon reachable.
-- REVOKE FROM anon is explicit and defensive (no direct anon grant exists today).
-- ---------------------------------------------------------------------------

revoke execute on function public.delete_contract_v1(p_contract_id uuid) from public;
revoke execute on function public.delete_contract_v1(p_contract_id uuid) from anon;
grant  execute on function public.delete_contract_v1(p_contract_id uuid) to authenticated;

revoke execute on function public.set_contract_status_v1(p_contract_id uuid, p_status text) from public;
revoke execute on function public.set_contract_status_v1(p_contract_id uuid, p_status text) from anon;
grant  execute on function public.set_contract_status_v1(p_contract_id uuid, p_status text) to authenticated;

revoke execute on function public.delete_proposal_v1(p_proposal_id uuid) from public;
revoke execute on function public.delete_proposal_v1(p_proposal_id uuid) from anon;
grant  execute on function public.delete_proposal_v1(p_proposal_id uuid) to authenticated;

revoke execute on function public.set_proposal_status_v1(p_proposal_id uuid, p_status text, p_rejection_reason text) from public;
revoke execute on function public.set_proposal_status_v1(p_proposal_id uuid, p_status text, p_rejection_reason text) from anon;
grant  execute on function public.set_proposal_status_v1(p_proposal_id uuid, p_status text, p_rejection_reason text) to authenticated;

revoke execute on function public.delete_marketplace_listing_v1(p_id uuid) from public;
revoke execute on function public.delete_marketplace_listing_v1(p_id uuid) from anon;
grant  execute on function public.delete_marketplace_listing_v1(p_id uuid) to authenticated;

revoke execute on function public.set_marketplace_listing_status_v1(p_id uuid, p_status text) from public;
revoke execute on function public.set_marketplace_listing_status_v1(p_id uuid, p_status text) from anon;
grant  execute on function public.set_marketplace_listing_status_v1(p_id uuid, p_status text) to authenticated;

revoke execute on function public.update_marketplace_listing_v1(p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text, p_location_country text, p_location_label text, p_price_text text) from public;
revoke execute on function public.update_marketplace_listing_v1(p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text, p_location_country text, p_location_label text, p_price_text text) from anon;
grant  execute on function public.update_marketplace_listing_v1(p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text, p_location_country text, p_location_label text, p_price_text text) to authenticated;

commit;
