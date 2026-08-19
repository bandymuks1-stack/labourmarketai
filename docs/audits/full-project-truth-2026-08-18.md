# LABOURMARKET.AI — FULL PROJECT TRUTH REPORT

> ## ⚠️ CORRECTIONS ISSUED 2026-08-18 (same day) — READ BEFORE THE BODY
>
> Four findings below were checked by follow-up trains and **three did not survive**.
> They are corrected here rather than quietly edited out, because the body text is
> what a later session would otherwise trust.
>
> **C-01 — the report's #1 finding was WRONG.** §A.2 and §I claim
> `vacancy-read.ts` "has zero importers" and that no page renders the supply.
> **False, and the cause was a methodological error in this report**: the grep used
> `grep -v "lib/vacancy-store"`, which filtered out the very import lines that
> prove the chain. Members DO reach the vacancies today:
> `dashboard/opportunities/page.tsx` → `components/app/external-vacancies-section.tsx`
> → `lib/opportunities/external-vacancies.ts:33` → `searchPublicVacancies` (called
> at :103 and :147). **The real gap was always ANONYMOUS / SEO access** — the table
> grants SELECT to `authenticated` only. That gap is real, was the right thing to
> fix, and is now closed by PR #1184 (public projection, proven in production).
> The correct status for member-facing job browsing is IMPLEMENTED_NOT_PROVEN
> (production usage unproven at 36 users), not MISSING.
>
> **C-02 — "matching has never produced a row" is misleading.** `matches` = 0 is
> CORRECT BEHAVIOUR, not a defect: `lib/matching/match-v1.ts` computes matches at
> read time and deliberately never persists them (doctrine §19(d)). Status should
> be read as "not persisted by design", not "never worked".
>
> **C-03 — `vecticum` is NOT accidental contamination.** §L guessed
> "ACCIDENTAL_CONTAMINATION (probable)". It is `SOURCE_PROVENANCE`: the migration
> line is a design-rationale comment citing a competitor audit. Remedy remains
> documentation-only (never edit an applied migration). Likewise `wavi` needs no
> owner review — 11 of 13 hits are the cross-project "do not touch Vismantas"
> scope guard. **User-visible brand contamination is 0**, not "needs review".
>
> **C-04 — one NEW defect this report missed entirely**, found by the spec train:
> **timesheets can never produce a line.** Their only source table,
> `journal_entry_work_items`, has ZERO writers anywhere in the codebase. The
> feature is structurally inert, not merely unused.
>
> Everything else in this report was re-checked and stands, including the
> production counts, the auth verdict, the payments verdict, the avatar verdict,
> the rolled-back #1182 E2E finding, and the stale `APPLIED_LEDGER`.


> ## ⚠️ CORRECTIONS ISSUED 2026-08-19 (next day) — READ BEFORE THE BODY
>
> Eight PRs merged after the corrections above (#1196–#1203). They falsified five
> more statements in this body. Same rule as the 2026-08-18 block: corrected here
> rather than quietly edited out, because the body is what a later session trusts.
> Every number below is DB_PROVEN — `count(*)` against `gorgitwvdzxbnaxhrsrw` on
> **2026-08-19 10:36 UTC**, not an estimate and not carried forward from yesterday.
>
> **C-05 — every supply number in §I has moved, and one of them was never right.**
> Re-measured today:
>
> | §I metric | Reported 2026-08-18 | Actual 2026-08-19 |
> |---|---|---|
> | Total vacancies | 44,113 | **46,396** |
> | Active | 43,952 | **46,208** |
> | Active **and unexpired** (browsable) | 38,142 | **39,743** |
> | Distinct employers | 8,124 (all rows) | **7,765** (browsable rows) |
> | Classified to a profession | 18,315 | **17,145** (browsable) |
> | Newest published | 2026-08-18 | **2026-08-19 07:43 UTC** |
>
> The employer figure is not a drop — it is a different question. 8,124 counted
> distinct names across EVERY row including expired ones; 7,765 counts them across
> the rows a visitor can actually browse. Only the second number can back a public
> claim, which is what PR #1196 established.
>
> **C-06 — §I's "blocking defect" is closed, and §A.2's version of it was already
> withdrawn by C-01.** `vacancy-read.ts` now has three non-test importers:
> `external-vacancies.ts` (the member board), `(marketing)/jobs/[id]/page.tsx` and
> `(marketing)/jobs/page.tsx`. Anonymous access — the gap C-01 identified as the
> real one — is served by the SECURITY DEFINER preview functions. The supply is no
> longer "jobs that no worker and no search engine can see": it is publicly
> browsable, indexable, and a signed-in worker can now keep one (#1202/#1203).
>
> **C-07 — the landing constant named in §I is superseded, and the old floors were
> false.** `SWEDEN_COVERAGE_2026_08_17` → `SWEDEN_COVERAGE_2026_08_19`. §I is
> right that the band renders a PINNED number rather than a live count (the values
> are literal strings in the frozen landing locale files, by design). What §I could
> not know is that the pinned floors were **wrong**: "41 000+ vacancies" and
> "7 600+ employers" did not hold on four of the five measured days. PR #1196
> re-based them on a five-day measured trough (37,105 browsable / 7,252 employers)
> and shipped 35 000+ / 7 000+ across all eleven locales — a claim the supply
> supports on its worst measured day, not its best.
>
> **C-08 — §G's "the router does not need more building" understated it; four
> defects were found in the runtime it praises.** Fixed in #1197–#1200:
> every task declared a cost ceiling and **none of them could fire** (the check ran
> before tier resolution and priced a tier alias, not a concrete model — so a GPT
> run was judged at Anthropic rates); dispatch was chosen by TRANSPORT, so an xAI
> payload would have been sent to `api.openai.com` under `OPENAI_API_KEY`; and
> there was no data-egress boundary at all. There is now a versioned model
> registry (adding a provider is registry data, not new code — Qwen is registered
> and `enabled: false` pending prices), a provider→adapter map, and a
> default-deny egress gate: an external provider receives PUBLIC data only unless
> an explicit grant exists, and `AI_EGRESS_GRANTS` is empty. §G's headline finding
> stands unchanged: **0 runs, 0 cost events — the chain has still never served a
> request.** Switching it on remains owner-gated (a provider key + `AI_PROVIDER_MODE`).
>
> **C-09 — this report's own §A/§N `ai_runs` claim was already false when written.**
> Corrected in #1201 across ten places: `ai_runs` has been applied in production
> since **2026-08-03**, not "unapplied". The table being EMPTY (C-08) and the table
> being ABSENT are different facts, and only the first one is true.
>
> Everything else in the body was re-checked against production and stands —
> including the payments verdict (still cannot take money), the auth verdict, the
> `worker_absence_scheduling` advisor ERROR (still the only one, still
> pre-existing), and the go-live blockers in §Q that remain owner-gated.


> ## ⚠️ CORRECTIONS ISSUED 2026-08-19, SECOND PASS (11:55 UTC) — READ BEFORE THE BODY
>
> Same rule as the two blocks above: corrected here rather than quietly edited
> out, because the body is what a later session trusts. Every number is a
> production read against `gorgitwvdzxbnaxhrsrw` taken **2026-08-19 between 10:56
> and 11:55 UTC**, or a merged PR named by number.
>
> **C-10 — the matrix had no row for the defect that mattered most, and it was in
> the data the whole time.** `demand_interest_signals` held **4 live rows**,
> written **2026-07-05** by workers who read a company's demand and raised their
> hand. `notification_events` held **0 rows and 0 lifetime inserts**, and there
> was **no emitter for demand interest anywhere in the codebase** — bookings,
> engagements, absences, workflows, documents and work tasks each had one; the
> single event the marketplace exists for did not. A demand owner learned a
> candidate existed only by opening `/dashboard/company/scouting` unprompted, and
> the worker learned the company had reviewed them only by returning to the
> opportunities board and looking — `loadWorkerOpportunities` passes their own
> signal status through and `WorkerInterestButton` already renders a distinct
> `reviewed` state, so the visibility existed; what did not exist on either side
> was anything that REACHES the person. The defect was the absence of a
> proactive channel, not the absence of the information.
>
> The repo had already NAMED this gap and deferred it. `lib/notifications/spine-signals.ts`:
> *"Deferred (no honest backing yet): contacted-conversation / interest-response
> signals — no seen-model exists for interest signals, so a count could never
> clear by visiting."* That reasoning is right about a derived COUNT and is
> exactly what a durable row solves, because a stored event clears by being
> marked read rather than by visiting. The deferred signal never needed a
> seen-model; it needed the other channel.
>
> **CLOSED by #1206** (merged 2026-08-19 11:38 UTC). `demand_interest_expressed`
> → the demand owner; `demand_interest_reviewed` → the worker. Recipients are
> resolved from the signal's own rows and are exactly whom the signal's existing
> RLS policy already admits, so nothing is disclosed that was not already
> readable. Migration `20260819110000_notification_events_v5_demand_interest`
> **APPLIED TO PRODUCTION 2026-08-19 11:37 UTC**, verified by reading both
> constraint definitions back (all 17 prior event types and 8 prior entity types
> intact). Rollback:
> `supabase/rollbacks/20260819110000_notification_events_v5_demand_interest.down.sql`.
>
> Two things this deliberately does NOT do, both pinned by guards: `contacted`
> emits nothing (that status is set only after a real conversation thread exists,
> which already reaches the worker as a message), and shortlist emits nothing (an
> employer-internal judgement including rejection is a product decision, not a gap
> to close silently).
>
> **Status: the four existing signals remain unnotified.** Emitting for them would
> be true — all four are still `interested`, all four demands still `submitted` —
> but it is a DML write landing in two real people's notification bells about
> something six weeks old. **OWNER DECISION**, deliberately not taken
> autonomously. Note for whoever decides: **2 of the 4 are self-interest** (the
> same person owns the demand and the worker row), so a backfill should cover the
> other two only.
>
> **C-11 — §B's "Matching · IMPLEMENTED_NOT_PROVEN · never produced a row" is
> still misleading, and C-02 above did not go far enough.** C-02 correctly said
> `matches = 0` is by design. The stronger fact, checked today: `matches` and
> `job_demands` have **no writer and no reader anywhere** — not in `apps/web`
> (they appear only in the generated `lib/supabase/types.ts`), and not in any
> database function (`pg_proc.prosrc` scanned for inserts into either: **zero
> hits**). They are vestigial tables. The live engine is
> `lib/market/match-v1.ts` → `matchWorkerToNeed`, called at read time by scouting,
> the opportunities board and external vacancies — and it **has run in
> production**: all four `demand_interest_signals` rows carry a stored
> `match_snapshot` computed by it. Matching is PROVEN; the zero row count
> describes two dead tables, not the feature. (C-02's file path is also wrong —
> it is `lib/market/match-v1.ts`, not `lib/matching/`.)
>
> **C-12 — §G says the AI chain "has never served a request"; the sharper
> statement is that it currently CANNOT, for two independent reasons.** First,
> every provider adapter is env-gated (`AI_LOCAL_ENABLED`, `AI_DEEPL_ENABLED` +
> `DEEPL_API_KEY`, and the cloud keys), so enabling any of them is an owner action
> on secrets — RED class, not something an agent may do. Second, and independently
> of any key: `TASK_SENSITIVITY` in `lib/ai/runtime/data-sensitivity.ts` classes
> **no task as `PUBLIC`**, and under the egress gate added by #1200 an external
> provider receives PUBLIC only. So even with a cloud key set, every one of the
> ten task types would still be local-or-nothing. **What actually unblocks a first
> production run** is therefore either (a) an owner-set local model endpoint, or
> (b) a task genuinely classifiable as PUBLIC. A published external job ad is the
> obvious candidate for (b) — it is already public at the source — and would also
> address §A.5, since 100% of supply is Swedish in a product with no Swedish UI.
> Neither is claimed as done here.
>
> **C-13 — the public board could only be searched in Swedish.** `/jobs` free-text
> search matches `title_raw` / `description_raw`, i.e. the publisher's own words,
> against a supply that is 100% Swedish — so a Lithuanian worker typing
> *suvirintojas* got zero results while **252** ads classified `welder` sat in the
> table. Every piece to fix it existed and was unused:
> `search_public_vacancy_previews_v1` has taken `p_profession_slug` since it
> shipped, `searchPublicVacancyPreviews` forwards it, **17,145** browsable rows
> carry a derived slug, and all **49** professions are named in all five active
> locales. The board never passed the argument. Also unused: `sourceLanguage` is
> in the anonymous projection and no surface set `lang` on the publisher's text,
> so a screen reader spoke Swedish with the reader's phonetics.
>
> **Authored in #1208 and PARKED — not merged.** `product-gate` blocks it because
> the `/jobs` waiver `public-acquisition-route-jobs` lists PRs 1184, 1193 and
> 1203, and adding a PR number to that record is an owner decision by its own
> history. Evidence posted on the PR, produced by running the gate rather than
> reasoning about it: the same head passes as PR 1203 and, as PR 1208, all 24
> findings are rejected **solely** for `pr-not-covered` — the diff adds zero new
> findings.
>
> **Standing consequence worth naming:** every future improvement to `/jobs`,
> `/jobs/[id]` or the vacancy card hits this same gate and needs a fresh owner
> line. The waiver's own `resolvedBy` says the real fix is teaching the gate that
> a pre-auth public acquisition route is its own category — a constitution change,
> and therefore also an owner decision.
>
> **C-15 — a verification method used in this repo produces FALSE NEGATIVES on
> column-level grants.** The #1203 ledger entry records, as a virtue, that
> "GRANTS proven by `has_function_privilege`/`has_table_privilege`, not by
> reading the diff". That is the right instinct and the wrong function for one
> case. `has_table_privilege('authenticated', 'public.notification_events',
> 'UPDATE')` returns **false** — while
> `has_column_privilege('authenticated', 'public.notification_events',
> 'read_at', 'UPDATE')` returns **true**. Both are correct: `notification_events`
> was deliberately granted UPDATE on the `read_at` COLUMN only, so a crafted
> request can move a read marker and nothing else.
>
> Read with the table-level function alone, the evidence says "mark-all-read
> cannot work, `authenticated` has no UPDATE" — which is false, and the obvious
> "fix" would be a RED grant migration that production does not need. This was
> caught today only because the applied statement was pulled from
> `supabase_migrations.schema_migrations.statements` and read directly. **When a
> grant is column-scoped, `has_column_privilege` is the only honest check.**
> `notification_events` is verified correct: `read_at` UPDATE true;
> `event_type` and `recipient_profile_id` UPDATE **false**; INSERT false; SELECT
> true; RLS on with own-rows-only SELECT and UPDATE policies.

> **C-14 — the public-vacancy bookmark still has no real user.**
> `worker_saved_opportunities`: **0 live rows** (7 inserted, 5 deleted lifetime —
> all verification traffic). The #1204 matrix row is right to say
> IMPLEMENTED_NOT_PROVEN and it stays there.
>
> **C-16 — finding #11 is still true, and worse than it said.** §A.11 called
> `APPLIED_LEDGER.md` "materially and dangerously stale", with "at least six
> migrations that ARE applied still reading PENDING APPLY". Re-measured today by
> matching every ledger entry's own filename stem against
> `supabase_migrations.schema_migrations.name` (228 applied rows, read 12:08
> UTC — matching on `name`, never on `version`, which is the rule the ledger
> itself states): **26 entries claim PENDING APPLY for migrations that are
> applied.** 24 match a production name exactly; 2 more
> (`notification_events_v3_workflow_types`, `notification_document_types_v3`)
> were applied together under the combined name
> `notification_types_union_workflow_document_v3`, proven by content — the live
> `notification_events_type_check` admits exactly the seven workflow/document
> types those two files add.
>
> Corrected with a header block at the top of `APPLIED_LEDGER.md` rather than by
> rewriting 26 carefully-written records, which is the convention this report
> itself uses. The method is written down there so the next session can re-run
> it instead of believing it. Every other ledger row's status was checked the
> same way and is consistent with production.
>
> Why this one matters more than a documentation tidy: a session trusting those
> rows believes shipped features are switched off, and may try to apply them
> again — which is the exact re-run hazard that makes `db push` forbidden here.

> Everything else in the body and in the two blocks above was re-checked and
> stands, including the payments verdict, the auth verdict and the §Q go-live
> blockers.


**Date:** 2026-08-18
**Baseline audited:** `origin/main` @ `49734c63` (PR #1182)
**Production DB:** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai, eu-west-1, ACTIVE_HEALTHY)
**Production web:** https://labourmarket.ai — LIVE (`/lt` → HTTP 200)
**Method:** code truth (git), database truth (live production SQL), production truth (HTTP + pg_stat), compared against the inherited train report.

> **Evidence rule used throughout:** a capability is only called verified if a real production
> artefact proves it. Row counts below are exact `count(*)` against production, not estimates.

---

## PRE-FLIGHT / PATH GUARD (run before any file change)

| Value | Result |
|---|---|
| EXPECTED_PROJECT | LABOURMARKET.AI |
| EXPECTED_CANONICAL_ROOT | `C:\Users\Mano\Documents\labourmarketai` |
| ACTUAL_REPO_ROOT | `C:/Users/Mano/Documents/labourmarketai` ✅ |
| REMOTE | `https://github.com/bandymuks1-stack/labourmarketai.git` ✅ |
| HEAD (canonical tree) | `main` @ `6e50df3f` — **195 commits behind `origin/main`** ⚠️ |

**The canonical tree is stale and must not be audited from.** It sits at the exact SHA recorded as
stale on 2026-08-09. This audit was performed in a clean worktree pinned to `origin/main`
(`labourmarketai-wt/truth-audit-0818`). Any session reading working files from
`Documents\labourmarketai` will report already-fixed bugs as live defects.

---

## A. EXECUTIVE TRUTH

1. **The platform is live, technically sound, and has almost no users.** 36 profiles total, 29
   onboarded, 13 organizations, 10 companies. This is a pre-launch system, not an operating business.
2. **The single biggest asset in the system is invisible to every user.** 44,113 real Swedish
   vacancies are live and were refreshed **today at 05:44 UTC** — and **no user-facing page renders
   them.** The read layer (`searchPublicVacancies`, `getPublicVacancy`) exists and has **zero
   importers** outside its own directory. See §I — this is the #1 finding of this audit.
3. **The job supply is also legally invisible to search engines.** `public_vacancies` RLS grants
   SELECT to `authenticated` only; there is no `anon` policy. 44k jobs generate **zero** SEO or
   acquisition value.
4. **Job supply is one country and one provider.** 100% `arbetsformedlingen` (Swedish public
   employment service), 100% `country = SE`. There is no second market.
5. **Sweden is not a served locale.** Active UI locales are `lt, en, ru, nl, de`; default is `lt`.
   All 44,113 jobs are Swedish, in a product that does not present a Swedish UI. Supply and demand
   markets do not overlap.
6. **We cannot take money today.** `billing_customers` = 0, `billing_subscriptions` = 0,
   `subscriptions` = 0, `payment_webhook_events` = 0. Lifetime inserts on `billing_subscriptions` = 1,
   rolled back. The only implemented provider is `stripe-test`. **No payment has ever been taken.**
7. **No AI has ever run in production.** `ai_runs` = 0 rows, 0 lifetime inserts. `usage_cost_events`
   = 0. The provider chain is well-built (free-first ordering, local-model support, honest
   degradation) but has never served a single production request.
8. **Auth is two providers, both genuinely working.** Email (32 identities, 29 confirmed) and Google
   (8 identities, 8 confirmed, last login 2026-08-08). **Facebook, LinkedIn and Instagram do not
   exist in code at all** — not configured-but-unproven, simply absent.
9. **The avatar/profile-card concept is real and works.** 7 objects in `profile-avatars`, newest
   2026-08-07; all 6 `avatar_url` values are storage paths, not copied Google URLs. Upload → storage
   → DB reference is proven in production. (See §D for what remains unproven.)
10. **The inherited #1182 checkpoint is TRUE, and cleaner than it claimed.** The production E2E did
    run: 4 `workflow_instances`, 4 `workflow_instance_steps`, 10 `workflow_transitions` inserted
    lifetime — then rolled back (0 deleted, 0 live). It exercised production and left no synthetic
    data. Its migration (`workflow_template_management_v1`) is genuinely applied.
11. **`APPLIED_LEDGER.md` is materially and dangerously stale.** 43 entries still read
    `PENDING APPLY` / `Deferred`, including at least six migrations that **are applied in
    production** (`workflow_template_management_v1`, `timesheets_v1`, `employee_lifecycle_v1`,
    `work_objects_v1`, `durable_workspace_pointer_v2`, `work_tasks_v2_collaboration`). A session
    trusting the ledger will believe shipped features are switched off.
12. **The operational depth built in the last train is entirely unexercised.** Timesheets,
    employee requests, agreements, procurement, business trips, training, performance reviews,
    management decisions, onboarding/offboarding, documents: **all 0 rows in production.**
    16 workflow templates are installed and 0 workflow instances are live.
13. **Matching has never produced a row.** `matches` = 0, `job_demands` = 0. The marketplace's
    core promise has no production instance.
14. **Notifications have never fired.** `notification_events` = 0 rows, 0 lifetime inserts.
15. **Telemetry does exist and works** — `pilot_events` = 1,332 rows. Analytics is not a blank slate.
16. **Employer-side real usage is thin but non-zero.** 17 customer requests, 14 company memberships,
    53 engagement contexts, 36 journal entries, 46 journal-entry skills, 12 confirmations. The Work
    Journal loop has genuinely been used by real people.
17. **Security posture is deliberate and strong, with 3 real items.** 365 advisors: 353 are
    "signed-in user can execute SECURITY DEFINER" which is the intended RPC-only write architecture.
    Real items: 1 ERROR (`worker_absence_scheduling` is a SECURITY DEFINER **view**), leaked-password
    protection disabled, and long OTP expiry. The 4 anon-executable definer functions are the
    intended public surfaces (business profile, public company-need intake).
18. **Locale claims outrun locale reality.** 11 catalogue locales exist but only 5 are routable.
    The 6 inactive ones (`lv, et, da, no, sv, pl`) carry 3,923 keys vs 9,732 for active ones — ~40%.
    They are correctly not routed, so this is honest, not broken.
19. **Repository is heavy:** 436 MB pack, 4,540 tracked files, 774 docs markdown files, 512 PNGs,
    **28 stale worktrees** still registered (the inherited report said 9).
20. **Can we invite the public today? No — but the gap is small and specific.** The product works,
    the supply is real and fresh. What is missing is the 200-line seam between them: a page that
    lists jobs. That is the fastest path to a real business, not another feature train.

---

## B. PRODUCT COMPLETENESS MATRIX (condensed to material rows)

| Capability | Code | DB | Production evidence | Status |
|---|---|---|---|---|
| Public marketplace / job browsing | read layer exists, **no UI consumer** | 44,113 rows | none — no page renders jobs | **MISSING (surface)** |
| Job ingestion (Sweden) | `vacancy-runner`, `vacancy-sources` | 44,113 | refreshed 2026-08-18 05:44 UTC | **VERIFIED_PRODUCTION** |
| Job supply, other markets | provider registry | 0 | none | **MISSING** |
| Registration / email auth | yes | 36 profiles | 32 identities, 29 confirmed | **VERIFIED_PRODUCTION** |
| Google OAuth | `google-button.tsx` | — | 8 identities, last login 2026-08-08 | **VERIFIED_PRODUCTION** |
| Facebook / LinkedIn / Instagram auth | absent | — | 0 identities ever | **MISSING** |
| Avatar upload → storage → render | yes | 6 refs | 7 storage objects, newest 2026-08-07 | **VERIFIED_PRODUCTION** (render/delete/mobile unproven) |
| Profile completeness metric | deliberately unwritten | all 0 | n/a — "no fake score" by design | **NOT_REQUIRED (by doctrine)** |
| Work Journal | yes | 36 entries | 46 skills, 12 confirmations, 8 photos | **VERIFIED_PRODUCTION** |
| Matching | yes | 0 | never produced a row | **IMPLEMENTED_NOT_PROVEN** |
| Workflow & approval engine | yes | 16 templates | E2E run + rolled back; 0 live instances | **VERIFIED_TEST_ENVIRONMENT** |
| Timesheets | yes | 0 | none | **IMPLEMENTED_NOT_PROVEN** |
| Employee requests / lifecycle / agreements / procurement / trips / training / reviews / decisions | yes | 0 each | none | **IMPLEMENTED_NOT_PROVEN** |
| Documents + acknowledgements | yes | 0 | none | **IMPLEMENTED_NOT_PROVEN** |
| Notifications | yes | 0 | never fired | **IMPLEMENTED_NOT_PROVEN** |
| Payments | `stripe-test` only | 0 | 1 rolled-back insert | **PARTIAL (test-only)** |
| AI assistance | full provider chain | 0 runs | never invoked in production | **IMPLEMENTED_NOT_PROVEN** |
| Telemetry | yes | 1,332 events | live | **VERIFIED_PRODUCTION** |
| Localization (lt/en/ru/nl/de) | 9,732 keys each | — | site serves `/lt` 200 | **VERIFIED_PRODUCTION** |

**Honest completeness split** (no single blended percentage — the weightings differ):
- **Implementation completeness: high.** Nearly every intended capability has code, schema, RLS, guards and rollbacks.
- **Production verification completeness: low.** Most modules have zero production rows.
- **Public-launch readiness: blocked** on one surface gap (jobs UI) + payments.
- **Business-loop readiness: not started.** No matching, no payment, no acquisition channel.
- **Autonomous-growth readiness: not started.**

---

## C. PRODUCTION JOURNEY MATRIX

| Journey | Status | Evidence |
|---|---|---|
| Worker: register (email) | VERIFIED_PRODUCTION | 29 confirmed users |
| Worker: register (Google) | VERIFIED_PRODUCTION | 8 identities |
| Worker: upload avatar | VERIFIED_PRODUCTION | 7 storage objects |
| Worker: write journal entry | VERIFIED_PRODUCTION | 36 entries, 8 photos |
| Worker: get skills confirmed | VERIFIED_PRODUCTION | 12 confirmations |
| Worker: **browse jobs** | **MISSING** | no route, no consumer |
| Worker: apply to a job | MISSING | `matches` = 0 |
| Worker: receive AI value | IMPLEMENTED_NOT_PROVEN | `ai_runs` = 0 |
| Employer: create organization | VERIFIED_PRODUCTION | 13 orgs, 14 memberships |
| Employer: post demand | PARTIAL | 17 customer_requests, `job_demands` = 0 |
| Employer: approve a request | VERIFIED_TEST_ENVIRONMENT | rolled-back E2E only |
| Employer: pay | BROKEN/MISSING | no live provider |
| Admin: verify company / view telemetry | IMPLEMENTED_NOT_PROVEN (UI unbrowsed) | routes exist |

*Not yet browser-verified this train:* approvals admin UI, timesheet UI, mobile widths, UX coherence.
These remain open from the inherited train and are listed in §Q.

---

## D. AVATAR / PROFILE VERDICT — **WORKS**

The concept was genuinely completed, contrary to the doubt in the brief.

- `profile-avatars` bucket (private): **7 objects**, newest **2026-08-07**.
- 6 profiles carry `avatar_url`; **all 6 are storage paths** (min length 84), not
  `lh3.googleusercontent.com` URLs. The upload path was really used — this is not OAuth
  picture passthrough.
- Chain proven: upload → private bucket → DB reference.

**Unproven (not broken — untested):** render at each surface, replace, delete, logout/login
persistence, mobile, and the employer-visible vs worker-visible representation. The premium
player-card presentation was not visually verified this train.

**`profile_completeness` is 0 for all 36 workers and `headline` is null for all 36** — this is
**by design**, not a defect: product code never writes those columns ("no fake score", enforced by
`worker-work-card-migration.test.ts`). A real completeness signal therefore does not exist as a
metric.

---

## E. AUTH VERDICT (per provider)

| Provider | Status | Evidence |
|---|---|---|
| Email / password | **VERIFIED_PRODUCTION** | 32 identities, 29 confirmed, last login 2026-08-10 |
| Google | **VERIFIED_PRODUCTION** | 8 identities, 8 confirmed, last login 2026-08-08, single `signInWithOAuth` PKCE same-tab flow |
| Facebook | **MISSING** | no code, no identity ever |
| LinkedIn | **MISSING** | no code, no identity ever |
| Instagram | **NOT_APPROPRIATE** | Instagram provides no general-purpose third-party login for this use case; it should not be treated as a peer of Google/Facebook |
| Apple / Azure | **MISSING** | no code |

Two auth hardening items are owner-fixable in the Supabase dashboard: **leaked-password protection
is disabled** and **OTP expiry is long**.

---

## F. PAYMENTS VERDICT — **CANNOT TAKE MONEY**

- Provider implemented: **`stripe-test` only** (`lib/billing/providers/stripe-test.ts`), plus a
  `/api/billing/test-checkout` route. Config demands `BILLING_PROVIDER=stripe` + `STRIPE_MODE=test`
  + `sk_test_` + `whsec_`.
- Production reality: `billing_customers` 0, `billing_subscriptions` 0 live (1 lifetime insert,
  rolled back), `subscriptions` 0, `payment_webhook_events` 0.
- `plans` table has 4 rows — prices exist as data, entitlements do not activate for anyone.
- Webhook, portal and checkout routes exist; none has processed a real event.

**Verdict: PARTIAL / test-only. No real money path exists.** Live payments require an owner action
(§R) — creating a live Stripe account and supplying live keys. That is an owner-gated step and was
not taken.

---

## G. AI PROVIDER MATRIX

**Existing:** a genuinely good router — `provider-chain.ts` orders candidates **cost-class first**
(free local → free cloud tier → metered), supports a **keyless local runtime** (Ollama/LM Studio/any
OpenAI-compatible server), enforces data-sensitivity eligibility per provider, and degrades to one
of three honest outcomes (provider / deterministic path / `unavailable` with reasons). Adapters
include Anthropic. `ai_runs` audit persistence is best-effort with an explicit warning when it does
not land.

**Production truth: 0 runs, 0 cost events.** The chain has never served a request.

**Legitimate low-cost options to prioritise** (categories per brief): self-hostable open-weight
models on the operator's own machine (category D — already structurally supported, unused);
free-tier cloud APIs with published limits (category B); metered APIs for the small set of tasks
that need quality (category C). Explicitly rejected: scraping a consumer AI chat interface to avoid
API pricing (category E is not an API).

**Recommendation:** the router does not need more building. It needs to be switched on for one
task with one provider, so `ai_runs` stops being empty.

---

## H. DATA SOURCE MATRIX

| Source | Type | Market | Status |
|---|---|---|---|
| `arbetsformedlingen` (snapshot + stream) | official public employment service API | SE | **LIVE** — 44,113 rows, refreshed daily |
| Everything else | — | — | **MISSING** |
| `market_intelligence_sources` registry | governance registry | — | 7 registered sources, external ones ship `activation=off` and require owner approval |

The governance model is correct and safe: a number cannot exist in the intelligence layer without a
registered source, and external sources are owner-gated by CHECK constraint.

**The gap is breadth, not machinery.** One provider, one country. The highest-value legitimate
additions are other national public employment services and open-data job feeds (official API and
documented feed first), which fit the existing provider-registry abstraction. A concrete
country-by-country candidate matrix was **not** completed this train — it is the largest remaining
research item and is listed in §R/§S rather than guessed at here.

---

## I. JOB SUPPLY TRUTH — **REAL, FRESH, AND UNUSED**

| Metric | Value |
|---|---|
| Total vacancies | **44,113** |
| Active | 43,952 |
| Active **and unexpired** | **38,142** |
| Distinct employers | **8,124** |
| With application URL | 44,113 (**100%**) |
| With salary data | **0 (0%)** |
| Classified to a profession | 18,315 (**41.5%**) |
| Countries | **SE only** |
| Providers | **`arbetsformedlingen` only** |
| Newest published | 2026-08-18 (today) |
| Last ingestion | 2026-08-18 05:44 UTC |
| Lifetime inserts | 46,370 |

**The blocking defect:** `apps/web/lib/vacancy-store/vacancy-read.ts` exports a complete search API
(`searchPublicVacancies`, `getPublicVacancy`, `VACANCY_SEARCH_MAX_LIMIT = 50`, filter and status
types) and **nothing imports it.** The only `.tsx` file touching the vacancy store is
`components/admin/vacancy-sources-section.tsx`, which reads *source health*, not vacancies.

The only place the supply reaches a user is the landing page's `MarketProofBand`, and that renders
a **pinned constant** (`SWEDEN_COVERAGE_2026_08_17`), not a live count.

Combined with the `authenticated`-only RLS, the outcome is: **38,142 fresh, apply-ready jobs that no
worker and no search engine can see.**

---

## J. COMPANY / CONTACT FUNNEL

Measured: 8,124 distinct employer names in the vacancy data; 13 platform organizations; 10
companies; 14 memberships; 17 customer requests; 0 contact-disclosure requests; 0 team enquiries.

`contact_disclosure_requests` (employer → worker contact ask, scoped to one demand and one org,
carrying field *names* only, never values) is implemented with an append-only privacy ledger and has
**never been used** (0 rows).

**Bottleneck:** the funnel from 8,124 known employers → platform organizations is not implemented at
all. There is no canonicalisation of vacancy `employer_name` into a company entity, no website/domain
enrichment, and no qualification step. Conversion is 8,124 → 13, and those 13 arrived by other means.

Privacy separation (discovery vs transactional contact vs marketing vs consent vs suppression) is
correctly modelled in the consent/disclosure ledgers; note `privacy_consent_purposes` deliberately
seeds **no marketing purpose** — "the product sends no marketing messages". Any outreach programme
must start by confronting that design decision with the owner.

---

## K. SOCIAL AUTOMATION CAPABILITY — **NOT STARTED**

No social integration exists in the repository: no Facebook Page/Groups API, no Instagram, no
LinkedIn, no scheduler, no UTM attribution beyond generic telemetry. Acquisition attribution for a
campaign cannot currently be measured end-to-end.

Honest constraints for the requested Facebook-first worker acquisition: Facebook **Groups** posting
via official API is heavily restricted and largely unavailable for this pattern; Page posting is the
supported surface and requires the owner's Page permissions. The correct design is
maximum-legitimate-automation with a human approval step, not browser bots — which are explicitly
out of scope.

---

## L. BRAND PURITY FINDINGS

Raw hits across `apps/`, `supabase/`, `docs/`, `scripts/`:

| Term | Files | Classification |
|---|---|---|
| `labma` / `LABMA` | 60 | **SOURCE_PROVENANCE / STALE_REFERENCE** — mixed. Legacy audit docs and anti-pattern guards intentionally preserve the name. **Must not be blanket-replaced.** |
| `nonstop` | 57 | NEEDS_OWNER_REVIEW — likely legitimate pilot/customer references |
| `agentai` | 45 | NEEDS_OWNER_REVIEW — sibling project references |
| `rexora` | 29 | NEEDS_OWNER_REVIEW |
| `vismantas` | 16 | NEEDS_OWNER_REVIEW |
| `wavi` | 13 | NEEDS_OWNER_REVIEW |
| `vecticum` | **3** | **ACCIDENTAL_CONTAMINATION (probable)** — `supabase/migrations/20260817130000_workflow_engine_v1.sql`, `docs/audits/full-reality-audit-2026-08-17.md`, `docs/audits/vecticum-capability-matrix-2026-08-17.md` |

**The `vecticum` hit inside an applied migration file is the one that matters** — a foreign product
name embedded in shipped schema. Migration files must **not** be edited after application; the
correct remedy is a comment-only follow-up or documentation note, never a rewrite of applied SQL.

No classification pass was completed for the ~220 remaining files; a blanket removal is explicitly
unsafe and was not attempted.

---

## M. REPOSITORY HYGIENE

| Metric | Value |
|---|---|
| Pack size | **436 MB** |
| Tracked files | 4,540 |
| Docs markdown | 774 |
| PNG evidence files | 512 |
| Registered worktrees | **28 stale + 1 canonical** (inherited report said 9) |
| Migrations in repo | 225 |
| Migrations in production | 213 |

Classification: the 512 PNGs and 774 markdown files are the dominant weight and are mostly
**ARCHIVE** candidates (audit evidence from closed trains). Migrations are **KEEP — never delete.**
The 28 stale worktrees are **DELETE_SAFE only after** the four-point check in `CLAUDE.md` (clean
tree, zero untracked, nothing unpushed, no unique gitignored files) is run **per directory**.
That check was not run this train, so no directory was removed.

---

## N. SECURITY / PRIVACY

365 advisors. Breakdown and honest triage:

| Finding | Count | Verdict |
|---|---|---|
| Signed-in user can execute SECURITY DEFINER function | 353 | **By design** — the architecture is RPC-only writes; not a defect |
| Public (anon) can execute SECURITY DEFINER function | 4 | **By design** — public business profile/listings/services + public company-need intake |
| RLS enabled, no policy | 3 | **By design** — operator-only tables (`vacancy_import_cursors`, `company_need_public_intakes`, a backfill ledger) fail closed |
| **Security Definer VIEW** `worker_absence_scheduling` | **1 (ERROR)** | ~~**REAL — needs review.**~~ **REVIEWED 2026-08-18 evening — intentional and correct.** See below |
| Function search_path mutable | 2 | Low — both are `usage_cost_events` guard triggers |
| **Leaked password protection disabled** | 1 | **REAL — one-click owner fix** |
| Auth OTP long expiry | 1 | REAL — owner fix |

### RE-SWEEP 2026-08-18 evening — 373 advisors (was 365)

Re-read live from `gorgitwvdzxbnaxhrsrw`. The delta is **+8 → 357 authenticated
secdef and 4 → 8 anon secdef**, entirely accounted for by the job-board train
(#1184, #1190): `count_public_vacancies_v1`, `get_public_vacancy_preview_v1`,
`search_public_vacancy_previews_v1`, `list_public_vacancy_sitemap_v1`.

**All 8 anon-executable definer functions are exactly the 8 entries in
`apps/web/lib/security/anon-secdef-allowlist.ts`** — set equality, checked
name by name. Nothing anon-reachable is ungoverned.

### `worker_absence_scheduling` — the one ERROR, closed

The advisor is correct that the view is `SECURITY DEFINER`, and that is
**deliberate, owner-approved and documented**, not an oversight:

- `supabase/migrations/20260808120000_worker_absence_scheduling_view_v1.sql`
  rejects `security_invoker = true` explicitly and on the merits — such a view
  inherits the base table's RLS, so an employer who can read the row through
  the view can still read the base table with every column. It is *"ergonomics,
  not a boundary."*
- The view is the boundary: it carries `caller_manages_worker() OR is_admin()
  OR self` as its **own** predicate — the same function the base policy used, so
  there is one authorization rule, not two — and selects only
  `id, worker_id, start_date, end_date, half_day, status`. **There is no `note`
  and no `absence_type` column to leak.**
- Grants are narrow: `revoke all … from anon`, `grant select … to authenticated`.
- Owner decision recorded 2026-08-08 in
  `docs/human-gates/w12-absence-privacy-hardening-gate.md`, with the SQL pinned
  by sha256.

**No code change is warranted.** A future advisor sweep will raise this ERROR
again; this section is the standing answer.

Positives worth recording: append-only ledgers are **trigger-enforced against `service_role` itself**
(consent, disclosures, workflow transitions, timesheet/agreement/procurement/trip/training/review/
decision events). The rolled-back E2E confirms these guards hold in production.

---

## O. MOBILE / UX — **NOT VERIFIED THIS TRAIN**

No mobile or responsive verification was performed. This is stated as a gap rather than guessed at.
Priority journeys still needing real mobile proof: landing, signup, Google login, onboarding, profile,
avatar, CV, job browsing (once it exists), workspace/chat, journal, approvals.

**2026-08-18 evening — why this is still open, precisely.** It was attempted, not
skipped. A production build was served locally and Chromium is available in the
session, so the browser side is not the obstacle. The obstacle is one setting:
the session's **network egress allowlist does not include
`gorgitwvdzxbnaxhrsrw.supabase.co`**, so every data-backed route fails at the
first query:

```
Host not in allowlist: gorgitwvdzxbnaxhrsrw.supabase.co.
Add this host to your network egress settings to allow access.
```

Measured against the locally-served production build with that block in place:
`/lt` **200**, `/lt/about` **200**, `/robots.txt` **200** — the static surface
renders fine. `/lt/jobs` **500** and `/jobs-sitemap.xml` **500**, both purely
because the database is unreachable from here. `/lt/jobs` does render the
localised `[locale]/error.tsx` boundary rather than a blank page.

**This is an environment permission, not a repo defect, and it is the single
thing standing between this repo and real mobile evidence.** Adding that host
(and the Vercel preview host) to the environment's egress settings converts
every "NOT VERIFIED" row in §O and in the coverage section into something an
agent can actually prove.

---

## P. ANALYTICS — WHAT WE CAN AND CANNOT MEASURE

**Can measure:** active jobs, unique employers, freshness, classification rate, country (all from
`public_vacancies`); signups and confirmations (auth); journal usage; 1,332 `pilot_events`.

**Cannot measure:** worker funnel conversion (landing → signup → completion → action → return);
employer funnel to paid; acquisition source/campaign/UTM attribution; MRR/ARPU/churn (no payments);
AI cost per user (`usage_cost_events` empty); job-view and application rates (no such surface).

---

## Q. GO-LIVE BLOCKERS

> **STATUS RE-VERIFIED 2026-08-18 evening against `main` @ `b596df8a` and live
> production. Four of these seven were already closed when this list was
> written or shortly after; leaving them standing was costing every later
> session a re-investigation. Struck items below are done — the evidence is
> named inline, not asserted.**

**P0 — must fix before inviting the public**
1. ~~**No job browsing surface.**~~ **DONE (#1184, #1190).** `app/[locale]/(marketing)/jobs/page.tsx` and `jobs/[id]/page.tsx` exist and read the public projection; `nav.jobs` is in all 11 catalogues.
2. ~~**Job supply invisible to anonymous visitors and search engines.**~~ **DONE (#1184, #1190).** The owner decision was taken (directive §5: publicly discoverable, anonymous callers get a projection only). Anonymous access runs through 4 allowlisted definer functions, plus `/jobs-sitemap.xml` and sharded sitemaps.
3. **Payments cannot run** — owner action required (live Stripe account + keys). **STILL OPEN — owner-gated.**
4. ~~**`APPLIED_LEDGER.md` stale** — 43 false `PENDING APPLY` entries.~~ **DONE (#1187), and the fix was better than "correct the entries".** The ledger now opens with a warning header naming itself a secondary record, and the machine-checked answer lives in `docs/migrations/production-parity-register.md`, generated from a live read and pinned by `apps/web/lib/migrations/parity-model.ts`. The old entries stay **deliberately** unrewritten — they are the audit trail of what each session believed. *Independently re-checked this evening:* of the 31 file names still carrying `PENDING APPLY`, **28 are applied in production** (name-matched, then confirmed object-by-object — `work_tasks`, `timesheets`, `agreements`, `procurement_inquiries`, `business_trips`, `training_programs`, `review_cycles`, `management_decisions`, `work_objects`, `workflow_definitions`, `org_documents` and the rest all exist), 2 are the reviewed notification union, and exactly **1 is genuinely pending: `company_locations_v1` — `to_regclass('public.company_locations')` returns NULL.** The parity model already knew something the raw name match did not: `20260714210000_company_memberships_v1` is a superseded draft, and the applied file is `20260806090000`. **Read the register, not the banners — and not a hand-rolled name match either.**
5. **Leaked-password protection disabled** — owner action, one click. **STILL OPEN — owner-gated** (advisor `auth_leaked_password_protection` still fires).
6. ~~`worker_absence_scheduling` SECURITY DEFINER view — needs review.~~ **REVIEWED, no change warranted.** The definer property is the deliberate privacy boundary, owner-approved 2026-08-08 with the SQL pinned by sha256. Full reasoning in §N.
7. **Mobile journeys unverified.** **STILL OPEN, and now blocked on one environment setting, not on the repo** — the session's egress allowlist excludes the Supabase host. See §O for the measured route-by-route result and the exact error.

**So the real P0 remainder is three items, and all three are owner actions:**
Stripe keys (#3), the leaked-password toggle (#5), and adding
`gorgitwvdzxbnaxhrsrw.supabase.co` to the environment's egress allowlist so
mobile/browser journeys (#7) can be proven at all.

**P1 — business growth**
Second job market; employer canonicalisation from 8,124 employer names; contact funnel; AI switched
on for one real task; acquisition attribution; matching producing its first row.

**P2 — autonomous optimisation**
Source health automation, campaign experimentation, AI routing by cost, anomaly detection.

---

## R. 7-DAY BUSINESS IMPACT PLAN

Ranked by Business Impact × Urgency × Confidence ÷ Effort.

1. **Ship the jobs page** (highest impact, lowest risk, no owner decision). 38,142 apply-ready jobs
   become visible. The read layer already exists and is tested.
2. **Decide public vs authenticated job browsing** — owner decision. If public: add an `anon` RLS
   policy for active rows + sitemap entries, which turns 38,142 jobs into indexable acquisition pages.
3. **Fix `APPLIED_LEDGER.md`** so the next session inherits truth.
4. **Switch AI on for exactly one task** so `ai_runs` stops being zero.
5. **Reconcile supply and market**: either activate `sv` as a UI locale, or begin a second source in
   an active-locale market. Sweden-supply-with-Lithuanian-UI cannot convert.
6. **Owner security actions** (below).

### OWNER ACTIONS REQUIRED (exact steps)

**1. Enable leaked-password protection**
- Go to: https://supabase.com/dashboard/project/gorgitwvdzxbnaxhrsrw/auth/providers
- Open the **Password** section (under "Auth Providers" → Email).
- Turn ON **"Prevent use of leaked passwords"**.
- Verify: the toggle stays on after page reload.

**2. Shorten OTP expiry**
- Same page → **Email** provider settings → field **"Email OTP Expiration"**.
- Set the value to **3600** (one hour) or less.
- Verify: reload; the field shows your new value.

**3. Live payments (only when you want to charge real money)**
- This requires creating a live Stripe account and supplying live API keys. **Do not send me the
  keys in chat.** They are added in the Vercel project's Environment Variables screen.
- Until this is done, the honest status is: the product cannot take money.

---

## S. 30-DAY AUTONOMOUS GROWTH PLAN

- **Week 1:** close the supply-visibility gap (§R 1–3). First real measurement of a worker funnel.
- **Week 2:** employer canonicalisation — turn 8,124 vacancy employer names into a company entity
  with provenance, so the contact funnel has a population to work on.
- **Week 3:** second data source in a market whose locale is actually served; AI on for one worker-
  facing task with cost tracking landing in `usage_cost_events`.
- **Week 4:** acquisition attribution end-to-end (source → signup → completion → action), which is
  the precondition for any social campaign being measurable rather than decorative.

Autonomy ladder: source health monitoring and ledger reconciliation can move to **L2 (execute +
verify)** quickly. Pricing activation, real spend, mass outreach and permission reductions stay
**owner-gated** indefinitely.

---

## VERIFICATION COVERAGE OF THIS REPORT

**Verified with production evidence:** database state, migrations, RLS, advisors, auth identities,
storage, job supply, payments state, AI usage, telemetry, site liveness, code-level consumers,
locales, brand-hit counts, repo metrics.

**NOT verified this train (stated, not guessed):** browser journeys, approvals admin UI, timesheet
UI, mobile/responsive, UX coherence, per-file brand classification, per-worktree deletion safety,
country-by-country data-source research, previous tester-feedback re-check (§21 of the brief).
