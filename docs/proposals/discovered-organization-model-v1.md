# Discovered (unclaimed) organization model — v1 PROPOSAL

Status: **PROPOSAL — no migration written or applied.** Owner decision of
2026-09-30: an imported third-party company must never become an organization
owned by the person who imported it. This document measures the existing model
and proposes the smallest additive change. It extends the canonical
architecture (INSTITUTIONS / ORGANIZATIONS node, SEP-3 EVIDENCE ≠
VERIFICATION, SEP-5 IDENTITY ≠ ROLE). It is not a competing architecture.

## 1. What already exists (production, measured 2026-09-30)

| Structure | Fact | Consequence |
|---|---|---|
| `organizations.owner_profile_id` | **nullable** | An organization can exist with no owner. |
| `on_org_owner_membership_seed`, `on_org_owner_engagement` | fire only from the owner | A null owner seeds no membership and no engagement. |
| `organizations` RLS | SELECT: owner, `belongs_to_organization(id)`, `is_admin()`; ALL writes: `is_admin()` only | An ownerless, memberless organization is invisible to everyone except platform admins, and only admins can write it. |
| Employer gate (`resolveEmployerCompanyCore`) | needs workspace membership, then a legacy `companies` binding, then a governance role | An organization without a member and without a `companies` row **cannot perform any authenticated employer action**. |
| `organization_roles` + `organization_role_types` | market role per organization: employer, client, workforce_provider, talent_provider, recruitment_partner, training_provider, payroll_provider, logistics_provider, verification_provider, project_operator | This is already where DIRECT EMPLOYER and AGENCY are kept apart. Contractor, subcontractor and supplier are missing. |
| `companies` | owner-bound (`profile_id`); `save_company_setup_v3` makes the caller the owner | This is the wrong door for an import. It stays the door for a claimed account. |
| `company_need_public_intakes` | anonymous need intake with a free-text company name | This is a demand signal, not an organization identity. It links to the model below; it does not replace it. |
| `market_intelligence_observations` | numeric metric observations with provenance | This is metric-shaped and cannot hold "this company exists, per source X on date Y". |

**Conclusion:** the organization row itself already expresses "exists, owned by
nobody, can do nothing". What is missing is (a) the lifecycle state,
(b) per-fact provenance, (c) identity keys for de-duplication, and (d) the
claim record. No second company table is needed.

## 2. Proposed change (additive only)

### 2.1 `organizations.claim_state` — one column

```sql
alter table public.organizations
  add column claim_state text not null default 'claimed'
  check (claim_state in
    ('discovered','invited','claim_requested','representative_verified','claimed'));
```

- Every existing row has an owner or members, so the default is `claimed`. This
  is truthful for all 21 production rows; the preflight asserts it.
- The invariant, enforced by a CHECK or trigger: `claim_state <> 'claimed'`
  implies `owner_profile_id is null`, and implies no active
  `company_memberships`.
- ACTIVE ORGANIZATION is not a stored state. It is `claimed` plus activity,
  derived where it is read (SEP-1: fact ≠ derived).

### 2.2 `organization_identifiers` — de-duplication keys

```sql
create table public.organization_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  scheme text not null check (scheme in
    ('registration_code','vat','web_domain','name_country')),
  country text,                 -- ISO-2; null only for web_domain
  value_normalized text not null,
  source_fact_id uuid,          -- the provenance row that asserted it
  created_at timestamptz not null default now(),
  unique (scheme, country, value_normalized)
);
```

- A strong key (`registration_code`, `vat`, `web_domain`) can belong to only
  one organization, so a duplicate is refused by the database, not only by the
  app.
- `name_country` is a weak key. It is not unique; it is used only to surface
  "possible duplicate — decide".
- The backfill reads the claimed organizations' existing `companies.registration_code`,
  `vat_number` and `website`, so an import can never create a second copy of a
  company that is already on the platform.

### 2.3 `organization_facts` — append-only provenance

```sql
create table public.organization_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  field text not null,          -- legal_name, display_name, country, website,
                                -- sector, city, contact_public_email, headcount_band, …
  value jsonb not null,
  source_kind text not null check (source_kind in
    ('public_register','company_website','job_posting','owner_import',
     'partner_referral','direct_contact','agentai_signal')),
  source_ref text,              -- URL / register id / file name + row
  observed_at date not null,    -- when the SOURCE said it
  import_batch_id uuid,         -- the ingest receipt this came from
  recorded_by uuid not null references public.profiles(id),
  superseded_by uuid references public.organization_facts(id),
  created_at timestamptz not null default now()
);
```

- **Never overwrite.** A new value is a new row. The displayed value is
  derived: the newest non-superseded fact per field, with a source ranking
  where a claimed representative outranks an import.
- **Provenance survives a claim.** Claiming adds facts; it deletes none.
- **Contact data:** only a lawfully obtained business contact may be stored
  (`contact_public_email`). A named private individual's data is not stored
  here. Personal-data rules follow the existing privacy doctrine.

### 2.4 `organization_claims` — the claim chain

```sql
create table public.organization_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  claimant_profile_id uuid not null references public.profiles(id),
  state text not null check (state in
    ('invited','requested','representative_verified','linked','rejected','withdrawn')),
  verification_method text check (verification_method in
    ('register_representative_match','signed_authorization_letter',
     'verified_domain_mailbox_plus_second_factor','platform_admin_review')),
  verification_evidence_ref text,   -- document id / review note, never the document text
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
```

- **Claim is never automatic.** An email domain match alone is not a
  `verification_method`; at most it is a hint to the reviewer. The
  domain-mailbox method needs a second factor as well.
- `linked` is written ONLY by a SECURITY DEFINER RPC,
  `link_verified_organization_claim_v1(claim_id)`. It requires
  `representative_verified`, a `decided_by` that is a platform admin who is not
  the claimant, and it runs in one transaction that:
  1. sets `owner_profile_id`, which fires the existing membership and
     engagement seed triggers;
  2. creates the `companies` binding through the existing mirror path;
  3. sets `claim_state = 'claimed'`;
  4. writes an `audit_logs` row.

### 2.5 Market roles — seed rows only

```sql
insert into public.organization_role_types (slug, category) values
  ('contractor','project'), ('subcontractor','project'), ('supplier','service')
on conflict (slug) do nothing;
```

Classification uses the existing tables:

- direct employer → `employer`
- contractor → `contractor`
- subcontractor → `subcontractor`
- staffing agency → `workforce_provider`
- recruitment agency → `recruitment_partner`
- client → `client`
- supplier / partner → `supplier`

A company may hold several roles. Classification is never collapsed into one
category.

## 3. What this makes impossible (the protections the owner named)

| Risk | Blocked by |
|---|---|
| Duplicate organization or company | unique strong keys in `organization_identifiers`, backfilled from claimed companies |
| Wrong ownership | ingest writes `owner_profile_id = null`, `claim_state = 'discovered'`; only the link RPC can set an owner |
| Better data overwritten | `organization_facts` is append-only; no ingest path updates `organizations` columns of a `claimed` row |
| DISCOVERED silently becoming VERIFIED or CLAIMED | the CHECK invariant, plus a single RPC that requires an admin decision by someone other than the claimant |
| A discovered company acting as an employer | no membership, and no `companies` binding until linked, so the employer gate refuses |
| Discovered companies leaking to the public | organizations RLS already admits only owner, members and admins; public pages require `public_profile_enabled` (default false) |

## 4. The ingest on top (after approval)

`company.ingest.preview` → `company.ingest.confirm` on `/api/mcp`, mirroring
`people.ingest.*`:

```text
PARSE (csv / xlsx / json rows)
  → NORMALIZE (name, country ISO-2, registration code, VAT, domain, email, phone)
  → DEDUPLICATE inside the file
  → MATCH EXISTING (strong key = same organization; weak key = ask)
  → CLASSIFY (market roles)
  → PREVIEW (new / already known / possible duplicate / invalid; nothing written)
  → CONFIRM (one-time token bound to the preview hash)
  → WRITE (organizations[discovered] + identifiers + facts + roles, one batch id)
  → READ-BACK
  → RECEIPT (counts + ids + batch id)
```

- For an organization that is already known, the import adds FACTS only and
  never touches its columns.
- Who may ingest: platform admins (`is_admin()`) in v1. Market data is
  platform-level knowledge, not an employer's own records. Widening this to a
  delegated operator role is a later owner decision.

## 5. Migration class

**RED.** It adds new tables with RLS and a SECURITY DEFINER link RPC, and it
touches the organization lifecycle. Per the merge model:

- it ships as a draft PR labelled `needs-human-gate`, with the exact SQL and
  policies, a rollback file, and zero-row assertions;
- it is applied via Supabase MCP `apply_migration` after owner approval.

No code depends on it until then.

## 6. Owner decisions this proposal needs

1. Approve the four structures above: the column, the identifiers table, the
   facts table, and the claims table + link RPC.
2. v1 ingest authority: platform admins only (proposed), or also a named
   operator role?
3. Which `verification_method`s are acceptable in v1. Proposed: register
   match, signed letter, admin review; domain mailbox only with a second
   factor.
