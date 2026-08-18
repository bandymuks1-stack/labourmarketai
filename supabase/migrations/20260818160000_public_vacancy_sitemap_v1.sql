-- @human-gate-approved
-- Public vacancy SITEMAP projection v1 — the crawler-discovery half of the
-- public job board.
--
-- WHY THIS EXISTS
-- `20260818140000_public_vacancy_preview_v1` opened the anonymous READ path and
-- shipped `/jobs` + `/jobs/[id]`. Both are live in production. But nothing ever
-- told a search engine those pages exist:
--
--   * `/jobs` is absent from `app/sitemap.ts`;
--   * no sitemap lists any `/jobs/[id]` URL;
--   * the only internal link to a job page is the card ON the board itself.
--
-- So 39,241 live public pages (measured 2026-08-18) are ORPHANED: a crawler that
-- reaches the homepage has no path to any of them, and the board's own
-- pagination is ~1,963 hops deep, far past any realistic crawl depth. The
-- acquisition asset was made publicly readable and still produced zero organic
-- discovery. This migration supplies the one thing the sitemap route needs.
--
-- WHY A SEPARATE FUNCTION RATHER THAN REUSING THE SEARCH FUNCTION
-- `search_public_vacancy_previews_v1` is hard-capped at 50 rows per call by
-- design (anti-scrape). Paging 39,241 ids through it would take 785 round trips
-- per sitemap render. This function returns the TWO fields a sitemap may
-- contain and nothing else, so it is strictly NARROWER than the projection the
-- owner already approved — it cannot disclose a field the preview functions do
-- not already return, because it does not select one.
--
-- RETURNS: `id` (already public — it IS the public URL) and `last_modified`.
-- It returns NO title, NO employer, NO location, NO compensation, NO
-- description, NO application URL. A sitemap needs a URL and a date; anything
-- more would be a leak with no purpose.
--
-- WHY `published_at` AND NOT `updated_at` / `last_seen_at` — THIS IS THE POINT
-- Measured in production 2026-08-18 across the 39,241 live rows:
--   `updated_at`   → 6 distinct days
--   `last_seen_at` → 6 distinct days
--   `published_at` → 197 distinct days
-- `updated_at` and `last_seen_at` are INGESTION timestamps: they move when the
-- importer re-reads an ad, not when the ad changes. Publishing either as
-- <lastmod> would tell Google that all 39,241 pages changed on the same six
-- days — a false freshness claim about content that did not change, and exactly
-- the kind of fabricated signal axiom A-12 forbids. `published_at` is the
-- publisher's own date and is the only honest <lastmod> available.
--
-- LIVENESS matches the sibling functions exactly: `is_active` AND not expired,
-- so a withdrawn or expired ad is never advertised to a crawler. ORDER matches
-- the board (`published_at desc nulls last, id`) so shard paging is stable and
-- a row cannot be skipped or duplicated across shard boundaries.
--
-- RED class (SECURITY DEFINER + GRANT to anon). ZERO tables, columns, policies,
-- triggers or indexes created; ZERO existing objects modified; ZERO DML.
-- Rollback: supabase/rollbacks/20260818160000_public_vacancy_sitemap_v1.down.sql

create or replace function public.list_public_vacancy_sitemap_v1(
  p_limit integer default 5000,
  p_offset integer default 0
) returns table (
  id uuid,
  last_modified timestamptz
) language sql security definer set search_path = public stable as $$
  select
    v.id,
    -- Honest publication date only. Never an ingestion timestamp (see header).
    v.published_at
  from public.public_vacancies v
  where v.is_active
    and (v.expires_at is null or v.expires_at > now())
  order by v.published_at desc nulls last, v.id
  -- 50,000 is the sitemaps.org per-file ceiling; the route shards well below it.
  limit least(greatest(coalesce(p_limit, 5000), 1), 50000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- REVOKE FROM PUBLIC FIRST — a bare grant leaves the default PUBLIC EXECUTE in
-- place, which is the exact idiom behind the 2026-07-22 P0.
revoke execute on function public.list_public_vacancy_sitemap_v1(p_limit integer, p_offset integer) from public;
grant execute on function public.list_public_vacancy_sitemap_v1(p_limit integer, p_offset integer) to anon, authenticated;
