# Approval Authority Model — Readiness v1 (Product Reality Train · Wagon 2)

**Type:** read-only readiness/audit. **No migration, no DB/RLS/schema/Supabase/env/auth-core change, no production mutation, no merge, no deploy.**
**Baseline:** production `main` = `d57233fbece1ea7140315f830baddf7d683c5b2a` (post-#509). Project `gorgitwvdzxbnaxhrsrw`.

> **Owner correction (this revision):** do not reduce this to "Option A vs narrow Option B". The product needs a **real reviewer-authority model**. The platform owner/operator must approve without switching accounts; multi-company owners must approve from one place with the context shown; clients / project / property owners must be able to confirm *observed* work without it pretending to be employer verification; agencies/coordinators must confirm their brigades. **No fake approval identity:** every confirmation must record **who** approved, **under what authority**, **for which company/project/client/property context**, and **what exactly** was confirmed.

---

## 0. Why the old "Option A" is rejected
The first pass framed this as remove-`is_admin` (A) vs fake-admin-bypass (B). Both are wrong: **A blocks the legitimate platform-operator workflow**, and **B is dishonest + incomplete** (no multi-company, no client/project/property, no agency). The real fix is an **authority model** where the platform operator is a *first-class, honestly-recorded* authority — not removed, and not disguised as a company manager.

## 1. The five authority types

| | Authority | Who | Anchor (context) | Confirms | Proof tier |
|---|---|---|---|---|---|
| **A** | Org engagement reviewer | active `owner`/`manager`/`external_manager` in the **same org** | `engagement_contexts` (org) | employer review of an employee entry | **employer_verified** (may flip `worker_skills.verified`) |
| **B** | Multi-company owner/operator | one user holding A in **several** orgs | the **specific** engagement used | same as A, across companies, from one inbox | **employer_verified**, per selected context |
| **C** | Platform owner/operator | `is_admin()` platform authority | **platform** (no org engagement) | operator approval across managed contexts | recorded as **platform_operator/platform_owner** — never disguised as company manager |
| **D** | Client / project / property | the person who **observed** the work (project client, property owner, project owner) | `project`/`booking`/`object` or a subject-granted link | observed work, quality, hours, completion, service performed, skill observed | **observed** — NOT employer verification; never flips `worker_skills.verified` |
| **E** | Agency / coordinator | real agency/coordinator over the worker/brigade | agency `external_manager` engagement (or explicit `agency_coordinator`) | worker/brigade entries under a real agency relation | **employer_verified** (staffing triangle) |

**Core rule (binding):** the approval UI + audit row must always show *who · under what authority · for which context · what was confirmed*. An **observed** confirmation must read as client/observed, never as employer verification.

## 2. Current code flow + the mismatch (still true)
- **List (inbox):** `app/[locale]/dashboard/inbox/page.tsx` → RPC `reviewable_journal_entry_ids()`.
- **Actions:** `lib/journal/review-actions.ts` → `review_journal_entry` / `confirm_entry_and_verify_skills`; batch `review_journal_entries_batch` **delegates** to `review_journal_entry`.
- **Codes** (`20260530140000_membership_engagement_reroute.sql`): `not_authorized` (auth fails), `review_not_enabled` (`journal_review_enabled` false), `no_reviewer_engagement` (no active `manager/owner/external_manager` engagement in the org — **no `is_admin` bypass**).
- **Mismatch:** the **list** has an `is_admin()` shortcut the **action** lacks → the platform admin is *shown* entries the action refuses. Under the authority model, this is resolved not by deleting `is_admin` but by making **C a real authority** (the operator approves as `platform_operator`, recorded honestly), and aligning the list so *listed ⇒ confirmable-under-some-authority*.

## 3. What the current schema can represent (verified)
`journal_entry_confirmations` (migration `0013`, append-only):
```
confirmer_id                    uuid NOT NULL → profiles(id)
confirmer_engagement_context_id uuid NOT NULL → engagement_contexts(id)   ← HARD GATE
confirmer_role                  text NOT NULL  CHECK in ('manager','owner','external_manager')
confirmation_scope              jsonb NOT NULL                            ← flexible (good)
created_at                      timestamptz
```
- The CHECK (`20260602130000`, applied as ledger `20260611091834`) hard-locks `confirmer_role` to the 3 engagement roles.
- `confirmer_engagement_context_id` is **NOT NULL** → *every* confirmation must be anchored to an org engagement. **A confirmer with no engagement (platform operator, client, property owner) literally has no row they can insert.**
- Anchors that already exist (applied): `engagement_contexts` (A/B/E), `organizations` ownership, `projects` + **`project_clients` / `project_members` (owner/manager/member/viewer) / `project_worker_assignments`** (`20260531215058`), `booking_requests` (`20260613184106`), agency engagement provisioning (`provision_agency_worker_engagement_context` → agency coordinators as `external_manager`).
- Skill proof: `worker_skills.verified` is flipped to `manager_confirmed` **only** by the engagement-gated RPC. `journal_entry_skills` is evidence-only and can never set verified.
- A prior design doc already scopes the broad-confirmer work, privacy + minor-safety: `docs/design/universal-confirmation-roles-v1.md`.

**Read-only production verification (done, `gorgitwvdzxbnaxhrsrw`):**
- All engagement migrations applied (not a missing-migration issue).
- Active engagements: **15 employee · 7 owner · 0 manager · 0 external_manager** → the only reviewers today are the 7 org owners.
- Entries: total 19; org-scoped 12; review-enabled 11; **reviewable now = 1**; reviewable-but-no-reviewer-engagement = 0; orgless = 7; orgs with review open = 3.
- The one reviewable entry `cc5605b5-…` is in org `20b2c802-…` (1 owner-reviewer), but **admins_with_reviewer_eng_in_org = 0** (admin_count = 1) → the lone admin is shown an entry the action refuses. Confirmed cause.

## 4. Authority types: supported today vs needs additive work
| Authority | Supported **today**? | Gap |
|---|---|---|
| **A** Org engagement | ✅ Yes | none |
| **B** Multi-company | ✅ Schema yes (multiple engagements; the confirmation already records *which* engagement/org). | **UI only** — list already returns entries across every org the caller owns/manages; the inbox must **label each entry's company/context** and show the chosen context on confirm. **Code-only.** |
| **C** Platform operator | ❌ No | NOT NULL engagement + role CHECK block it. Needs additive schema (below). |
| **D** Client/project/property/observed | ❌ No | Needs authority + non-engagement anchor (project/booking/object or subject-granted link) + **observed proof tier** (must not flip `worker_skills.verified`) + scope vocabulary. Biggest privacy/anti-abuse surface. |
| **E** Agency/coordinator | 🟡 Partial | Covered when the coordinator holds an `external_manager` engagement (agency provisioning exists). Explicit `agency_coordinator` authority label = additive. |

## 5. Required audit-trail fields (the honesty contract)
Extend `journal_entry_confirmations` (additive) so every row carries **who · authority · context · what · when**:
- **who:** `confirmer_id` — *exists*.
- **authority:** `confirmer_authority` text, CHECK widened to `{org_owner, org_manager, external_manager, platform_operator, platform_owner, client, project_owner, property_owner, agency_coordinator, observer}` (replaces the 3-value lock). Keep recording the engagement `confirmer_role` where applicable.
- **context (for which company/project/client/property):** make `confirmer_engagement_context_id` **nullable**, and add `confirmer_context_kind` (`organization|project|booking|object|platform|observation`) + `confirmer_context_id` (uuid, nullable). A new CHECK guarantees **never a confirmer with no basis** (must have an engagement, OR a context anchor, OR platform authority).
- **what exactly:** `confirmation_scope` (jsonb, *exists*) standardized to include `scope ∈ {observed_work, quality_confirmation, hours_confirmation, project_completion, service_performed, skill_observed}` plus the existing action/decision/note.
- **proof tier:** `confirmation_tier` (`employer_verified | observed`). **Only `employer_verified` (engagement authority) may flip `worker_skills.verified`.** `observed` is evidence only — this is the structural guarantee that client/property confirmation never masquerades as employer verification.
- **when:** `created_at` — *exists*.

## 6. UI states + labels
- **A/B (employer):** "Patvirtinta — [Company] vadovas/savininkas" / "Confirmed — [Company] owner/manager". Multi-company: a context selector + visible "Approving as **[Company]**".
- **C (platform):** "Patvirtinta — platformos operatorius" / "Confirmed — platform operator". Distinct styling; never the company-manager label.
- **D (observed):** "Patvirtino užsakovas/objekto savininkas — *stebėtas darbas*" / "Confirmed by client/property owner — *observed work*", with the scope chip (observed/quality/hours/completion). Explicit *not employer verification* footnote.
- **E (agency):** "Patvirtino agentūros koordinatorius" / "Confirmed by agency coordinator".
- **Blocked:** keep #509 — no approve/reject/request-change buttons when the caller has no authority; one clear honest reason. Enforced by `lib/guards/production-reality-trust-p0.test.ts` + the existing `confirmation-honesty.test.ts`.

## 7. MVP — the smallest honest model (layered)
- **Layer 0 — code-only, now:** multi-company **context labels** in the inbox (the list already spans all owned/managed orgs; add the per-entry company label + "approving as [Company]" on confirm) + keep #509 honesty. **No schema. Safe now.** Delivers B's outcome.
- **Layer 1 — RED migration #1 (authority generalization, A/B/C):** add `confirmer_authority` (+widened CHECK), make `confirmer_engagement_context_id` nullable with a basis-CHECK, add `confirmation_tier`; generalize `review_journal_entry`→`can_confirm()` to record honest authority + context, and let `is_admin()` confirm **as `platform_operator`** (tier `employer_verified` only for the operator's managed contexts; else `observed`). Aligns list⇒action. Reversible. Covers A, B, C honestly.
- **Layer 2 — RED migration #2 (observed-work D + explicit agency E):** add `client/project_owner/property_owner/observer/agency_coordinator` authorities + the non-engagement anchor (project/booking/object or a subject-granted `confirmation_links` row) + the `scope` vocabulary, enforcing the **observed tier never flips `worker_skills.verified`**. Biggest privacy/anti-abuse design (lean on `universal-confirmation-roles-v1.md`).

## 8. What can be done now safely / what stays RED
- **Now (safe, ≤GREEN):** this audit; **Layer 0** code-only multi-company context labels; keep all confirmation-honesty guards green. No schema, no RPC, no prod mutation.
- **RED, owner-gated (Supabase MCP `apply_migration`, never `db push`):** Layer 1 (authority columns + CHECK replacement + nullable engagement + `can_confirm` RPC + platform-operator authority) and Layer 2 (observed/client/agency + anchors + scope + tier enforcement + RLS). Every confirmer-set widening **replaces** the `confirmer_role` CHECK in a dedicated migration.

## 9. Rollback plan
Each layer reversible and additive:
- **Layer 1:** restore the 3-value CHECK and `NOT NULL` on `confirmer_engagement_context_id` **after asserting** no row uses a new authority/null engagement; drop `confirmer_authority`/`confirmer_context_*`/`confirmation_tier`; `CREATE OR REPLACE` `can_confirm`/`review_journal_entry` back to current bodies (captured verbatim in the PR). `worker_skills` proof rows untouched.
- **Layer 2:** drop the new authorities from the CHECK and the anchor/link table only after asserting zero rows use them; observed rows are evidence, not proof, so removing them is a data decision documented in that PR.

## 10. GREEN / YELLOW / RED + next PR scope
- UI contradiction: **GREEN** (#509).
- A (org owner) approval: **GREEN today**.
- B (multi-company) display: **GREEN, code-only** (Layer 0) — *next implementation PR*.
- C (platform operator) honest approval: **RED** (Layer 1).
- D (client/property/observed): **RED** (Layer 2, largest).
- E (agency): **YELLOW** today via `external_manager`; explicit label **RED** (Layer 2).
- Migration/RPC/CHECK/RLS risk: **RED**, owner-gated apply via MCP, reversible.

**Recommended next implementation PR:** **Layer 0 — code-only multi-company context labels** in the inbox + confirm UI (no schema, safe now), landing B's "approve from one place, show which company" outcome. **Then** Layer 1 as the first RED migration PR (authority generalization for A/B/C, including the honest `platform_operator`), followed by Layer 2 (observed-work D + agency E). No migration is written in this readiness step.

---

## Appendix — exact read-only checks (SELECT-only, re-runnable)
```sql
-- (1) active engagement distribution
select relationship_slug, status, count(*)
from public.engagement_contexts group by 1,2 order by 3 desc;

-- (2) reviewable-entry reality
with rev as (
  select je.id entry_id, ec.organization_id org, ec.journal_review_enabled,
         exists (select 1 from public.journal_entry_confirmations c where c.entry_id = je.id) confirmed
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id)
select
  (select count(*) from public.journal_entries) total_entries,
  (select count(*) from rev where org is not null) org_scoped,
  (select count(*) from rev where org is not null and journal_review_enabled) review_enabled,
  (select count(*) from rev where org is not null and journal_review_enabled and not confirmed) reviewable_now,
  (select count(*) from rev r where org is not null and journal_review_enabled and not confirmed
     and not exists (select 1 from public.engagement_contexts m
       where m.organization_id=r.org and m.status='active'
         and m.relationship_slug in ('manager','owner','external_manager'))) reviewable_but_no_reviewer;

-- (3) admin vs reviewer-engagement for each reviewable entry's org
with admins as (
  select p.id profile_id from public.profiles p
  where p.active_role='admin'
     or exists (select 1 from public.profile_roles pr where pr.profile_id=p.id and pr.role='admin')),
reviewable as (
  select je.id entry_id, ec.organization_id org
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where ec.organization_id is not null and coalesce(ec.journal_review_enabled,false)
    and not exists (select 1 from public.journal_entry_confirmations c where c.entry_id=je.id))
select (select count(*) from admins) admin_count, r.entry_id, r.org,
  (select count(*) from public.engagement_contexts m where m.organization_id=r.org and m.status='active'
     and m.relationship_slug in ('manager','owner','external_manager')) org_reviewers,
  (select count(*) from admins a join public.engagement_contexts m on m.profile_id=a.profile_id
     where m.organization_id=r.org and m.status='active'
       and m.relationship_slug in ('manager','owner','external_manager')) admins_with_reviewer_eng_in_org
from reviewable r;

-- (4) confirmation authority shape today (read-only)
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema='public' and table_name='journal_entry_confirmations' order by ordinal_position;
```
