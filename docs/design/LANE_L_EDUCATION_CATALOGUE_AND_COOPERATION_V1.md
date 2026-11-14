# Lane L design: public programme catalogue and institution ↔ employer cooperation (V1)

Status: **DESIGN ONLY, for independent security review before any implementation.**
Date: 2026-11-14. Base: `main` b3e877ec.

Owner direction: comment on PR #3334, 2026-11-14. Groups 4 (student / intern) and 5 (education institution) of the five-group ecosystem.

Applicable rules:
- Canonical architecture §1.9: INSTITUTIONS is realised by the existing EDU-1..EDU-6 capabilities. A node is not a licence for a duplicate module.
- Doctrine §2 (translation), §4 (default-closed visibility), §6 (storage minimalism), §20 (privacy).
- Decisions 0024 (one memory), 0025 (one history), 0028 J-12 (institution confirmation).
- AGENTS.md "Public communication" and the public claims registry.

This document creates no code, migration or route. Every SQL block below is a **proposal**.

---

## 1. Problem

Two owner-approved features do not exist on `main`:

1. **No public programme catalogue.**
   - An institution's programmes (`education_programs`) are readable only by its own managers and active members (policy `education_programs_select`, migrations `20260903120000` and `20260903150000`).
   - Signed-in learners see only cohorts opened for join requests (`list_open_education_cohorts_v1`, `20261102160000`).
   - Employers and signed-out visitors see nothing.
   - The public organization page `app/[locale]/business/[slug]/page.tsx` shows identity and marketplace listings only.
2. **No institution ↔ employer cooperation.**
   - The only organization-to-organization bridge is agency ↔ client (`agency_client_connections`, `20260723180000`, register row 4.15 LIVE_VERIFIED).
   - Its creation requires the inviting company to act as an agency (`company_acts_as_agency`, `20260928180000`).
   - An institution cannot invite an employer, an employer cannot share an internship need with an institution, and the two cannot hold a thread.
   - The host-company `intern` relationship (`20261012170000`) links a company to a person, never to the institution.

## 2. Existing mechanisms found (reuse targets)

| Mechanism | Where | What it gives |
|---|---|---|
| Programme store | `20260903120000` `education_programs` (`name`, `target_profession_slug`, `education_type_slug`, `description` ≤2000, `archived_at`) | The data to publish. No publish flag, no language column. |
| Programme writes | `create_education_program_v1`, `update_education_program_v1` (`20260908120000`), `lib/education/program-actions.ts` | Manager-gated definer RPCs. |
| Public organization page | `20260719120000_business_public_profile.sql`: `organizations.public_profile_enabled` (default false), `public_slug`; definer reads `get_public_business_profile_v1` / `_listings_v1` (anon + authenticated); `lib/company/public-profile.ts:47-90` | The ONE existing explicit opt-in public-publication mechanism. |
| Anon definer allowlist | `20260722160000_secdef_anon_reach_revoke_v1.sql` §5 (exactly four signatures), `apps/web/lib/security/anon-secdef-allowlist.ts`, `lib/guards/secdef-anon-allowlist.test.ts` | Every anon-callable definer must be added here with a written security contract. |
| Signed-in cohort finder | `list_open_education_cohorts_v1` (`20261102160000:209-240`) | Cross-institution read of open groups for signed-in people, capped at 100. |
| Org ↔ org connection | `agency_client_connections` + `agency_client_request_shares` (`20260723180000:48-128`); create, accept, decline, revoke, share and unshare RPCs; `company_acts_as_agency` (`20260928180000`) | Email invite → acceptance by the invited address → active connection → the client shares its OWN need. All writes through definer RPCs; reads curated by RLS. |
| Bridge messaging | `allowed_agency_connection` (`lib/communication/communication-eligibility.ts:85-95, 271`), `lib/agency/bridge-conversation.ts`; conversation rate caps (`communication-core.ts:176-204`) | A thread between the two parties of an ACTIVE connection, under the §8.1 contact gate. |
| Host practice | relationship `intern` (`20261012170000`): no training-provider status needed, `grants_worker_visibility=false`, `journal_reviewable=true` | The employer's own link to the learner, by the learner's acceptance. |
| Internship as demand | opportunity types `internship` / `apprenticeship` (`20260903130000`); board filter (#3334); compass door (#3344) | Internship needs already live on the one board. |
| Learner least privilege | `can_view_worker`: `student` grants no visibility (`20260827210000`); outcomes counted and suppressed below 5 (`institution_learner_outcomes_v1`, `20260903140000`) | The privacy floor this design must not lower. |

## 3. Feature 1: public programme catalogue

### 3.1 Choice: extend the public organization page

The catalogue extends the public organization page. It does not add a new catalogue store or a new public route. Reasons:

- Publication already has one opt-in switch (`public_profile_enabled`) and one reviewed public read pattern: definer, curated columns, filtered by the opt-in.
- Programmes are an organization's offer, as marketplace listings already are.
- A second public mechanism would duplicate the opt-in, the slug and the abuse controls.

A programme becomes public only when **both** hold:
- the organization enabled its public profile, and
- the programme itself is explicitly published.

A new programme is never public by default.

### 3.2 Data model delta (additive)

```sql
-- Proposed: 2026111x_education_programs_publication_v1.sql (RED: new definer + anon grant)
alter table public.education_programs
  add column if not exists published_at timestamptz,          -- null = not published (default)
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists description_language char(2);      -- doctrine §2.3: the language it was written in
-- No change to education_programs_select: private reads stay as they are.
```

Rollback:

```sql
-- Refuses while any programme is published, so a public promise is never silently withdrawn.
do $$ begin
  if exists (select 1 from public.education_programs where published_at is not null) then
    raise exception 'programmes are published; unpublish first';
  end if; end $$;
drop function if exists public.get_public_business_programs_v1(uuid);
drop function if exists public.list_published_education_programs_v1(text, text, int);
drop function if exists public.set_education_program_published_v1(uuid, boolean);
alter table public.education_programs drop column if exists description_language,
  drop column if exists published_by, drop column if exists published_at;
```

### 3.3 Functions

```sql
-- WRITE (authenticated): publish or unpublish ONE programme. Caller must manage the organization
-- (manages_organization), the organization must hold training_provider, and the programme must not be archived.
create or replace function public.set_education_program_published_v1(p_program_id uuid, p_published boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$ ... $$;
revoke execute on function public.set_education_program_published_v1(uuid, boolean) from public, anon;
grant  execute on function public.set_education_program_published_v1(uuid, boolean) to authenticated;

-- PUBLIC READ (anon + authenticated), one organization at a time, bound to the opt-in.
create or replace function public.get_public_business_programs_v1(p_org_id uuid)
returns table (id uuid, name text, target_profession_slug text, education_type_slug text,
               description text, description_language char(2), published_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.name, p.target_profession_slug, p.education_type_slug,
         p.description, p.description_language, p.published_at
    from public.education_programs p
    join public.organizations o on o.id = p.organization_id
   where o.id = p_org_id
     and o.public_profile_enabled = true
     and o.archived_at is null
     and exists (select 1 from public.organization_roles r
                  where r.organization_id = o.id and r.role_slug = 'training_provider')
     and p.archived_at is null
     and p.published_at is not null
   order by p.name limit 50;
$$;
-- + allowlist entry with a written security contract (anon-secdef-allowlist.ts) and an
--   updated §5 assertion in the same migration: anon reaches exactly FIVE allowlisted signatures.

-- CROSS-INSTITUTION DISCOVERY (authenticated only, never anon): students and employers browse
-- published programmes by profession and country. Same filters; capped; no member or cohort data.
create or replace function public.list_published_education_programs_v1(
  p_profession_slug text default null, p_country text default null, p_limit int default 50)
returns table (id uuid, name text, target_profession_slug text, education_type_slug text,
               institution_name text, institution_slug text, country text)
language sql security definer stable set search_path = public as $$ ... where auth.uid() is not null ... limit least(p_limit, 50) $$;
revoke execute on function public.list_published_education_programs_v1(text, text, int) from public, anon;
grant  execute on function public.list_published_education_programs_v1(text, text, int) to authenticated;
```

### 3.4 Never public, under any flag

The catalogue never exposes:
- cohorts and cohort names or dates (the signed-in finder keeps its own rules);
- members, member counts, join requests, request labels and notes;
- learner names or any person's identifier, including `created_by` and `published_by`;
- outcomes (the existing counts stay internal and suppressed below 5);
- recognitions and journal data;
- archived programmes;
- the institution's internal notes;
- any contact detail other than the organization's existing public contact fields.

The public read returns the seven columns listed and nothing else.

### 3.5 Surfaces

- `/business/[slug]` gains one "Programmes" section, rendered only when there are rows.
- `/dashboard/company/education` gets a per-programme publish switch, with a preview of the public row and a sentence saying exactly what becomes public.
- Students: the learning compass and the cohort finder link to the authenticated discovery read. Employers: the education doors link to it. No new top-level route; the discovery list renders inside the existing learning or opportunities surfaces (UNVERIFIED which one reads better; decide in the GREEN UI slice).
- i18n: new keys in all 11 locale files.
- The `description` text is shown in its original language, labelled with that language, and translated on read per doctrine §2.1. No translated column.
- Any public sentence that claims programmes are published goes into `lib/public-claims/registry.ts` in the same PR.

## 4. Feature 2: institution ↔ employer cooperation

### 4.1 Choice: generalise the one org ↔ org connection

Generalise the existing org ↔ org connection with a **kind**, so that one consent mechanism and one messaging grant serve both bridges.

Rejected alternatives:
- A new `institution_employer_*` table set: a second bridge with its own invite, revoke and messaging rules duplicates `agency_client_connections`.
- Reusing the agency kind unchanged: an institution is not an agency, and `company_acts_as_agency` would be a false capability claim.

Semantics:
- **Inviter (supply side) = the institution** (`training_provider`). **Invited party = the employer.**
- Inside the connection the employer acts as the "client": it shares its OWN internship or apprenticeship needs with the institution, exactly as `share_request_with_agency_v1` does.
- Either party opens the thread under the connection grant.

### 4.2 Data model delta (additive)

```sql
-- Proposed: 2026111x_org_connection_kind_education_v1.sql (RED: redefines definer RPCs + one RLS read path)
alter table public.agency_client_connections
  add column if not exists connection_kind text not null default 'agency_client'
    check (connection_kind in ('agency_client', 'education_partner'));
-- Existing rows keep 'agency_client'; every existing behaviour is unchanged for that kind.
-- The unique indexes gain connection_kind so one pair may hold one connection of each kind.
create unique index if not exists uq_acc_open_invite_kind
  on public.agency_client_connections (agency_company_id, lower(invited_email), connection_kind)
  where status in ('pending', 'active');
-- (the old uq_acc_open_invite is dropped only after the new index exists; rollback recreates it)
```

Function changes, every one RED:

- `create_agency_client_connection_v1(p_agency_company_id, p_invited_email)` stays byte-identical for the agency kind. A sibling `create_education_partner_connection_v1(p_institution_company_id, p_invited_email)`:
  - requires `owns_company`;
  - requires the institution's organization to hold `training_provider`;
  - inserts `connection_kind = 'education_partner'`.
- Accept, decline and revoke: unchanged. They are kind-agnostic: the invited address accepts, and either owner revokes.
- `share_request_with_agency_v1`, for `education_partner`, accepts only a need whose `opportunity_type` is `internship` or `apprenticeship`. An employer cannot push general hiring to a school through this door.
- `submit_agency_candidate_offer_v1` **refuses** `education_partner` in V1. An institution never offers a learner to an employer: the learner applies themselves through the existing interest button (consent stays with the person).
- `list_shared_requests_for_agency_v1`: returns shares for both kinds and adds `connection_kind` to its result.

Rollback:
- Refuses while any `education_partner` row exists (a revoke first).
- Restores the previous function bodies and indexes, then drops the column.

### 4.3 Messaging and the TypeScript twin

- `evaluateAgencyConnectionContact` already decides on "active connection, caller is one of the two parties". It is kind-agnostic, so the grant applies unchanged.
- The UI labels the thread by kind (bridge-conversation source stamp).
- `lib/company/organization-doors.ts:113-130`: the `partners` door is also shown when `hasEducation` is true, or when the employer has an active `education_partner` connection.

### 4.4 Data flows and their authorization

| Flow | Who sees it | Enforced by |
|---|---|---|
| Invitation | the institution's owners; the invited address | `agency_client_connections_select` (unchanged) |
| Active connection | both organizations' owners and admins | same policy |
| Shared internship need | both parties; the need stays the employer's own row | `agency_client_request_shares_select` + the kind check in the share RPC |
| Learner applies to the shared need | the learner and the employer (the existing interest flow) | existing `expressInterestCore`; the institution does NOT see who applied |
| Learner placed at the employer | the employer, by the learner accepting an `intern` invitation | `create_invitation_v1`; `grants_worker_visibility=false` |
| Practice confirmation for the institution | only entries in the institution's own `student` relationship | per-relationship review switch (`20260919210000`); unchanged |
| Organization thread | the two organizations' people in the thread | `allowed_agency_connection` + conversation RLS + rate caps |

The institution learns which of its learners got a placement **only from the learner's own journal in the institution's relationship**, never from the employer's records (decision 0025: an organization's records about other people are never attributed elsewhere).

## 5. Abuse cases and controls

| Case | Control |
|---|---|
| Scraping the catalogue | Anon reads only one organization per call, by id, after its slug lookup; 50-row cap. The cross-institution list is authenticated only, capped at 50, and returns no contact fields. A rate limit on the public page route is UNVERIFIED (check the existing public-page limits before the RED slice). |
| Impersonating an institution | Anyone can create an organization and declare `training_provider`. The public section must label the organization as self-declared unless a verification state exists. No organization verification column was found on `main` (UNVERIFIED; the company-claim flow exists for discovered organizations). No ranking or "official" badge without one. |
| Spam between organizations | Connection by email invite plus acceptance only; the existing `uq_acc_open_invite` idempotency; conversation rate caps. A per-institution invite cap per day is proposed (the agency path has none today, UNVERIFIED). |
| An employer harvesting learners | No learner data crosses the connection. Offers from an institution are refused in V1. The institution's learner list stays institution-only. |
| A published programme naming a person | Programme free text is the institution's responsibility. The publish screen warns; the public read never adds person fields. |
| A stale public promise | Unpublish is one switch. Archiving a programme removes it from public reads at once (`archived_at` filter). The rollback refuses while anything is published. |

## 6. Slice plan

GREEN slices (no migration, no grant):
1. **G1:** this design merged as a doc. Register rows 11.11 (catalogue) and 11.12 (cooperation) are added as NOT_IMPLEMENTED with links here.
2. **G2:** UI copy and i18n keys prepared behind a `needs-migration` honest state, as `public-profile.ts` does: until the migration exists, the publish switch and partner door say "not available yet". This is optional; it may wait for R1 instead.

RED slices (draft, `needs-human-gate` label, independent security review, owner apply via `apply_migration`):
3. **R1 — catalogue:**
   - publication columns;
   - `set_education_program_published_v1`;
   - `get_public_business_programs_v1`, a **new anon grant**: allowlist and §5 assertion updated;
   - `list_published_education_programs_v1` (authenticated);
   - guards: allowlist contract, public read column set, the "never public" list.
4. **R2 — cooperation:**
   - `connection_kind` column and indexes;
   - `create_education_partner_connection_v1`;
   - kind checks in the share and offer RPCs;
   - the list RPC shape change;
   - guards: offers refused for `education_partner`; shares limited to internship / apprenticeship.
5. **G3 after R1 / R2 apply:** UI on `/dashboard/company/education`, `/business/[slug]`, the partners door, the compass and finder links, all 11 locales, and public-claims registry entries.

## 7. Acceptance walks to add (existing specs)

Production walk `learning-practice` (QA-SYNTHETIC; created rows are cleaned up):
- the institution publishes one programme;
- a signed-out visitor sees it on `/business/<slug>` at 390 px and 1280 px, and sees no cohort, member or learner;
- after unpublish it is gone.

Production walk `agency-chain` (or a new describe block in `learning-practice`):
- the institution invites the QA employer as an education partner and the employer accepts;
- the employer shares one internship need;
- the institution sees it, and the two exchange one message in the thread;
- the institution's candidate offer is refused;
- revoke ends the shared view and the thread grant.

Isolated `signup-isolated` (CI): the same chain with fresh accounts, plus an RLS probe that a third organization sees none of it.

## 8. RED items requiring independent security review before implementation

1. A new anon-callable SECURITY DEFINER read, `get_public_business_programs_v1`, which changes the four-signature anon allowlist to five.
2. New SECURITY DEFINER functions: `set_education_program_published_v1`, `list_published_education_programs_v1` and `create_education_partner_connection_v1`.
3. Redefinitions of `share_request_with_agency_v1`, `submit_agency_candidate_offer_v1` and `list_shared_requests_for_agency_v1`, which are production RPCs behind a LIVE_VERIFIED flow (4.15).
4. Unique-index replacement on `agency_client_connections`, with a guarded rollback.
5. The extended read path: the cross-institution list exposes organization names and slugs to any signed-in user.
6. Impersonation risk while organization verification is absent.
