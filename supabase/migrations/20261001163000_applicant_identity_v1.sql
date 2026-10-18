-- ============================================================================
-- DRAFT - needs-human-gate - DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20261001163000 - applicant_identity_v1 (an application submitted TO an
-- employer shows the applicant's name and photo to THAT employer, only).
--
-- PROBLEM. The employer who receives a worker's application (a
-- demand_interest_signals row on the employer's own demand) reads an
-- anonymized handle ("Kandidatas 2B7213"). The owner's order (2026-10-01):
-- an application submitted to an employer is a lawful basis for that employer
-- to see WHO is applying - name and photo - not an anonymized text box.
-- Today nothing in the database lets the demand owner read the applicant's
-- display name through a defined path, and `worker_avatar_path_v1` (D1)
-- deliberately excludes this relationship (company roster / agency roster /
-- active engagement / active assignment only).
--
-- WHAT THIS ADDS. ONE read-only SECURITY DEFINER function:
--   applicant_identity_v1(p_request_id uuid, p_worker_id uuid)
--     returns (display_name text, avatar_path text)
-- A row comes back ONLY when ALL hold:
--   * the caller is authenticated and OWNS the demand
--     (customer_requests.profile_id = auth.uid());
--   * the worker has a demand_interest_signals row on THAT demand whose status
--     is interested / reviewed / contacted - i.e. NOT withdrawn. Withdrawing
--     the application withdraws the identity with it, at once;
-- otherwise ZERO rows (indistinguishable from a nonexistent pair - no
-- existence oracle).
-- It returns the worker's display_name and the avatar PATH (never the image,
-- never e-mail, phone or any other column); the path is returned only when it
-- lies in the worker's own `<profile_id>/` folder. The server then signs that
-- one path for one hour, exactly as for D1.
--
-- WHAT THIS DOES NOT DO. No table grant, no storage policy, no RLS policy
-- change; contact details (phone, e-mail) stay behind the existing
-- contact-disclosure request the worker answers; discovery-only viewers and
-- other employers gain nothing; anon cannot call it.
--
-- OWNER DECISION REQUIRED (consent semantics): applying = consenting that
-- THIS employer sees name + photo. The express-interest control must say so
-- (copy shipped in the same PR, scouting.identity / opportunities copy).
--
-- Rollback: supabase/rollbacks/20261001163000_applicant_identity_v1.down.sql
--
-- @human-gate-approved - TIER: owner-gated (SECURITY DEFINER function +
-- EXECUTE grant = RED-class). The annotation downgrades the CI finding only;
-- the owner applies this manually via Supabase MCP apply_migration.
--
-- POST-APPLY VERIFICATION (rolled-back transaction):
--   As the demand owner, applicant with status interested: 1 row.
--   Same pair after the worker withdraws: 0 rows.
--   As a different employer account: 0 rows.
--   As the worker, as another worker, as anon: 0 rows / permission denied.
-- ============================================================================

begin;

create or replace function public.applicant_identity_v1(
  p_request_id uuid,
  p_worker_id  uuid
) returns table(
  display_name text,
  avatar_path  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  return query
  select
    nullif(btrim(w.display_name), '') as display_name,
    case
      when p.avatar_url is not null
       and p.avatar_url like p.id::text || '/%'
        then p.avatar_url
      else null
    end as avatar_path
  from public.demand_interest_signals s
  join public.customer_requests cr on cr.id = s.request_id
  join public.workers w on w.id = s.worker_id
  left join public.profiles p on p.id = w.profile_id
  where s.request_id = p_request_id
    and s.worker_id = p_worker_id
    and s.status in ('interested', 'reviewed', 'contacted')
    and cr.profile_id is not distinct from uid;
end $$;

comment on function public.applicant_identity_v1(uuid, uuid) is
  'An application submitted TO an employer shows the applicant''s display name and photo PATH to the demand owner only, while the application is not withdrawn. Read-only; no contact details; zero rows for everyone else (no existence oracle).';

revoke all on function public.applicant_identity_v1(uuid, uuid) from public;
revoke execute on function public.applicant_identity_v1(uuid, uuid) from anon;
grant execute on function public.applicant_identity_v1(uuid, uuid) to authenticated;

commit;

-- DOWN (paired rollback file):
--   drop function if exists public.applicant_identity_v1(uuid, uuid);
