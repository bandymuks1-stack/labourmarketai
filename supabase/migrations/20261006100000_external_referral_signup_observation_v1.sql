-- 20261006100000 — external referral: "this reference registered" (v1)
--
-- SAFETY CLASS: RED (SECURITY DEFINER functions + GRANT/REVOKE). Draft PR +
-- `needs-human-gate`. Ships UNAPPLIED. Apply ONLY via Supabase MCP
-- `apply_migration` after explicit owner approval. No `@human-gate-approved`
-- marker is written here: that marker asserts an owner approval that has not
-- been given.
--
-- PROBLEM. A worker who wrote to an approved external source (Nonstop) is sent
-- /for-workers?utm_source=nonstop&utm_content=ns-inbound-<12 hex>. The 12 hex
-- are the referral envelope's `external_reference`
-- (`invitations.external_reference`, 20260917120000). The worker self-registers
-- — there is no invitation token in that link — and NOTHING joined the new
-- account back to the reference, so the source could never learn "reference X
-- registered" (its OBSERVED_SIGNUP state was reserved and unreadable).
--
-- DESIGN (reuse, no new table). The canonical append-only observation record
-- for this system is `audit_logs` — exactly where `receive_external_referral_v1`
-- already writes "reference X was received". This migration adds the matching
-- "reference X registered" row, and one service_role-only reader:
--
--   record_external_referral_signup_v1(source, reference)  [authenticated]
--     Writes ONE audit row for (caller, source, reference), idempotently.
--     It is an OBSERVATION: it does NOT accept the invitation, does not touch
--     `invitations.use_count`, creates no relationship, exposes no
--     `declared_context`, and grants no consent of any kind. The invitation
--     (when one exists) keeps its own capability-token acceptance path.
--     Returns only {outcome}; it never says whether an invitation row exists
--     (no existence oracle for a 12-hex reference).
--
--   external_referral_observed_signups_v1(source, references[])  [service_role]
--     Per reference: first_observed_at and the number of accounts. NEVER the
--     account id, e-mail or name.
--
-- BOUNDS. At most 3 distinct references per account (a forged link can attach
-- an account to a reference, so the table must not become a write sink);
-- bounded shapes for slug and reference.
--
-- Zero DML at apply time. No existing object is changed.
-- Rollback: supabase/rollbacks/20261006100000_external_referral_signup_observation_v1.down.sql

begin;

create or replace function public.record_external_referral_signup_v1(
  p_source_slug text,
  p_reference   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv uuid;
begin
  if v_uid is null then
    return jsonb_build_object('outcome', 'not_authenticated');
  end if;
  if p_source_slug is null or p_source_slug !~ '^[a-z0-9_-]{2,40}$' then
    return jsonb_build_object('outcome', 'invalid_source');
  end if;
  if p_reference is null or p_reference !~ '^[A-Za-z0-9_-]{1,120}$' then
    return jsonb_build_object('outcome', 'invalid_reference');
  end if;

  -- Serialise two concurrent renders for the same (account, reference).
  perform pg_advisory_xact_lock(
    hashtextextended(v_uid::text || ':' || p_source_slug || ':' || p_reference, 0));

  if exists (
    select 1 from public.audit_logs
     where actor_id = v_uid
       and action = 'external_referral_signup_observed'
       and payload->>'source' = p_source_slug
       and payload->>'reference' = p_reference
  ) then
    return jsonb_build_object('outcome', 'already_recorded');
  end if;

  if (select count(*) from public.audit_logs
       where actor_id = v_uid
         and action = 'external_referral_signup_observed') >= 3 then
    return jsonb_build_object('outcome', 'limit_reached');
  end if;

  -- The invitation row, when the source posted one. Absent is fine: the
  -- observation stands on (source, reference) alone and is joined later.
  select id into v_inv from public.invitations
   where external_source_slug = p_source_slug
     and external_reference = p_reference;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'external_referral_signup_observed', 'invitations', v_inv,
    jsonb_build_object(
      'source', p_source_slug,
      'reference', p_reference,
      'observed_via', 'campaign_link'));

  return jsonb_build_object('outcome', 'recorded');
end $$;

revoke all on function public.record_external_referral_signup_v1(text, text) from public;
revoke all on function public.record_external_referral_signup_v1(text, text) from anon;
grant execute on function public.record_external_referral_signup_v1(text, text) to authenticated;

create or replace function public.external_referral_observed_signups_v1(
  p_source_slug text,
  p_references  text[] default null
) returns table (
  reference         text,
  first_observed_at timestamptz,
  accounts          integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.payload->>'reference'          as reference,
         min(a.occurred_at)               as first_observed_at,
         count(distinct a.actor_id)::int  as accounts
    from public.audit_logs a
   where a.action = 'external_referral_signup_observed'
     and a.payload->>'source' = p_source_slug
     and (p_references is null or a.payload->>'reference' = any (p_references))
   group by a.payload->>'reference'
   order by min(a.occurred_at);
$$;

comment on function public.external_referral_observed_signups_v1(text, text[]) is
  'Which external references have a registered account, and since when. service_role only; never returns an account id, e-mail or name.';

revoke all on function public.external_referral_observed_signups_v1(text, text[]) from public;
revoke all on function public.external_referral_observed_signups_v1(text, text[]) from anon;
revoke all on function public.external_referral_observed_signups_v1(text, text[]) from authenticated;
grant execute on function public.external_referral_observed_signups_v1(text, text[]) to service_role;

commit;

-- ROLLBACK
-- See supabase/rollbacks/20261006100000_external_referral_signup_observation_v1.down.sql
