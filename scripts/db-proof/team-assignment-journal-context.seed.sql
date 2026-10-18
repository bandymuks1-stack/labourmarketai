-- Extra seed for team-assignment-journal-context.sh (runs AFTER team-assignment-canonical.seed.sql).
alter table public.organizations add column if not exists legal_name text;
alter table public.projects add column if not exists title text;
update public.projects set title = 'Project ' || right(id::text, 2);
-- A person-assigned (roster) worker, employee contexts the members need to journal,
-- a second task inside the work object, a stage, and stubs for the tables the
-- replaced functions touch only at runtime.
insert into public.profiles (id, active_role, full_name) values
  ('99999999-9999-9999-9999-999999999999','worker','Roster Person');
insert into public.workers (id, profile_id) values
  ('aaaa9999-0000-0000-0000-000000000009','99999999-9999-9999-9999-999999999999');
alter table public.project_worker_assignments add column if not exists ended_at timestamptz;
alter table public.project_worker_assignments add column if not exists assigned_at timestamptz default now();
insert into public.project_worker_assignments (project_id, worker_id, status) values
  ('99999999-0000-0000-0000-000000000001','aaaa9999-0000-0000-0000-000000000009','active');
-- Journal contexts: employee of the PROJECT org (A) for One, Two, Left Early, Roster Person;
-- One also has an unrelated org-B employee context.
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','active','employee','2026-02-01'),
  ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','active','employee','2026-02-01'),
  ('77777777-7777-7777-7777-777777777777','aaaaaaaa-0000-0000-0000-000000000001','active','employee','2026-02-01'),
  ('99999999-9999-9999-9999-999999999999','aaaaaaaa-0000-0000-0000-000000000001','active','employee','2026-02-01'),
  ('11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000002','active','employee','2026-02-01');
insert into public.work_tasks (id, project_id, object_id, title, created_by, status) values
  ('7a5c0000-0000-0000-0000-000000000003','99999999-0000-0000-0000-000000000001','0b1e0000-0000-0000-0000-000000000001','Task inside the object','33333333-3333-3333-3333-333333333333','todo');
-- Conversation tables: send_work_instruction_to_project touches them only on the authorised path.
create table public.conversations (id uuid primary key default gen_random_uuid(), subject text, kind text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.conversation_participants (conversation_id uuid, profile_id uuid, added_by uuid);
create table public.conversation_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid, author_id uuid, body text, is_instruction boolean, original_language text, translation_status text, project_id uuid);
create table public.journal_entry_metrics (entry_id uuid, metric_slug text, value_text text, value_numeric numeric, unit_slug text, source text);
grant execute on all functions in schema public to authenticated;
insert into public.project_stages (project_id, name, created_by) values
  ('99999999-0000-0000-0000-000000000001','Stage 1','33333333-3333-3333-3333-333333333333');
grant insert on public.journal_entries, public.journal_entry_metrics to authenticated;
