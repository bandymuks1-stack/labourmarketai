-- ============================================================================
-- DRAFT — needs owner apply — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner review (Workstream
-- B / feat/cc/conversations-ui). Never `db push`.
--
-- Doctrine §2.3 gap-fix on the canonical messaging table: user-authored
-- messages must carry the author's language so viewers can later get
-- translation-on-read (translations NEVER stored — §2.2). Additive only:
-- nullable column (historical rows stay NULL = language unknown, shown
-- honestly as the original text without a badge). The send path stamps the
-- author's locale once this is applied and degrades gracefully until then.
-- ============================================================================

begin;

alter table public.conversation_messages
  add column if not exists original_language char(2)
  check (original_language is null
         or original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl'));

commit;

-- ROLLBACK (reverse SQL):
-- alter table public.conversation_messages drop column if exists original_language;
