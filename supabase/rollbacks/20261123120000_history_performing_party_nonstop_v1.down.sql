-- ROLLBACK 20261123120000 — history_performing_party_nonstop_v1
-- Removes only the employer party rows this migration inserted: those naming
-- 20b2c802, with no label, on records of the 8 roster people in 19f47e78. Its
-- pre-assertion proved none existed before. A party row added later through the
-- product for any other record is not touched. No evidence record, event, roster
-- row or work object is touched.
begin;
delete from public.organization_evidence_parties p
where p.party_role = 'employer'
  and p.party_organization_id = '20b2c802-c624-43c0-b368-8fa6c1fbeae3'
  and p.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
  and p.party_label is null
  and exists (
    select 1 from public.organization_evidence_records r
    where r.id = p.record_id
      and r.organization_person_id in (
        'cf580388-5943-4254-b4b4-e7b6b9e857be', '8676823d-8e4f-46d0-b3a7-18a96650c652',
        'dac739fa-7c81-4f02-9e1c-1740341b2ab3', '79d10fb3-5477-44e3-8269-1fe1304fa38a',
        'c1edbb07-a1f3-494f-be0b-4ddd53e28ded', '6b62a7a2-9dee-4790-a13d-2ae5cb9f008d',
        '4d4a3837-c512-485c-bd50-fe4b747e19ea', 'b154ab88-2a4f-480f-ba22-55420e1e1114')
  );
commit;
