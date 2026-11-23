-- Public job sitemap — KEYSET paging (P0, 2026-11-03).
--
-- WHY: `list_public_vacancy_sitemap_v1(p_limit, p_offset)` pages by OFFSET.
-- A deep shard walks every earlier row: measured read-only on production
-- 2026-11-03, EXPLAIN (ANALYZE, TIMING OFF) for offset 52,000 = 4,168 ms
-- (117k index entries, 64k removed by the expiry filter, 28.5k heap fetches),
-- over anon's 3 s statement_timeout — 12 HTTP 500s in one morning. The same
-- page by keyset (`published_at <= cursor`) = 19 ms (414 buffers).
--
-- WHAT: ONE new read-only function with the SAME projection as v1 — `id` and
-- `last_modified` (the publisher's `published_at`) — and the SAME live-row
-- filter and ORDER BY. Only the paging differs: "the rows after this key"
-- instead of "skip N rows". v1 is NOT replaced or dropped; the app falls back
-- to it while this function is absent, so apply and rollback are independent
-- of deploys.
--
-- ORDER: published_at DESC, id ASC (published_at is NOT NULL on the table).
-- "After (p, i)" = published_at < p OR (published_at = p AND id > i). The
-- separate `published_at <= p` conjunct is what lets the planner SEEK the
-- existing index public_vacancies_active_board_cover_idx
-- (published_at DESC NULLS LAST, id) WHERE is_active instead of scanning from
-- the start; the two branches keep that a plain conjunct in the cached plan.
--
-- Class: RED (SECURITY DEFINER + GRANT). No table, column, policy, index or
-- row is touched. Rollback:
-- supabase/rollbacks/20261103150000_public_vacancy_sitemap_keyset_v1.down.sql.

create or replace function public.list_public_vacancy_sitemap_after_v1(
  p_after_published_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 1000
) returns table (
  id uuid,
  last_modified timestamptz
) language plpgsql security definer set search_path = public stable as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 50000);
begin
  if p_after_published_at is null then
    -- First page.
    return query
      select v.id, v.published_at
      from public.public_vacancies v
      where v.is_active
        and (v.expires_at is null or v.expires_at > now())
      order by v.published_at desc nulls last, v.id
      limit v_limit;
  else
    return query
      select v.id, v.published_at
      from public.public_vacancies v
      where v.is_active
        and (v.expires_at is null or v.expires_at > now())
        and v.published_at <= p_after_published_at
        and (
          v.published_at < p_after_published_at
          or v.id > coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      order by v.published_at desc nulls last, v.id
      limit v_limit;
  end if;
end;
$$;

comment on function public.list_public_vacancy_sitemap_after_v1(p_after_published_at timestamp with time zone, p_after_id uuid, p_limit integer) is
  'Public job sitemap, keyset paging: id + publication date of live ads after (published_at, id). Same projection and filter as list_public_vacancy_sitemap_v1.';

-- REVOKE FROM PUBLIC FIRST, then the same two roles as v1.
revoke execute on function public.list_public_vacancy_sitemap_after_v1(p_after_published_at timestamp with time zone, p_after_id uuid, p_limit integer) from public;
grant execute on function public.list_public_vacancy_sitemap_after_v1(p_after_published_at timestamp with time zone, p_after_id uuid, p_limit integer) to anon, authenticated;
