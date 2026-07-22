-- @human-gate-approved
--
-- ROLLBACK for supabase/migrations/20260722120000_secdef_anon_authz_bypass_fix_v1.sql
-- ============================================================================
--
-- READ THIS BEFORE RUNNING.
--
-- This rollback is DELIBERATELY NOT a return to the pre-hotfix state.
--
-- The forward migration changed two things:
--   (a) EXECUTE privileges  — removed the inherited PUBLIC grant on 7 functions;
--   (b) the authorization check — NULL-unsafe `<>` replaced by an explicit
--       unauthenticated rejection plus `is distinct from`.
--
-- Neither (a) nor (b) may be undone. Undoing them would restore a live,
-- production-verified anonymous authorization bypass. Per the hotfix contract:
--
--     * this rollback never restores PUBLIC or anon EXECUTE;
--     * this rollback never restores the NULL-unsafe comparison;
--     * this rollback never touches rows that already exist.
--
-- WHAT IT IS FOR:
--   The forward migration used CREATE OR REPLACE FUNCTION, so it rewrote whole
--   function bodies. If a regression is found in the REWRITTEN BUSINESS LOGIC,
--   this file restores each function to its exact pre-hotfix business behaviour
--   (status vocabularies, validation order, timestamp handling, not-found
--   semantics) while KEEPING the security fix in place.
--
--   The business logic below is byte-for-byte the pre-hotfix logic apart from the
--   two authorization lines. In other words: if the forward migration was applied
--   correctly, running this rollback is a functional no-op. That is intended and
--   is the safest possible rollback for a security fix.
--
-- IF THE FUNCTIONS THEMSELVES MUST BE REMOVED ENTIRELY, that is a separate,
-- owner-approved decision — not this file. Dropping them would break the
-- commercial CRM and marketplace write paths for legitimate owners.

begin;

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

-- Privileges are re-asserted in the SAFE direction only. PUBLIC and anon stay
-- revoked. This block is intentionally identical to the forward migration.

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
