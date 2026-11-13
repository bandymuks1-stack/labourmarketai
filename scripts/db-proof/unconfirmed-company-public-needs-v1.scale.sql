-- ============================================================================
-- SCALE FIXTURE for the V-1 proof (R2 P2: "5,000 published needs among 50,000
-- rows, anonymous call under 1 s"). Run by unconfirmed-company-public-needs-v1.sh
-- after the functional checks, then removed. Adversarial on purpose:
--   * 4,000 unconfirmed organizations, 11 needs each (44,000), ONE published each;
--   * one burst organization with 6,000 needs, 1,000 of them published in the
--     last hour — the MOST RECENT publications, nearly all held for 'rate', so a
--     reader that stops at the first 50 admitted needs must walk past them;
--   * 200 published needs share one summary (duplicates, held after the first).
-- Totals: 50,000 needs, 5,000 published.
-- ============================================================================
insert into public.profiles(id)
  select ('c0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid from generate_series(1, 4001) g;
insert into auth.users(id, email)
  select ('c0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 's' || g || '@firma.lt' from generate_series(1, 4001) g;
insert into public.companies(id, profile_id, display_name, country, verification_status)
  select ('d0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
         ('c0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
         'Scale Org ' || g, 'LT', 'active_unverified' from generate_series(1, 4001) g;
insert into public.organizations(id, display_name, legacy_company_id)
  select ('e0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'Scale Org ' || g,
         ('d0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid from generate_series(1, 4001) g;
-- 44,000 needs of 4,000 organizations; need 1 of each is published one day ago + g seconds.
insert into public.customer_requests(profile_id, organization_id, title, role_or_work_type, country, location,
                                     need_summary, status, kind, created_at)
  select ('c0000000-0000-4000-8000-' || lpad(to_hex(o), 12, '0'))::uuid,
         ('e0000000-0000-4000-8000-' || lpad(to_hex(o), 12, '0'))::uuid,
         'scale ' || o || '/' || n, case when o % 3 = 0 then 'electrician' else 'helper' end, 'LT', 'Utena',
         case when n = 1 and o <= 200 then 'Identical copied summary of a warehouse job that many posted'
              else 'Scale need ' || o || '/' || n || ' with enough distinct text to compare' end,
         'submitted', 'company_request',
         -- distinct times (no ties), so "newest 100" has exactly one answer to compare against
         now() - interval '2 days' + (o || ' seconds')::interval + (n || ' milliseconds')::interval
    from generate_series(1, 4000) o, generate_series(1, 11) n;
-- The burst organization (4001): 6,000 needs, created and published in the last hour.
insert into public.customer_requests(profile_id, organization_id, title, role_or_work_type, country, location,
                                     need_summary, status, kind, created_at)
  select 'c0000000-0000-4000-8000-000000000fa1'::uuid, 'e0000000-0000-4000-8000-000000000fa1'::uuid,
         'scale burst/' || n, 'helper', 'LT', 'Utena',
         'Burst need ' || n || ' with enough distinct text to compare here', 'submitted', 'company_request',
         now() - interval '1 hour' + (n || ' milliseconds')::interval
    from generate_series(1, 6000) n;
insert into public.customer_request_publications(request_id, action, actor_id, created_at)
  select cr.id, 'publish', cr.profile_id, now() - interval '1 day' + (row_number() over (order by cr.title) || ' seconds')::interval
    from public.customer_requests cr where cr.title like 'scale %/1' and cr.title not like 'scale burst/%';
insert into public.customer_request_publications(request_id, action, actor_id, created_at)
  select cr.id, 'publish', cr.profile_id, now() - interval '30 minutes' + (row_number() over (order by cr.title) || ' milliseconds')::interval
    from public.customer_requests cr where cr.title like 'scale burst/%'
   order by cr.title limit 1000;
analyze;
