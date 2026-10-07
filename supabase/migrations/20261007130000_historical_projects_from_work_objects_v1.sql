-- @human-gate-approved
-- Historical projects from imported sites (HP-1)  --  RED class, owner-channel apply only.
--
-- WHY THE ANNOTATION: this migration INSERTs rows into public.projects (one per
-- historical site) and UPDATEs public.work_objects.project_id. The line above is an
-- ACKNOWLEDGEMENT that migration-safety may pass CI. It is NOT an approval: the PR is
-- a DRAFT labelled needs-human-gate, and production apply waits for explicit owner
-- approval (docs/human-gates/historical-projects-from-sites-v1-gate.md).
--
-- WHAT: MASTER rule "a historical project/object becomes a Project" (decision 0020;
-- design docs/design/historical-timesheet-import-v3.md section 5.1). Each work_object that
--   (a) has at least one organization_evidence_records row, and
--   (b) has project_id IS NULL
-- gets ONE projects row; the object is then linked to it, so the project page's
-- historical-work section (readEvidenceForProject) finds the evidence.
--
-- FIELD VALUES (never invents a fact):
--   title              = work_objects.name (only when 2..200 chars after trim)
--   company_id         = organizations.legacy_company_id (hist_p9 requires the match)
--   organization_id    = work_objects.organization_id
--   country / city     = copied from the object only when present (country is
--                        trimmed; empty string -> NULL). No dates, no responsible
--                        person, no assignments, no tasks, no clients.
--   status             = 'completed' (owner decision; design L1052)
--   historical_key     = 'hp:v1:wo:' || work_object_id
--                        DEVIATION from the design's 'hp:v1:<customer_key>|<work_object_id>'
--                        form: no customer is resolved for these sites, so there is no
--                        customer_key to put in. The 'hp:v1:wo:' prefix is distinct from
--                        the design form, so a later customer-keyed import can never
--                        collide with, nor be silently merged into, these rows.
--   created_session_id = session of the object's EARLIEST evidence record
--                        (order by created_at, id)  -> satisfies
--                        projects_historical_requires_session and the composite FK.
--
-- IDEMPOTENT: INSERT ... ON CONFLICT (organization_id, historical_key)
-- WHERE historical_key IS NOT NULL DO NOTHING; the link statement joins on
-- historical_key and only touches rows with project_id IS NULL, so a re-run
-- (or a run after a partial earlier one) completes the linking and changes nothing else.
-- ADDITIVE: no DROP, no policy change, no existing row modified except the
-- NULL -> value project_id link. Runs as the migration owner (RLS bypass); hist_p9
-- restrictive policies are satisfied by construction (company matches the org).
-- Side effects: projects has only the set_updated_at trigger; journal autolink is
-- write-time via assignments, so no journal/hours/counter effect.
-- ROLLBACK: supabase/rollbacks/20261007130000_historical_projects_from_work_objects_v1.down.sql

begin;

insert into public.projects
  (company_id, organization_id, title, country, city, status, historical_key, created_session_id)
select
  o.legacy_company_id,
  wo.organization_id,
  btrim(wo.name),
  nullif(btrim(wo.country), ''),
  nullif(btrim(wo.city), ''),
  'completed',
  'hp:v1:wo:' || wo.id::text,
  ev.session_id
from public.work_objects wo
join public.organizations o on o.id = wo.organization_id
join lateral (
  select r.session_id
  from public.organization_evidence_records r
  where r.work_object_id = wo.id
  order by r.created_at, r.id
  limit 1
) ev on true
where wo.project_id is null
  and o.legacy_company_id is not null
  and char_length(btrim(wo.name)) between 2 and 200
on conflict (organization_id, historical_key) where historical_key is not null do nothing;

update public.work_objects wo
set project_id = p.id
from public.projects p
where p.organization_id = wo.organization_id
  and p.historical_key = 'hp:v1:wo:' || wo.id::text
  and wo.project_id is null;

commit;
