# HUMAN GATE PACKAGE — `20260907114500_organization_evidence_import_v1`

**Status:** NOT APPROVED. NOT APPLIED. Awaiting an explicit owner decision.
**Class:** RED (auto-merge refused).
**PR:** #1600 — draft, labelled `needs-human-gate`.
**Apply method if approved:** Supabase MCP `apply_migration` ONLY.
Never `pnpm supabase db push` / `prisma migrate deploy` — the repository's
filenames do not match the production ledger versions, so a push would re-run
already-applied migrations.

---

## 0. What you are being asked to decide

Whether to create **eight new, empty tables** and their policies on production.

Nothing existing is altered, dropped, renamed or re-granted. No data is written,
moved or deleted. If you approve and later regret it, the rollback in §7 removes
every one of them — and refuses to run if a single row of evidence exists, so
approval cannot become "we deleted somebody's work history by accident".

---

## 1. Why it is RED

`migration-safety.mjs` reports **exactly one** blocking finding:

```
[grant-or-revoke] GRANT/REVOKE present — any privilege change is RED
```

That is the classifier working correctly, and it is the migration's **only**
finding. The eight `GRANT` statements exist because this project has **no
default privileges for `authenticated`** — verified against three existing
tables (`education_programs`, `organization_roles`, `work_hour_allocations`),
each of which carries the same explicit grant. Without them the tables would be
created and then be unreachable by every real user.

The migration carries **no `-- @human-gate-approved` marker**, deliberately: the
marker is an acknowledgement that an owner has decided, and no such decision
exists. Adding it now would be a claim rather than a fact.

**What the classifier did NOT find**, because none of it is present:

| RED pattern | Present? |
|---|---|
| `DROP TABLE` / `DROP COLUMN` / `DROP POLICY` | no |
| `ALTER POLICY` on an existing policy | no |
| `using (true)` | no |
| grant to `anon` or `public` | no |
| `SECURITY DEFINER` function | no |
| trigger | no |
| data `UPDATE` / `DELETE` / `INSERT` | no |
| change to authentication core logic | no |

---

## 2. The exact privilege diff

```sql
grant select, insert, update on public.organization_people                     to authenticated;
grant select, insert         on public.evidence_import_sessions                to authenticated;
grant select, insert, update, delete on public.evidence_import_rows            to authenticated;
grant select, insert         on public.organization_evidence_records           to authenticated;
grant select, insert         on public.organization_evidence_parties           to authenticated;
grant select, insert         on public.organization_evidence_events            to authenticated;
grant select, insert         on public.evidence_import_events                  to authenticated;
grant select, insert         on public.organization_evidence_competency_signals to authenticated;
```

Read the shape, not just the list:

* **`organization_evidence_records` has no `update` and no `delete` grant, and
  no `UPDATE` or `DELETE` policy.** Evidence is append-only by the absence of a
  way to change it (doctrine §3.1), not by a trigger that could be dropped.
* **`evidence_import_rows` is the only table with `delete`** — it is staging.
  Nothing in it is evidence; discarding a mis-parsed source before committing is
  the point of it existing.
* **`anon` and `public` receive nothing anywhere in the file.**
* Every grant is to `authenticated`, and RLS then decides which rows that role
  can actually see or write. A grant is permission to attempt; the policies in
  §3 are what permit.

---

## 3. The policy diff, in full, by what it protects

All 21 policies are new; none replaces or relaxes an existing one. Every
predicate is one of the project's existing authority helpers.

### 3.1 The organization's own boundary

`manages_organization(organization_id)` gates every read and write on
`evidence_import_sessions`, `evidence_import_rows`, `evidence_import_events`,
and the insert side of every evidence table. A source file may name many
people; someone who happens to appear in one never gains sight of the rest.

### 3.2 Who may read a committed record

```sql
create policy organization_evidence_records_select on public.organization_evidence_records
  for select to authenticated
  using (
    public.manages_organization(organization_id)                 -- the supplier
    or exists (                                                  -- the SUBJECT
      select 1 from public.organization_people op
       where op.id = organization_evidence_records.organization_person_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'                            -- confirmed only
    )
    or exists (                                                  -- a recorded party
      select 1 from public.organization_evidence_parties p
       where p.record_id = organization_evidence_records.id
         and p.party_organization_id is not null
         and public.manages_organization(p.party_organization_id)
    )
    or public.is_admin()
  );
```

Note `link_state = 'linked'`: an offer the person has not accepted shows them
nothing.

### 3.3 A person is never invented, and never named over their objection

```sql
-- INSERT: an importer may create an UNLINKED roster record only.
create policy organization_people_insert on public.organization_people
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and created_by = auth.uid()
    and link_state = 'unlinked'
    and linked_worker_id is null
    and linked_profile_id is null
  );

-- The organization may OFFER a link, but only to a profile that ALREADY holds
-- a real active engagement or membership with it.
create policy organization_people_manager_update on public.organization_people
  for update to authenticated
  using (public.manages_organization(organization_id))
  with check (
    public.manages_organization(organization_id)
    and (
      linked_profile_id is null
      or exists (select 1 from public.engagement_contexts ec
                  where ec.profile_id = organization_people.linked_profile_id
                    and ec.organization_id = organization_people.organization_id
                    and ec.status = 'active')
      or exists (select 1 from public.company_memberships m
                  where m.profile_id = organization_people.linked_profile_id
                    and m.organization_id = organization_people.organization_id
                    and m.status = 'active')
    )
  );

-- The PERSON answers. Accept, or refuse. There is no third option.
create policy organization_people_subject_decides on public.organization_people
  for update to authenticated
  using (linked_profile_id = auth.uid())
  with check (
    (link_state = 'linked' and link_method = 'worker_confirmed'
       and linked_profile_id = auth.uid()
       and exists (select 1 from public.workers w
                    where w.id = organization_people.linked_worker_id
                      and w.profile_id = auth.uid()))
    or (link_state = 'unlinked' and linked_profile_id is null
          and linked_worker_id is null)
  );
```

**A defect fixed before it shipped.** An earlier draft of this migration carried
a `organization_people_self_claim` policy letting a person claim an *unlinked*
row. It could never have fired: the select policy deliberately hides unlinked
rows from everyone but a manager, so the rows it targeted were invisible.
Widening the select would have let any authenticated account enumerate an
organization's people by name. The offer therefore comes from the side that
already knows both facts, and the person accepts or refuses it.

### 3.4 Attestation is allowed — including of your own work

```sql
create policy organization_evidence_events_attest on public.organization_evidence_events
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and actor_profile_id = auth.uid()
    and event_type <> 'independently_verified'
  );
```

This implements owner decision 3 exactly. A sole trader legitimately has nobody
above them, so attesting one's own work is permitted — and
`deriveEvidenceStanding` then derives `SELF_ATTESTED` permanently, for which
`countsAsIndependentlyVerified` is false. The separation is semantic, not a
block; the write side and the read side agree.

### 3.5 Independent verification requires a genuinely distinct party

```sql
create policy organization_evidence_events_verify on public.organization_evidence_events
  for insert to authenticated
  with check (
    event_type = 'independently_verified'
    and actor_profile_id = auth.uid()
    and not public.manages_organization(organization_id)          -- not the supplier
    and actor_organization_id is not null
    and public.manages_organization(actor_organization_id)
    and exists (select 1 from public.organization_evidence_parties p
                 where p.record_id = organization_evidence_events.record_id
                   and p.party_organization_id = organization_evidence_events.actor_organization_id
                   and p.party_role in ('client','end_client','project_owner',
                                        'assessor','verifier','public_body'))
    and not exists (select 1 from public.organization_evidence_records r    -- not the subject
                     join public.organization_people op on op.id = r.organization_person_id
                    where r.id = organization_evidence_events.record_id
                      and op.linked_profile_id = auth.uid())
  );
```

Four conditions, all of which must hold: the actor is not the supplier, the
actor manages an organization, that organization is a **recorded party** on
**this** record in a verifying role, and the actor is not the subject.

---

## 4. What the schema makes impossible

These are structural, not conventions a later slice could forget:

1. **An import cannot mint trust.** `organization_evidence_records.evidence_state`
   has a CHECK of exactly `('SELF_REPORTED','ORGANIZATION_REPORTED',
   'LEGACY_IMPORTED','UNVERIFIED','NEEDS_REVIEW')`. No attested value and no
   verified value exists on the table, anywhere.
2. **Evidence cannot be edited or deleted through the API.** No UPDATE policy
   and no DELETE policy exist on the record table. Withdrawal and correction are
   append-only events.
3. **Cross-organization drift is unrepresentable.** Composite foreign keys
   `(child_id, organization_id) → (parent_id, organization_id)` mean a row of
   one organization cannot reference another's person, session or record.
4. **The same fact imports once.** `(organization_id, record_fingerprint)` is
   unique and the commit is one `ON CONFLICT DO NOTHING` statement.
5. **Fact and inference never merge.** `source_fact` and `derived` are separate
   `jsonb` columns; the row schema refuses a field claimed as both.
6. **Provenance is never collapsed.** Subject (`organization_person_id`),
   supplier (`supplied_by_organization_id` + `supplier_role`), the person who
   stated it (`supplied_by_profile_id`), the importer (`imported_by_profile_id`),
   a recorded third party (`party_organization_id`) and a lifecycle actor
   (`actor_profile_id`) are six separate columns.

Guard `apps/web/lib/guards/organization-evidence-import-v1.test.ts` asserts all
of this against the SQL file itself, so it cannot silently regress.

---

## 5. Blast radius if applied

* **Existing tables touched:** none.
* **Existing policies changed:** none.
* **Existing grants changed:** none.
* **Rows written by the migration:** none. All eight tables are created empty.
* **Behaviour change for current users:** the evidence-import page and the
  profile card stop rendering their "not enabled in this environment" note and
  start rendering an empty state. Nothing else on the product changes, because
  nothing else reads these tables.
* **Storage:** eight empty tables plus their indexes.

---

## 6. Blast radius if NOT applied

The capability stays honestly inert. `apps/web` degrades on the
`needs-migration` path in every layer — the page shows its note, the MCP
capabilities return `needs_migration`, and no read is reported as an empty
organization. This is the current, tested state.

---

## 7. Rollback

`supabase/rollbacks/20260907114500_organization_evidence_import_v1.down.sql`.

It **refuses to run** while any row exists in `organization_evidence_records`,
`evidence_import_sessions` or `organization_people` — evidence is never dropped
to undo a schema change. With all three empty it drops the eight tables in
dependency order and the one FK added to `evidence_import_rows`.

---

## 8. If you approve

1. Reply on PR #1600 approving `20260907114500_organization_evidence_import_v1`.
2. Apply via Supabase MCP `apply_migration` with the version
   `20260907114500` and the file's contents verbatim.
3. Verify: the eight tables exist, all eight report `rowsecurity = true`, and
   `organization_evidence_records` has **no** UPDATE and **no** DELETE policy.
4. Then, and only then, a **small authorized sample** of real historical data
   may be imported — never the full archive first. The owner's standing
   instruction is explicit on this point.

## 9. If you return it

Say which of §2, §3 or §4 is wrong and it will be changed before being
re-submitted. Nothing needs undoing: it has never been applied.
