-- PROPOSAL ONLY — rollback for 20260724_assistant_transcript_v1.sql.
-- Reverses the assistant transcript v1 migration in dependency order. Safe to
-- run only if the owner has EXPORTED any transcripts they wish to keep first
-- (this is a destructive drop of the AI-control convenience log; it is NOT the
-- legal-evidence record — journal_entries is, and is untouched here).

begin;

drop function if exists public.erase_assistant_transcript(uuid);
drop function if exists public.export_assistant_transcript();
drop function if exists public.append_assistant_message(uuid, text, text, text, char, text, text, jsonb, text);

drop table if exists public.assistant_message_attachments;
drop table if exists public.assistant_messages;
drop table if exists public.assistant_conversations;

commit;
