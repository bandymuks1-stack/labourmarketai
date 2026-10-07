-- ai_runs retention classes v2 — scratch PostgreSQL proof.
-- Runs the REAL migrations verbatim: ai_runs_audit_v1, ai_runs_retention_redaction_v1
-- (the applied baseline), then 20261003150800 (the change under proof).
-- Each probe prints `PROOF <label> : PASS|FAIL`. A FAIL is a real failure.
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

\ir ai-runs-retention-classes.prelude.sql
\ir ../../supabase/migrations/20260714150000_ai_runs_audit_v1.sql
\ir ../../supabase/migrations/20260808130000_ai_runs_retention_redaction_v1.sql

create or replace function public.say(label text, ok boolean) returns void language plpgsql as
$$ begin raise notice 'PROOF % : %', label, case when ok then 'PASS' else 'FAIL' end; end $$;

insert into public.profiles values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.ai_runs (id, created_at, task_type, provider, model_alias, tier, schema_validation,
  human_review_state, prompt_version, confidence, input_source, request_context,
  estimated_cost_usd, actual_cost_usd, output_excerpt, profile_id)
values
 ('00000000-0000-4000-8000-000000000001', now()-interval '200 days','translate_message','gemini','m','low','passed','not_required','v1','high','conversation_message','translation_copy',0.01,0.02,'old text','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('00000000-0000-4000-8000-000000000002', now()-interval '91 days','extract_cv','gemini','m','low','passed','pending','v2','med','cv','worker_profile',0.03,0.04,'cv structured','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('00000000-0000-4000-8000-000000000003', now()-interval '89 days','translate_message','gemini','m','low','passed','not_required','v1','high','conversation_message','translation_copy',0.05,0.06,'fresh text','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('00000000-0000-4000-8000-000000000004', now()-interval '300 days','explain_match','none','none','det','skipped','not_required',null,null,null,'matching_explanation',null,null,null,null);

-- ============ NEGATIVE CONTROL: the applied baseline ============
select public.redact_expired_ai_run_content() as baseline_swept;
select public.say('BASELINE content aged out (no old row keeps AI content)',
  (select count(output_excerpt) from public.ai_runs where created_at < now()-interval '90 days') = 0);
select public.say('BASELINE subject linkage SURVIVES past horizon (the defect)',
  (select count(profile_id) from public.ai_runs where created_at < now()-interval '90 days') = 2);

-- snapshot retained columns before the change, to prove they never move
create temp table before_retained as
  select id, created_at, task_type, provider, model_alias, model_id, tier, route_reason, locale,
         input_source, data_categories_sent, request_context, blocked_reason, fallback_applied,
         fallback_reason, escalation_applied, estimated_cost_usd, actual_cost_usd, input_tokens,
         output_tokens, latency_ms, prompt_version, schema_validation, confidence, human_review_state
    from public.ai_runs;

-- ============ APPLY THE REAL MIGRATION ============
\ir ../../supabase/migrations/20261003150800_ai_runs_retention_classes_v2.sql

-- registry completeness: every live column is classified exactly once
select public.say('policy classifies EVERY ai_runs column exactly once',
  (select count(*) from information_schema.columns where table_schema='public' and table_name='ai_runs')
    = (select count(distinct column_name) from public.ai_runs_retention_policy())
  and not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='ai_runs'
                   and not exists (select 1 from public.ai_runs_retention_policy() p where p.column_name=c.column_name))
  and (select count(*) from public.ai_runs_retention_policy()) = (select count(distinct column_name) from public.ai_runs_retention_policy()));
select public.say('four classes only',
  (select array_agg(distinct retention_class order by retention_class) from public.ai_runs_retention_policy())
   = array['ai_content','evidence_provenance','security_audit','subject_linkage']);

-- sweep now de-links the aged rows; the 89-day row is untouched
select public.redact_expired_ai_run_content() as v2_swept_first;
select public.say('V2 aged rows de-linked',
  (select count(profile_id) from public.ai_runs where created_at < now()-interval '90 days') = 0);
select public.say('V2 fresh row keeps content AND link (within horizon)',
  (select output_excerpt is not null and profile_id is not null from public.ai_runs where id='00000000-0000-4000-8000-000000000003'));
select public.say('V2 no row deleted', (select count(*) from public.ai_runs) = 4);
select public.say('V2 sweep is idempotent (second run changes 0 rows)', public.redact_expired_ai_run_content() = 0);
select public.say('V2 security_audit + evidence_provenance columns byte-identical after sweep',
  not exists (
    select 1 from before_retained b join public.ai_runs r using (id)
     where (b.created_at, b.task_type, b.provider, b.model_alias, b.tier, b.input_source, b.request_context,
            b.estimated_cost_usd, b.actual_cost_usd, b.prompt_version, b.schema_validation, b.confidence, b.human_review_state)
           is distinct from
           (r.created_at, r.task_type, r.provider, r.model_alias, r.tier, r.input_source, r.request_context,
            r.estimated_cost_usd, r.actual_cost_usd, r.prompt_version, r.schema_validation, r.confidence, r.human_review_state)));
select public.say('V2 human_review_state pending survives on the delinked cv row',
  (select human_review_state='pending' and prompt_version='v2' from public.ai_runs where id='00000000-0000-4000-8000-000000000002'));
select public.say('V2 cost aggregate preserved (D2)',
  (select round(sum(actual_cost_usd),2) from public.ai_runs) = 0.12);

-- floor: a caller may not shorten the horizon
do $$ begin
  perform public.redact_expired_ai_run_content(30);
  perform public.say('V2 horizon floor refuses 30 days', false);
exception when sqlstate '22023' then perform public.say('V2 horizon floor refuses 30 days', true);
end $$;
select public.say('V2 horizon may be lengthened (365 d redacts the 200 d row only, already done -> 0)',
  public.redact_expired_ai_run_content(365) = 0);

-- trigger: retained classes are immutable even for the table owner
do $$ begin
  update public.ai_runs set actual_cost_usd = 0 where id='00000000-0000-4000-8000-000000000003';
  perform public.say('TRIGGER blocks rewriting a security_audit column', false);
exception when sqlstate '23514' then perform public.say('TRIGGER blocks rewriting a security_audit column', true);
end $$;
do $$ begin
  update public.ai_runs set human_review_state='approved' where id='00000000-0000-4000-8000-000000000002';
  perform public.say('TRIGGER blocks rewriting evidence provenance', false);
exception when sqlstate '23514' then perform public.say('TRIGGER blocks rewriting evidence provenance', true);
end $$;
do $$ begin
  update public.ai_runs set output_excerpt='forged' where id='00000000-0000-4000-8000-000000000003';
  perform public.say('TRIGGER blocks rewriting AI content (only NULL allowed)', false);
exception when sqlstate '23514' then perform public.say('TRIGGER blocks rewriting AI content (only NULL allowed)', true);
end $$;
do $$ begin
  update public.ai_runs set profile_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='00000000-0000-4000-8000-000000000003';
  perform public.say('TRIGGER blocks re-pointing the subject', false);
exception when sqlstate '23514' then perform public.say('TRIGGER blocks re-pointing the subject', true);
end $$;
update public.ai_runs set output_excerpt=null, profile_id=null where id='00000000-0000-4000-8000-000000000003';
select public.say('TRIGGER allows redacting both redactable columns to NULL',
  (select output_excerpt is null and profile_id is null from public.ai_runs where id='00000000-0000-4000-8000-000000000003'));

-- profiles FK ON DELETE SET NULL (an UPDATE) must still work under the trigger
insert into public.ai_runs (id, task_type, provider, model_alias, schema_validation, profile_id)
values ('00000000-0000-4000-8000-000000000005','x','p','m','skipped','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
delete from public.profiles where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select public.say('FK profile deletion still de-links through the trigger',
  (select profile_id is null from public.ai_runs where id='00000000-0000-4000-8000-000000000005'));

-- erasure path
insert into public.ai_runs (id, task_type, provider, model_alias, schema_validation, profile_id, output_excerpt)
values ('00000000-0000-4000-8000-000000000006','x','p','m','skipped','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','recent subject text'),
       ('00000000-0000-4000-8000-000000000007','x','p','m','skipped',null,'someone elses text');
select public.ai_runs_delink_subject('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') as erased_rows;
select public.say('ERASURE delinks + clears content for ONE subject only',
  (select output_excerpt is null and profile_id is null from public.ai_runs where id='00000000-0000-4000-8000-000000000006')
  and (select output_excerpt = 'someone elses text' from public.ai_runs where id='00000000-0000-4000-8000-000000000007'));
select public.say('ERASURE is idempotent', public.ai_runs_delink_subject('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0);
select public.say('ERASURE keeps the audit row', (select count(*) from public.ai_runs where id='00000000-0000-4000-8000-000000000006') = 1);

-- export: own linked rows only, metadata only
insert into public.profiles values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.ai_runs (id, task_type, provider, model_alias, schema_validation, profile_id, output_excerpt, route_reason)
values ('00000000-0000-4000-8000-000000000008','t','p','m','passed','cccccccc-cccc-4ccc-8ccc-cccccccccccc','SECRET CONTENT','free text reason');
set app.uid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select public.say('EXPORT returns exactly the caller''s linked run',
  (select count(*) from public.privacy_export_ai_runs_subject_v1()) = 1);
select public.say('EXPORT never carries output_excerpt or route_reason',
  not exists (select 1 from public.privacy_export_ai_runs_subject_v1() j
               where j ? 'output_excerpt' or j ? 'route_reason' or j::text like '%SECRET%'));
set app.uid = '';
select public.say('EXPORT is empty with no auth.uid()', (select count(*) from public.privacy_export_ai_runs_subject_v1()) = 0);
set app.uid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select public.say('EXPORT is empty for a different subject', (select count(*) from public.privacy_export_ai_runs_subject_v1()) = 0);

-- grants (privileges as the roles would see them)
select public.say('grants: delink + sweep service_role only; export authenticated only',
  has_function_privilege('service_role','public.ai_runs_delink_subject(uuid)','execute')
  and not has_function_privilege('authenticated','public.ai_runs_delink_subject(uuid)','execute')
  and not has_function_privilege('anon','public.ai_runs_delink_subject(uuid)','execute')
  and has_function_privilege('service_role','public.redact_expired_ai_run_content(integer)','execute')
  and not has_function_privilege('authenticated','public.redact_expired_ai_run_content(integer)','execute')
  and has_function_privilege('authenticated','public.privacy_export_ai_runs_subject_v1()','execute')
  and not has_function_privilege('anon','public.privacy_export_ai_runs_subject_v1()','execute'));
select public.say('grants: no UPDATE/DELETE on ai_runs for any app role',
  not has_table_privilege('authenticated','public.ai_runs','update') and not has_table_privilege('service_role','public.ai_runs','update')
  and not has_table_privilege('service_role','public.ai_runs','delete') and not has_table_privilege('anon','public.ai_runs','select'));

-- rollback restores the live function and leaves rows alone
\ir ../../supabase/rollbacks/20261003150800_ai_runs_retention_classes_v2.down.sql
select public.say('ROLLBACK removes trigger + new functions',
  not exists (select 1 from pg_trigger where tgname='ai_runs_enforce_retention_classes')
  and to_regprocedure('public.ai_runs_retention_policy()') is null
  and to_regprocedure('public.ai_runs_delink_subject(uuid)') is null);
select public.say('ROLLBACK restores the one-column sweep (profile_id no longer touched)',
  (select prosrc not like '%profile_id%' from pg_proc where proname='redact_expired_ai_run_content'));
