-- ROLLBACK for 20261007100000_evidence_record_media_link_v1.sql
--
-- Drops the one table that migration added. Guarded: refuses while any media
-- row exists, because those rows are the only record of which photo belongs to
-- which evidence record / place / person (git cannot restore them). If rows
-- exist, export them first and decide deliberately. Apply via Supabase MCP
-- `apply_migration` only - never `supabase db push`.

do $rb$
begin
  if to_regclass('public.organization_evidence_media') is not null
     and exists (select 1 from public.organization_evidence_media) then
    raise exception 'organization_evidence_media holds rows; refusing to drop (export first)'
      using errcode = '55000';
  end if;
end
$rb$;

drop policy if exists organization_evidence_media_insert on public.organization_evidence_media;
drop policy if exists organization_evidence_media_select on public.organization_evidence_media;
drop table if exists public.organization_evidence_media;
