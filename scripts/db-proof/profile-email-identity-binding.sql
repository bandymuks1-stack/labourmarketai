-- ============================================================================
-- PROFILE EMAIL IDENTITY BINDING — REAL per-role proof, fully rolled back.
--
-- One transaction against a LOCAL Supabase stack that ends with ROLLBACK, so
-- nothing persists: not the users it creates, not the migration it applies.
-- Every probe runs under `set local role authenticated` with a synthetic JWT
-- (request.jwt.claims), never as the superuser, so RLS and auth.jwt()
-- genuinely decide the result. Outcomes print as `PROOF: <step> => <result>`.
--
-- Two modes, selected with the psql variable `apply`:
--   apply=0   NEGATIVE CONTROL: the same probes with NO migration — the attack
--             must SUCCEED here, or the proof proves nothing.
--   apply=1   the migration (verbatim minus its own begin/commit lines, see the
--             wrapper) is executed INSIDE this transaction, then the probes run.
--
-- Run it through the wrapper only:
--   bash scripts/db-proof/profile-email-identity-binding.sh
-- It runs psql with --single-transaction and ON_ERROR_STOP, so an error on ANY
-- line rolls everything back; this file also ends with an explicit ROLLBACK.
--
-- Deviation from the sibling proofs (throwaway container + prelude): this one
-- needs the REAL auth.jwt(), handle_new_user, membership and invitation
-- functions, so it runs against the local stack. It refuses any non-private
-- server address. Never point it at production.
-- ============================================================================
\set ON_ERROR_STOP on

-- Docker-hosted local stacks report a private container address; a managed
-- production database never does. Refuse anything that is not RFC1918/loopback.
do $$
begin
  if inet_server_addr() is not null and not (
    inet_server_addr() << any (array['127.0.0.0/8','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']::inet[])
  ) then
    raise exception 'refusing to run: % is not a local stack address', inet_server_addr();
  end if;
end $$;

-- (psql --single-transaction opened the transaction; we ROLLBACK at the end)

-- fixed synthetic identities (v4-shaped, RFC-valid)
\set OWNER    '''9b0e0000-0000-4000-8000-000000000001'''
\set VICTIM   '''9b0e0000-0000-4000-8000-000000000002'''
\set ATTACKER '''9b0e0000-0000-4000-8000-000000000003'''
\set FUTURE   '''9b0e0000-0000-4000-8000-000000000004'''
\set ORG      '''9b0e0000-0000-4000-8000-0000000000a1'''
\set COMPANY  '''9b0e0000-0000-4000-8000-0000000000c1'''

-- ── seed (superuser; trigger handle_new_user creates profiles + workers) ────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  email_change_confirm_status, is_sso_user)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  crypt('password', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"worker","locale":"lt"}'::jsonb,
  '', '', '', '', '', '', '', '', 0, false
from (values
  (:OWNER::uuid,    'proof.owner@local.test'),
  (:VICTIM::uuid,   'proof.victim@local.test'),
  (:ATTACKER::uuid, 'proof.attacker@local.test')
) as u(id, email);

-- an organization the owner governs (membership_invite_v1 needs an ACTIVE owner membership;
-- the org-owner seed trigger may already have created it)
insert into public.organizations (id, owner_profile_id, organization_type, legal_name, display_name, country)
values (:ORG::uuid, :OWNER::uuid, 'company', 'Proof Org', 'Proof Org', 'LT');
insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
select :ORG::uuid, :OWNER::uuid, 'owner', 'active', 'proof', now()
where not exists (select 1 from public.company_memberships
                   where organization_id = :ORG::uuid and profile_id = :OWNER::uuid
                     and status in ('invited','active'));
-- a legacy company the owner owns (owns_company → invite/accept worker path)
insert into public.companies (id, profile_id, legal_name, country)
values (:COMPANY::uuid, :OWNER::uuid, 'Proof Company', 'LT');
-- a pending worker invitation addressed to the victim, and one to a FUTURE user
insert into public.company_worker_invitations (company_id, invited_email, status, inviter_profile_id)
values (:COMPANY::uuid, 'proof.victim@local.test', 'pending', :OWNER::uuid),
       (:COMPANY::uuid, 'proof.future@local.test', 'pending', :OWNER::uuid);

\if :apply
  \echo PROOF: mode => APPLY (migration executed inside this transaction)
  -- :migration_copy = the migration with its own `begin;`/`commit;` lines
  -- stripped by the wrapper. A nested COMMIT would end THIS transaction and
  -- persist everything — exactly what happened on the first run.
  \i :migration_copy
\else
  \echo PROOF: mode => NEGATIVE CONTROL (no migration)
\endif

-- helper: become a user (claims) for the rest of the current transaction
create or replace function pg_temp.become(p_uid uuid, p_email text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'email', p_email, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.email', p_email, true);
end $$;
-- and back to "no JWT" (service role / the auth service / cron): the claims set
-- above are transaction-local and survive `reset role`, so every superuser step
-- must drop them first — exactly as GoTrue's own session carries none.
create or replace function pg_temp.nobody() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.email', '', true);
end $$;

-- ── ATTACK 1: the attacker rewrites their own profiles.email to the victim's ─
set local role authenticated;
select pg_temp.become(:ATTACKER::uuid, 'proof.attacker@local.test');
do $$
begin
  update public.profiles set email = 'proof.victim@local.test' where id = auth.uid();
  raise notice 'PROOF: attack1 rewrite own profiles.email => ALLOWED (hole open)';
exception when insufficient_privilege then
  raise notice 'PROOF: attack1 rewrite own profiles.email => BLOCKED 42501';
end $$;
reset role;
select pg_temp.nobody();

-- did it land?  (superuser read)
select 'PROOF: attacker profiles.email now => ' || email as line
  from public.profiles where id = :ATTACKER::uuid;

-- ── ATTACK 2: the owner invites the victim; who receives the membership? ────
set local role authenticated;
select pg_temp.become(:OWNER::uuid, 'proof.owner@local.test');
select 'PROOF: owner membership_invite_v1(victim) => ' || public.membership_invite_v1(:ORG::uuid, 'proof.victim@local.test', 'member') as line;
reset role;
select pg_temp.nobody();
select 'PROOF: invited membership bound to => ' ||
  case profile_id when :VICTIM::uuid then 'VICTIM (correct)' when :ATTACKER::uuid then 'ATTACKER (captured)' else profile_id::text end as line
  from public.company_memberships where organization_id = :ORG::uuid and status = 'invited';

-- ── ATTACK 3: the attacker accepts the victim's worker invitation ───────────
set local role authenticated;
select pg_temp.become(:ATTACKER::uuid, 'proof.attacker@local.test');
select 'PROOF: attacker accept_company_worker_invitation => ' || public.accept_company_worker_invitation(:COMPANY::uuid) as line;
select 'PROOF: attacker can SEE victim invitation rows => ' || count(*)::text as line
  from public.company_worker_invitations where invited_email = 'proof.victim@local.test';
reset role;
select pg_temp.nobody();

-- ── LEGITIMATE: the victim accepts their own invitation ─────────────────────
set local role authenticated;
select pg_temp.become(:VICTIM::uuid, 'proof.victim@local.test');
select 'PROOF: victim accept_company_worker_invitation => ' || public.accept_company_worker_invitation(:COMPANY::uuid) as line;
select 'PROOF: victim can SEE own invitation rows => ' || count(*)::text as line
  from public.company_worker_invitations where invited_email = 'proof.victim@local.test';
reset role;
select pg_temp.nobody();

-- ── LEGITIMATE FUTURE USER: registers later, then claims the pending invite ──
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  email_change_confirm_status, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', :FUTURE::uuid, 'authenticated', 'authenticated',
  'proof.future@local.test', crypt('password', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"worker","locale":"lt"}'::jsonb,
  '', '', '', '', '', '', '', '', 0, false);
set local role authenticated;
select pg_temp.become(:FUTURE::uuid, 'proof.future@local.test');
select 'PROOF: future user accept_company_worker_invitation => ' || public.accept_company_worker_invitation(:COMPANY::uuid) as line;
reset role;
select pg_temp.nobody();

-- ── LEGITIMATE: a user may still write their OWN address (no-op rebinding) ──
set local role authenticated;
select pg_temp.become(:VICTIM::uuid, 'proof.victim@local.test');
do $$
begin
  update public.profiles set email = 'PROOF.Victim@local.test', locale = 'en' where id = auth.uid();
  raise notice 'PROOF: victim writes own address (case only) + locale => ALLOWED';
exception when insufficient_privilege then
  raise notice 'PROOF: victim writes own address (case only) + locale => BLOCKED (too strict!)';
end $$;
reset role;
select pg_temp.nobody();

-- ── service role / no JWT: untouched ────────────────────────────────────────
do $$
begin
  update public.profiles set email = 'proof.attacker@local.test' where id = '9b0e0000-0000-4000-8000-000000000003';
  raise notice 'PROOF: superuser/no-JWT write of profiles.email => ALLOWED (exempt as designed)';
end $$;

rollback;
\echo PROOF: transaction => ROLLED BACK (nothing persisted)
