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

**Core rule (binding):** the **audit row** must always store *who · under what authority · for which context · what was confirmed*. An **observed** confirmation must be recorded as client/observed, never as employer verification.

> **Silent-trust rule (binding, owner — preserved):** Approval/confirmation data may be stored and used **internally** for ranking, trust, skill matching, and review logic, **but normal public user surfaces must not advertise approvals as public certification** unless the owner later explicitly approves a separate public trust model. Confirmations are collected **silently** as trust signals — they are not public-facing trust marketing text. The *who/authority/context/what* contract in this doc is an **audit-trail/storage** contract (review-only + internal logic), **not** a normal-user display contract.

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

## 6. Wording model — NEUTRAL CONTEXT ONLY (owner correction)
The internal authority model in §5 is **storage/review-only**. The **normal-user UI must never** carry approval-authority, verifier, or confirmed/verified badge wording. Layer 0 shows only **neutral context** so a reviewer can tell which entry belongs to which company/project — nothing that implies the platform publicly certifies a person.

**Forbidden (any served locale LT/EN/RU, normal-user/public UI):**
- "Tvirtinate kaip [Company] savininkas / vadovas", "Approving as [Company] owner/manager"
- "Patvirtino…", "Confirmed by…", "Patvirtino platformos operatorius / client / property owner / agency coordinator"
- "Employer verified", "Observed work confirmed", "Patvirtintas įgūdis", "Confirmed skill", "Verified"
- any public approval-authority label, verifier label, confirmed/verified label, trust badge, or text suggesting the platform publicly certifies the person.

**Allowed (neutral, private review/normal-user context):**
- "Įrašo kontekstas: [company/project/context]" / "Entry context: …" / "Контекст записи: …"
- "Susijusi įmonė: [company]" / "Related company: …" / "Связанная компания: …"
- "Susijęs projektas: [project]" / "Related project: …" / "Связанный проект: …"
- "Kontekstas dar nerodomas" / "Context not shown yet" / "Контекст пока не показан"
- "Veiksmas negalimas: trūksta teisės arba konteksto" / "Action unavailable: missing permission or context" / "Действие недоступно: нет прав или контекста"

**Layer 0 may show:** (1) which company/project/context an entry belongs to, *if already available*; (2) whether an action is available or blocked; (3) one neutral reason if blocked. **It must not show:** public approval-authority labels, verifier labels, confirmed/verified labels, trust badges, or any text implying public certification.

**Blocked state:** keep #509 — no approve/reject/request-change buttons when the caller has no authority/context; one neutral reason. Enforced by `lib/guards/production-reality-trust-p0.test.ts` + the existing `confirmation-honesty.test.ts` (and a new neutral-context guard for Layer 0).

## 6b. Existing-wording audit (served UI LT/EN/RU)
Searched the three served locales + the rendering components for `patvirtin*`, `tvirtin*`, `подтверж*`, `verified`, `confirmed`, `confirmation`, `proof`, `badge`, `trusted`, `observed`. Classification:

| Wording | Surface / component | Class | Action |
|---|---|---|---|
| `playerCard.verifiedTitle` "Patvirtinti įgūdžiai" / "Confirmed skills"; `playerCard.confirmed` "Patvirtinta" | Worker **player card** (`worker-player-card.tsx`), mounted on `/dashboard/journal` (the worker's own view) | **Normal-user (self) — verification badge.** Not public-to-others, but it *is* confirmed/verified badge language on a normal-user surface. | **Owner decision (gray zone):** keep as private self-view, or neutralize to evidence-strength wording. Per the silent-trust rule, lean toward neutral. **Not changed here.** |
| Market-map own-marker gold "✓ N" verified-skills badge (added #509) | `market-map-live.tsx`, `/dashboard/market-map` own marker (owner-scoped) | **Normal-user (self) — verification badge.** Visible only to the owner today, but if the player-card/marker is ever shown to scouts it becomes public certification. | **Owner decision (gray zone):** keep, or drop the ✓ badge / make it a neutral signal. **Not changed here.** |
| `trust.verifiedSkills`, `cvExport.verifiedSkills` "Patvirtinti įgūdžiai" | Dashboard profile TrustBlock + the worker's own `/cv` export | **Normal-user (self).** Same gray zone. | Owner decision; not changed here. |
| `journal.confirmedHeadline` "tavo darbas patvirtintas" / "your work was confirmed" | Journal this-week summary (`/dashboard/journal`, self) | **Normal-user (self) — confirmation phrasing.** | Owner decision; not changed here. |
| Admin matching/scouting "Confirmed skills / Manager confirmations" (≈ lines 1796–1827), manager review inbox confirm copy | `requireSuperadmin` admin/* + manager review `/dashboard/inbox` | **ADMIN / review-only — allowed.** | Keep. |
| `auth.company.verified` "Patvirtinta / Verified", admin company-verification | Company **identity** trust state (`auth.company.*`, admin company-verification) | **Company identity verification — separate concept** (a thing, not a person/skill certification). | Out of this rule's scope; flag for owner if a public company "Verified" badge should also be reconsidered. |
| "Laukia patvirtinimo", "Nepatvirtinta išoriškai", "Sistema nieko nepatvirtina automatiškai", "Dar nepatvirtinta" | profile/skill/journal honesty notes | **Honest negation — reassures, does not advertise a badge.** | Keep. |

**Finding:** there are **no public-to-third-party** certification badges today (no scouting/marketplace card advertises a worker as "Confirmed/Verified" to others). The open items are **normal-user self-view verification badges** (player card, map ✓ badge, trust block, CV, journal "confirmed" headline) — not public marketing, but they use confirmed/verified badge language on normal-user surfaces. Per the silent-trust rule these are a **gray zone for the owner to rule on**; they are **left unchanged in this readiness step** (no code change here).

## 7. MVP — the smallest honest model (layered)
- **Layer 0 — code-only, now (NEUTRAL CONTEXT ONLY):** in the **review** surface, label each entry with its **neutral context** — "Įrašo kontekstas / Susijusi įmonė / Susijęs projektas: [name]" when already available, "Kontekstas dar nerodomas" otherwise — and keep the #509 blocked state (action available or one neutral "trūksta teisės arba konteksto" reason). **No approval-authority labels, no verifier labels, no confirmed/verified labels, no trust badges. No schema/RLS/RPC change. No production mutation.** Delivers B's "which company/context" clarity *without* public certification.
- **Layer 1 — RED migration #1 (authority generalization, A/B/C):** add `confirmer_authority` (+widened CHECK), make `confirmer_engagement_context_id` nullable with a basis-CHECK, add `confirmation_tier`; generalize `review_journal_entry`→`can_confirm()` to record honest authority + context, and let `is_admin()` confirm **as `platform_operator`** (tier `employer_verified` only for the operator's managed contexts; else `observed`). Aligns list⇒action. Reversible. Covers A, B, C honestly.
- **Layer 2 — RED migration #2 (observed-work D + explicit agency E):** add `client/project_owner/property_owner/observer/agency_coordinator` authorities + the non-engagement anchor (project/booking/object or a subject-granted `confirmation_links` row) + the `scope` vocabulary, enforcing the **observed tier never flips `worker_skills.verified`**. Biggest privacy/anti-abuse design (lean on `universal-confirmation-roles-v1.md`).

## 8. What can be done now safely / what stays RED
- **Now (safe, ≤GREEN):** this audit; **Layer 0** code-only **neutral context labels** in the review surface (no approval/verifier/confirmed/verified wording, no badges); keep all confirmation-honesty guards green + add a neutral-context guard. No schema, no RPC, no prod mutation.
- **Owner decision (no code here):** the §6b gray-zone normal-user self-view verification badges (player card, map ✓ badge, trust block, CV, journal "confirmed" headline) — keep or neutralize. A separate cleanup wagon if the owner wants them removed/renamed.
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

**Recommended next implementation PR:** **Layer 0 — code-only NEUTRAL context labels** in the review surface (entry context / related company / related project, or "context not shown yet"; keep the #509 blocked state). **No approval-authority/verifier/confirmed/verified wording, no badges, no schema, no prod mutation** — safe to proceed. **Then** Layer 1 (RED migration: authority generalization A/B/C incl. honest `platform_operator` — storage/review-only, never public), then Layer 2 (observed-work D + agency E). No migration is written in this readiness step.

**Can Layer 0 proceed safely after this correction?** **Yes** — scoped to neutral context labels + the existing blocked state only: no approval-authority labels, no public verifier labels, no verification badges, no schema/RLS/RPC change, no production mutation, no merge/deploy. The §6b normal-user self-view badges are a separate owner decision and are untouched.

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
