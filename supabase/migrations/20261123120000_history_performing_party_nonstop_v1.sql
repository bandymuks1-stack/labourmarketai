-- @human-gate-approved
-- ============================================================================
-- 20261123120000_history_performing_party_nonstop_v1
-- RED: a data-ownership statement about historical work. DRAFT + needs-human-gate.
-- NOT APPLIED. Applied ONLY after the owner approves this exact file, through
-- Supabase MCP `apply_migration`. Never `supabase db push`.
--
-- OWNER DECISION (2026-11-23, relayed by the coordinator; the uuid list is being
-- confirmed by the owner): the historical work of 8 roster people of
-- 19f47e78 'Labour market ai Sp. z o.o' belongs to UAB „Nonstop Group“
-- (20b2c802). The country of work is not a criterion. The basis recorded here is
-- the owner's statement and the confirmed uuid list, nothing else.
--
-- MECHANISM: the canonical one, `organization_evidence_parties`, exactly as
-- `attributeRecordsToPerformingOrganization` (lib/organization-evidence/import-core.ts)
-- and the product's performing-company panel write it. One party row per record:
-- party_role 'employer', party_organization_id 20b2c802, party_label NULL (so the
-- platform name is shown; a label would replace it). Nothing else is written.
--
-- WHY NOT A MOVE. A record's organization is part of its identity: records are
-- INSERT-only and hash-chained per import session, and a correction can never
-- change the person, the supplier or the session (record-correction.ts).
-- Re-owning the records would mean copies in 20b2c802 plus withdrawals in
-- 19f47e78: a second store of the same work, a broken session provenance, and
-- the person linked to a worker account (b154ab88) would lose that link, because
-- a new roster row can only be created unlinked and only the person can link it.
-- The party row gives 20b2c802 what the owner asked for without any of that:
--   · 20b2c802's managers READ these records (records SELECT policy: a managed
--     party organization), and its company work history lists them
--     (company-work-history-read.ts, "attributed here");
--   · the person's own history names 20b2c802 as the employer of that work;
--   · no record, hash, fingerprint, event, attestation, session, roster row,
--     work object or project is written or changed;
--   · `employer` grants no verification authority.
--
-- SCOPE: every record of the 8 roster people in 19f47e78 that does NOT already
-- name an employer party. That excludes 167 records whose own source sheet
-- names their employer at the time ('Vivat Rex PL', 2024-06-10 .. 2024-10-12,
-- labelled by 20261025140000). Naming a second employer on them would state two
-- employers for one day; whether 20b2c802 is named on them, and in which role,
-- is a separate owner decision (see the PR). Both records of a corrected chain
-- are attributed (the readers count only the current record of a chain).
--
-- MEASURED (production, read-only, 2026-11-23): the 8 people hold 743 records
-- (48 originals with a correcting record = 695 current, 7,367.5 h). In scope:
-- 576 records, 528 current, 5,938.5 h. All in 19f47e78; 0 on a project with a
-- keyed customer (the P6 restriction); 0 already naming 20b2c802.
-- The pre-assertions re-measure all of this at apply time and abort on any
-- difference.
-- ============================================================================

begin;

-- >>> PRE-ASSERTIONS (read-only)
do $$
declare
  v_people int;
  v_scope int;
  v_other_org int;
  v_keyed int;
  v_already int;
  v_target int;
begin
  select count(*) into v_people
  from public.organization_people op
  where op.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
    and op.id in (
      'cf580388-5943-4254-b4b4-e7b6b9e857be', '8676823d-8e4f-46d0-b3a7-18a96650c652',
      'dac739fa-7c81-4f02-9e1c-1740341b2ab3', '79d10fb3-5477-44e3-8269-1fe1304fa38a',
      'c1edbb07-a1f3-494f-be0b-4ddd53e28ded', '6b62a7a2-9dee-4790-a13d-2ae5cb9f008d',
      '4d4a3837-c512-485c-bd50-fe4b747e19ea', 'b154ab88-2a4f-480f-ba22-55420e1e1114');
  if v_people <> 8 then
    raise exception 'expected 8 roster people in 19f47e78, found %', v_people;
  end if;

  select count(*) into v_target
  from public.organizations o
  where o.id = '20b2c802-c624-43c0-b368-8fa6c1fbeae3' and o.archived_at is null;
  if v_target <> 1 then
    raise exception 'target organization 20b2c802 missing or archived';
  end if;

  select count(*) into v_other_org
  from public.organization_evidence_records r
  where r.organization_person_id in (
      'cf580388-5943-4254-b4b4-e7b6b9e857be', '8676823d-8e4f-46d0-b3a7-18a96650c652',
      'dac739fa-7c81-4f02-9e1c-1740341b2ab3', '79d10fb3-5477-44e3-8269-1fe1304fa38a',
      'c1edbb07-a1f3-494f-be0b-4ddd53e28ded', '6b62a7a2-9dee-4790-a13d-2ae5cb9f008d',
      '4d4a3837-c512-485c-bd50-fe4b747e19ea', 'b154ab88-2a4f-480f-ba22-55420e1e1114')
    and r.organization_id <> '19f47e78-7bd1-4120-9937-603dba769f8a';
  if v_other_org <> 0 then
    raise exception 'records of these people outside 19f47e78: %', v_other_org;
  end if;

  select count(*), count(*) filter (where exists (
           select 1 from public.project_clients pc
           where pc.project_id = r.project_id and pc.customer_key is not null)),
         count(*) filter (where exists (
           select 1 from public.organization_evidence_parties p
           where p.record_id = r.id
             and p.party_organization_id = '20b2c802-c624-43c0-b368-8fa6c1fbeae3'))
    into v_scope, v_keyed, v_already
  from public.organization_evidence_records r
  where r.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
    and r.organization_person_id in (
      'cf580388-5943-4254-b4b4-e7b6b9e857be', '8676823d-8e4f-46d0-b3a7-18a96650c652',
      'dac739fa-7c81-4f02-9e1c-1740341b2ab3', '79d10fb3-5477-44e3-8269-1fe1304fa38a',
      'c1edbb07-a1f3-494f-be0b-4ddd53e28ded', '6b62a7a2-9dee-4790-a13d-2ae5cb9f008d',
      '4d4a3837-c512-485c-bd50-fe4b747e19ea', 'b154ab88-2a4f-480f-ba22-55420e1e1114')
    and not exists (
      select 1 from public.organization_evidence_parties p
      where p.record_id = r.id and p.party_role = 'employer');
  if v_scope <> 576 then
    raise exception 'expected 576 records in scope, found % (re-measure and re-approve)', v_scope;
  end if;
  if v_keyed <> 0 then
    raise exception '% records sit on a project with a keyed customer (P6 forbids a party organization)', v_keyed;
  end if;
  if v_already <> 0 then
    raise exception '% records already name 20b2c802', v_already;
  end if;
end $$;

-- >>> THE WRITE: one employer party row per record in scope.
insert into public.organization_evidence_parties
  (organization_id, record_id, party_role, party_organization_id, party_label)
select r.organization_id, r.id, 'employer', '20b2c802-c624-43c0-b368-8fa6c1fbeae3', null
from public.organization_evidence_records r
where r.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
  and r.organization_person_id in (
    'cf580388-5943-4254-b4b4-e7b6b9e857be', '8676823d-8e4f-46d0-b3a7-18a96650c652',
    'dac739fa-7c81-4f02-9e1c-1740341b2ab3', '79d10fb3-5477-44e3-8269-1fe1304fa38a',
    'c1edbb07-a1f3-494f-be0b-4ddd53e28ded', '6b62a7a2-9dee-4790-a13d-2ae5cb9f008d',
    '4d4a3837-c512-485c-bd50-fe4b747e19ea', 'b154ab88-2a4f-480f-ba22-55420e1e1114')
  and not exists (
    select 1 from public.organization_evidence_parties p
    where p.record_id = r.id and p.party_role = 'employer');

-- >>> POST-ASSERTIONS (read-only)
do $$
declare
  v_written int;
begin
  select count(*) into v_written
  from public.organization_evidence_parties p
  where p.party_organization_id = '20b2c802-c624-43c0-b368-8fa6c1fbeae3'
    and p.party_role = 'employer'
    and p.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a';
  if v_written <> 576 then
    raise exception 'expected 576 party rows naming 20b2c802, found %', v_written;
  end if;
end $$;

commit;

-- ROLLBACK (down): supabase/rollbacks/20261123120000_history_performing_party_nonstop_v1.down.sql
-- Deletes only the employer party rows naming 20b2c802 on records of 19f47e78
-- (the pre-assertion proves none existed before this file ran).
