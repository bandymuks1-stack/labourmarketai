-- @human-gate-approved
-- 20261006100500_invitation_signup_context_v1
--
-- RISK ACKNOWLEDGEMENT, NOT AN APPROVAL. NOT APPLIED to any database.
-- Draft + needs-human-gate. Apply only via Supabase MCP apply_migration after
-- explicit owner approval, AFTER 20261003151000 and 20261003151100.
--
-- WHY. Owner decision 2026-10-06 (frictionless addressed invite): a person who
-- arrives through an ADDRESSED invitation link must not retype the e-mail the
-- invitation already names. The signup page therefore needs that one fact,
-- server-side, from the token. No existing function returns it (the public
-- preview deliberately returns NO addressee).
--
-- WHAT. One read-only SECURITY DEFINER function, executable by service_role
-- ONLY (the same ACL and the same pattern as get_invitation_public_preview_v1:
-- the signup page reads it through the admin client; anon / authenticated get
-- nothing, so it cannot become a lookup oracle from a browser). It answers only
-- for an invitation that is still usable (pending, not expired, not revoked,
-- uses left) and addressed; every other state answers a bare outcome with NO
-- address. The token (256-bit, unguessable) is the only input.
--
-- LEAK TRADE-OFF (accepted by design, named here): whoever holds a usable
-- addressed link learns the address it was sent to. The link is the
-- capability the invitee was sent; a forwarded link therefore shows the
-- forwarder's recipient to the forwardee. It does NOT widen acceptance: the
-- email binding (151100) still refuses any session whose JWT email differs.
--
-- It writes nothing (no open_count bump: the landing page's preview does that).
--
-- ROLLBACK: supabase/rollbacks/20261006100500_invitation_signup_context_v1.down.sql

begin;

create or replace function public.get_invitation_signup_context_v1(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_row public.invitations%rowtype;
begin
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_row.status <> 'pending'
     or v_row.revoked_at is not null
     or v_row.expires_at <= now()
     or v_row.use_count >= v_row.max_uses then
    return jsonb_build_object('outcome', 'not_available');
  end if;
  if v_row.invited_email is null then
    return jsonb_build_object('outcome', 'open_link');
  end if;
  return jsonb_build_object(
    'outcome', 'addressed',
    'invited_email', v_row.invited_email,
    'invitation_type', v_row.invitation_type,
    'external_source_slug', v_row.external_source_slug
  );
end $$;

revoke all on function public.get_invitation_signup_context_v1(text) from public, anon, authenticated;
grant execute on function public.get_invitation_signup_context_v1(text) to service_role;

commit;
