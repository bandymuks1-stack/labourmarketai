# Duplication freeze register — 2026-08-17

Owner-gated record of KEEP-FROZEN decisions from the duplication
consolidation analysis (Train L; plan basis:
`docs/audits/full-reality-audit-2026-08-17.md` + live production SELECTs
against `gorgitwvdzxbnaxhrsrw` on 2026-08-17, read-only). "Frozen" means:
the schema object stays exactly as it is — **no drop, no new writers, no new
readers** — until an explicit owner decision. Schema removal is OWNER-GATED
for every item on this page; nothing here authorizes a drop.

Guard: `apps/web/lib/guards/consolidation-no-new-truth.test.ts` pins the
closed store sets recorded here. Widening any of its allowlists is an owner
consolidation decision, not an implementation detail.

Production evidence in this file was measured 2026-08-17 (read-only SELECTs)
and re-verified the same day by the implementing slice.

---

## §1 Membership truths — TWO tables, both stay, boundary enforced

| Store | Prod rows | Decision |
|---|---:|---|
| `company_memberships` | 14 (13 owner-active mirror + 1 manager-active) | **KEEP — canonical GOVERNANCE truth** (who may administer/act for an org; roles owner/admin/manager/external_manager/member) |
| `engagement_contexts` | 53 active (13 owner + 40 employee; 36 personal `organization_id NULL`, 17 org-bound) | **KEEP — canonical EMPLOYMENT truth** (who works where; feeds journal review, evidence, CV, work history) |

Boundary rules (guarded):
1. Authorization checks consult `company_memberships` (directly or via
   `membership_actor_role_v1` / `has_org_demand_access`); never
   `engagement_contexts` alone.
2. Journal/evidence/CV/work-history features consult `engagement_contexts`;
   never `company_memberships`.
3. Sanctioned dual-arm merge points, and ONLY these: `manages_organization`,
   `belongs_to_organization` (SQL); the workspace/managed-organization
   resolvers `lib/company/active-organization.ts` /
   `lib/company/managed-organizations.ts` (app). No new dual reads.
4. The durable workspace pointer (`20260817160000_durable_workspace_pointer_v2.sql`,
   PENDING APPLY BY LEAD) validates against BOTH truths.

Known prod asymmetries (deliberately NOT "fixed" in this slice; train L5
step 2 backfills after owner review): 3 org-bound EC rows without a CM
counterpart; 1 CM manager without an EC row; the 13 owner mirror pairs are
intentional (seed trigger + `ensure_org_owner_engagement`).

## §2 Invitation systems — THREE exist, converge in train L3, no fourth

| Store | Prod rows | Decision |
|---|---:|---|
| `invitations` (canonical token) | 0 (never used; 0 audit_logs actions) | **KEEP — canonical transport**; train L3 makes acceptance feed BOTH truths |
| `company_worker_invitations` | 5 (4 accepted + 1 pending — the only path ever used) | **KEEP-FROZEN legacy**: read-compatibility only; write redirect in L3; the 1 pending row must stay acceptable until consumed/expired |
| `agency_worker_invitations` | 0 | **KEEP-FROZEN legacy** (same as above) |
| `company_memberships status='invited'` (System C) | 1 invite / 1 accept ever | **KEEP**: in-app fast-path for existing users; L3 folds its invite form into `create_invitation_v1` |

No fourth invitation table, and no new caller of `invite_company_worker` /
`invite_agency_worker` (guarded).

## §3 Employment-record models — canonical = org-bound EC employee rows

| Store | Prod rows | Decision |
|---|---:|---|
| `engagement_contexts` employee rows | 40 | **CANONICAL employment record** (only model with live data, keyed to organizations/profiles, wired into the journal→evidence→CV loop) |
| `company_worker_engagements` | 0 | **KEEP-FROZEN as booking-provenance ledger**: minted ONLY by booking accept (`respond_booking_request_v3` family); never extended to other hire paths (guarded: SQL writer allowlist) |
| `company_workers` / `agency_workers` rosters | 4 / 0 | **KEEP-FROZEN legacy duplicate**: reads continue; ops-role / journal-review payload already lives on EC (`lib/operations/engagement-bridge.ts`); redirect + backfill in train L4 |

The no-direct-hire-path gap (three disjoint hire paths, three disjoint
capability sets) is train L4 scope (`respond_booking_request_v4` EC
provisioning + EC-arm authority widening) — NOT this slice.

## §4 Candidate-stage stores — the stage is DERIVED, never stored

Canonical lens: `lib/pipeline/candidate-pipeline.ts` (P4) — pure read-time
derivation over `demand_shortlist` (1 row), `demand_interest_signals` (4),
`booking_requests` (0), conversations. **No seventh store** (guarded:
migration scan for `pipeline_stage|candidate_stage|pipeline_status` +
closed `candidate_*` table set). Stores OUT of the candidate funnel by
design: `project_worker_operational_statuses` (post-hire ops),
`candidate_drafts` (manual pre-platform candidates, 2 rows). The admin
`lib/crm/pipeline.ts` leads-CRM is a DIFFERENT domain (sales leads, not
candidates) — do not conflate.

## §5 Frozen dead schema (all drops OWNER-GATED, none performed)

| Object | Evidence (2026-08-17) | Decision |
|---|---|---|
| `candidate_skills` | applied `20260610172251`, 0 rows; W5 slice 1 already removed every join | **KEEP-FROZEN + document.** Drop only in a future owner-approved cleanup migration |
| `job_demands` (+ its `matches` FK neighbourhood) | applied, 0 rows for its whole life; the canonical-demand legacy read arm was DELETED in this slice (code only) | **KEEP-FROZEN.** Remaining readers: `lib/market-map/project-results.ts` (the Goal 3 project list/evaluation — a live, wired feature whose data source is this empty table). Its removal is a market-map cleanup slice with screenshot proof (plan §5.4), deliberately NOT done here |
| `match_actions` + `matches` | 0 rows, ZERO writers repo-wide, readers: none (M4 matching never shipped) | **KEEP-FROZEN + document.** Guard `matching-ui-neutralized.test.ts` already pins "no migration drops" them; drop decision owner-gated, both tables together |
| `worker_skills.self_rated_level` | 0 of 48 rows non-null, zero writers; sole dead read DELETED in this slice | **NEVER WIRE** (conflicts with evidence-tier doctrine: "record count, never a competence score"). Column frozen; drop proposed for the same future cleanup migration as `candidate_skills` |
| LMC app layer (`lmc_*`) | tables applied `20260720190000`; all 0 rows except `lmc_settings` (6 flag rows, all false); `lib/billing/lmc-flags.ts` has zero importers | **KEEP-FROZEN — wire ONLY in the owner-gated Billing activation train.** Do NOT delete `lmc-flags.ts`: it is the documented single reader that train will need |
| `talent_source_records` / `identity_resolution_events` | tables DO NOT EXIST in prod (migration `20260713210000` never applied); consumer modules DELETED in this slice | **Migration file stays** (header-marked: consumers partially deleted, rework before any apply). `worker_external_profiles` consumers (`lib/worker/external-profiles*`) remain live + feature-detecting |
| `agency_candidate_offers` | 0 rows but fully wired (`lib/agency/bridge-actions.ts` → `submit_agency_candidate_offer_v1`, rendered on /dashboard/company) | **NOT dead — audit correction. KEEP wired, no action**; add to a future agency smoke |

## §6 Verification queries (run after each data-touching consolidation step)

```sql
-- invitation convergence: every accepted legacy invite has CM+EC
select count(*) from company_worker_invitations i where i.status='accepted'
 and not exists (select 1 from organizations o
   join company_memberships m on m.organization_id=o.id
   where o.legacy_company_id=i.company_id);

-- membership overlap: org-bound employees without CM should reach 0 (post-L5)
select count(*) from engagement_contexts e
 where e.status='active' and e.organization_id is not null
   and not exists (select 1 from company_memberships m
     where m.organization_id=e.organization_id
       and m.profile_id=e.profile_id and m.status='active');

-- employment: every active CWE row has an org-bound EC employee row (post-L4)
select count(*) from company_worker_engagements w where w.status='active'
 and not exists (select 1 from engagement_contexts e
   join workers wk on wk.profile_id=e.profile_id
   join organizations o on o.id=e.organization_id
   where wk.id=w.worker_id and o.legacy_company_id=w.company_id
     and e.status='active');
```

All three must reach 0 at end-state; none may be "fixed" by deleting rows.
