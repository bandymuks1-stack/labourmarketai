-- Rollback for 20261118100000_agency_partnerships_commissions_v1.
--
-- One transaction. It REFUSES while any partnership, any need passed to a partner, or any offer
-- made through a partner exists: dropping them would erase which agency placed a candidate and on
-- which agreed share. Otherwise it restores the two objects this migration replaced to their
-- 20261114235900 definitions (copied verbatim below), then drops what this migration added.
-- 20261114235900 itself is left in place; its own rollback undoes it.
begin;

do $$
declare
  n_part   bigint;
  n_pass   bigint;
  n_offers bigint;
begin
  select count(*) into n_part from public.agency_partnerships;
  select count(*) into n_pass from public.agency_partner_request_shares;
  select count(*) into n_offers from public.agency_candidate_offers where partner_share_id is not null;
  if n_part > 0 or n_pass > 0 or n_offers > 0 then
    raise exception
      'ROLLBACK REFUSED: % partnership(s), % passed need(s), % partner offer(s) exist.',
      n_part, n_pass, n_offers;
  end if;
end $$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where table_name in ('agency_partnerships', 'agency_partner_request_shares');
  end if;
  if to_regclass('public.privacy_erasure_value_rules_v3') is not null then
    delete from public.privacy_erasure_value_rules_v3 where table_name = 'agency_partnerships';
  end if;
end $$;

-- Restore 20261114235900's respond_agency_candidate_offer_v2 (verbatim).
create or replace function public.respond_agency_candidate_offer_v2(
  p_offer_id         uuid,
  p_decision         text,
  p_note             text default null,
  p_accepted_term_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_offer  public.agency_candidate_offers%rowtype;
  v_term   uuid;
  v_result uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select * into v_offer from public.agency_candidate_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found' using errcode = '42501'; end if;
  if not public.owns_company(v_offer.client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if p_decision = 'accepted' then
    select t.id into v_term
      from public.agency_placement_terms t
     where t.company_id = v_offer.agency_company_id and t.retired_at is null;
    -- The employer must accept the term they were shown, and only that one:
    -- a term changed since the page was read is refused, never assumed.
    if v_term is not null and p_accepted_term_id is distinct from v_term then
      raise exception 'placement_term_not_accepted' using errcode = 'P0004';
    end if;
  end if;

  -- The decision and the booking are v1's, unchanged.
  v_result := public.respond_agency_candidate_offer_v1(p_offer_id, p_decision, p_note);

  if p_decision = 'accepted' and v_term is not null then
    update public.agency_candidate_offers
       set accepted_placement_term_id = v_term,
           placement_term_accepted_at = now()
     where id = p_offer_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (v_uid, 'agency_placement_term_accepted', 'agency_candidate_offers', p_offer_id,
      jsonb_build_object('term_id', v_term,
                         'agency_company_id', v_offer.agency_company_id,
                         'client_company_id', v_offer.client_company_id));
  end if;

  return v_result;
end;
$$;

-- Restore 20261114235900's agency_placement_terms_select (verbatim).
drop policy if exists agency_placement_terms_select on public.agency_placement_terms;
create policy agency_placement_terms_select on public.agency_placement_terms
  for select to authenticated
  using (
    retired_at is null
    or public.owns_company(company_id)
    or exists (
      select 1 from public.agency_candidate_offers o
       where o.accepted_placement_term_id = agency_placement_terms.id
         and public.owns_company(o.client_company_id)
    )
    or public.is_admin()
  );

drop function if exists public.placement_term_accepted_for_caller_v1(uuid);
drop function if exists public.list_agency_commissions_v1();
drop function if exists public.list_partner_offers_for_lead_v1();
drop function if exists public.list_partner_shared_requests_v1();
drop function if exists public.list_agency_partnerships_v1();
drop function if exists public.submit_partner_candidate_offer_v1(uuid, uuid, text);
drop function if exists public.unshare_request_with_partner_v1(uuid);
drop function if exists public.share_request_with_partner_v1(uuid, uuid);
drop function if exists public.end_agency_partnership_v1(uuid);
drop function if exists public.decline_agency_partnership_v1(uuid);
drop function if exists public.accept_agency_partnership_v1(uuid, uuid);
drop function if exists public.invite_agency_partner_v1(uuid, text, numeric);

-- R2 P2-1: v1 callable again, exactly as on main.
grant execute on function public.respond_agency_candidate_offer_v1(uuid, text, text) to authenticated;

-- R2 P2-3: the offer read policy verbatim as 20260901052300 left it (before the
-- column it now references is dropped).
drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    public.owns_company(agency_company_id)
    or (public.owns_company(client_company_id)
        and exists (select 1 from public.agency_client_connections c
                     where c.id = connection_id and c.status = 'active'))
    or public.is_admin()
  );

drop index if exists public.agency_candidate_offers_partner_share;
alter table public.agency_candidate_offers drop column if exists partner_share_id;
drop table if exists public.agency_partner_request_shares;
drop table if exists public.agency_partnerships;

commit;
