-- Retention BOUNDARY fixture. Ages are relative to now(), so the proof is not
-- pinned to a wall-clock date. Re-runnable.
delete from public.ai_runs;

insert into public.ai_runs
  (id, created_at, task_type, provider, model_alias, output_excerpt,
   route_reason, input_tokens, output_tokens, actual_cost_usd, estimated_cost_usd,
   data_categories_sent, schema_validation, request_context)
values
  -- 10 days old — well inside the horizon.
  ('11110000-0000-4000-8000-000000000010', now() - interval '10 days',
   'journal_recognition','anthropic','sonnet','KEEP-10d model output',
   'routed: default tier', 100, 20, 0.0012, 0.0010, '{locale,text}', 'passed', 'journal'),
  -- 89 days old — the last day the 90-day contract must preserve.
  ('11110000-0000-4000-8000-000000000089', now() - interval '89 days',
   'journal_recognition','anthropic','sonnet','KEEP-89d model output',
   'routed: default tier', 101, 21, 0.0013, 0.0011, '{locale,text}', 'passed', 'journal'),
  -- exactly 90 days old — the boundary itself.
  ('11110000-0000-4000-8000-000000000090', now() - interval '90 days',
   'journal_recognition','anthropic','sonnet','BOUNDARY-90d model output',
   'routed: default tier', 102, 22, 0.0014, 0.0012, '{locale,text}', 'passed', 'journal'),
  -- 91 days old — unambiguously eligible.
  ('11110000-0000-4000-8000-000000000091', now() - interval '91 days',
   'journal_recognition','anthropic','sonnet','REDACT-91d model output',
   'routed: default tier', 103, 23, 0.0015, 0.0013, '{locale,text}', 'passed', 'journal'),
  -- 400 days old — long past, and already NULL: idempotency must not count it.
  ('11110000-0000-4000-8000-000000000400', now() - interval '400 days',
   'journal_recognition','anthropic','sonnet', null,
   'routed: default tier', 104, 24, 0.0016, 0.0014, '{locale,text}', 'passed', 'journal');
