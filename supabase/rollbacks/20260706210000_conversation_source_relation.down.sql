-- Rollback for 20260706210000_conversation_source_relation.sql
--
-- Drops the SECURITY DEFINER reader RPC and the two nullable columns the up
-- migration added to public.conversations. The columns are NEW and NULLABLE:
-- dropping them loses ONLY the new source-relation stamps (source_type /
-- source_id written after the migration was applied) — every pre-existing
-- conversation field (subject, kind, created_by, timestamps) is untouched,
-- and no other table is affected.
--
-- Rollback is safe at any time: the app already handles the absent RPC
-- (42883 → empty context map) and the absent columns (42703 → plain insert
-- fallback), so dropping both returns the product to exactly the current
-- neutral-label behaviour with no errors and no fake state.

begin;

drop function if exists public.conversation_source_context(uuid[]);

alter table public.conversations
  drop column if exists source_type,
  drop column if exists source_id;

commit;
