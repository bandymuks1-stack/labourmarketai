-- Rollback of 20261020174000_team_offer_agree_lock_offer_v1: v2 returns to the
-- 20261020172000 body (locks only the proposed terms row).
create or replace function public.respond_team_demand_offer_v2(
  p_offer_id uuid,
  p_decision text,
  p_expected_version integer
)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_current integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if public.team_offer_party_side_v1(p_offer_id) is null then
    raise exception 'Not authorized to answer this offer' using errcode = '42501';
  end if;
  if p_decision = 'accept' then
    select t.version into v_current
      from public.team_demand_offer_terms t
     where t.offer_id = p_offer_id and t.status = 'proposed'
     for update;
    if v_current is distinct from p_expected_version then
      raise exception 'terms_changed' using errcode = '22023';
    end if;
  end if;
  return public.respond_team_demand_offer_v1(p_offer_id, p_decision);
end;
$function$;

revoke all on function public.respond_team_demand_offer_v2(uuid, text, integer) from public, anon;
grant execute on function public.respond_team_demand_offer_v2(uuid, text, integer) to authenticated;
