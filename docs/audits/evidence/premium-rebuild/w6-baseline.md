# W6 — TRUST: BASELINE (acceptance stage, not a rebuild)

Opened 2026-08-02, immediately after
`W5_JOURNAL_EVIDENCE_SKILLS_COMPLETE_WITH_OWNER_GATED_ITEMS` (main
`7621acab`). W6's scope: subjective feedback, journal-derived objective
evidence, reputation. The standing owner ruling (W4 baseline row 23) is the
stage's first law: **no subjective store exists today; nothing may be
fabricated — no stars, no total score.**

Classification: `FULL` · `PARTIAL` · `MISSING` · `BLOCKED` · `DUPLICATE` ·
`OBSOLETE` · `PRODUCTION_PROVEN`, with `PENDING_AUDIT` + exact probe.

## Carried in verified (evidence in the W5 audit records)

| Capability | State | Evidence |
|---|---|---|
| Objective evidence inventory | FULL (inventory) | W5 audit §W6 boundary: `journal_entry_confirmations` (append-only human decisions with actor/org/role/scope), `journal_entry_metrics`, `journal_entry_skills` + provenance, photo continuity, review results (approved/rejected/changes_requested), `worker_skills` trust columns (`verified/verified_by/verified_at`, `source` tier, derived `confidence_score`/`confidence_bin` — all from countable rows), `audit_logs`, learning signals + queue |
| Subjective store | MISSING (guard-pinned absent, BY RULING) | no rating/stars table in any migration; `fit-not-rating` guard bans `trust_score|worker_rating|overall_score|…` in UI; `my-space-human-entry`, `player-card-visualizations`, `w5-live-profile` guards reinforce |
| Dormant `trust_score` columns | OBSOLETE (schema residue) | `organizations.trust_score` (0013:43, mirrored from legacy `companies.trust_score`), `workers.trust_score` — guard-blocked from every surface; DB-drop is a migration (owner gate); render-side they must stay unrendered |
| Confidence model | FULL | `computeConfidence` (score/bin from manager-confirmed entries, self-logged count, unique confirmers, recency) — recomputed on approval; `confidence_bin` rendered honestly |
| Verification honesty | FULL (W5-proven) | verified only per named skill via the gated RPC; auto-confirm writes a real honestly-labelled confirmation row under an owner-enabled policy |

## PENDING_AUDIT — exact probes (first W6 work items)

| Capability | Probe |
|---|---|
| Trust presentation | Where do confidence bins / verified tiers / confirmation counts actually RENDER today (card, CV, person page, scouting) — and where do they render inconsistently? Map every trust-signal render with file:line |
| Reputation derivation candidates | What could a purely objective reputation read derive from the inventory (confirmation density, confirmer diversity, recency, photo-backed share) — inventory the options WITHOUT building; each needs an honesty test: can a worker game it, can an org fake it |
| Subjective feedback scope | What feedback do owners/managers already leave (review notes, `changes_requested` reasons)? Classify what exists vs what a subjective layer would ADD — the ADD list goes to the owner, never built unprompted |
| Trust-signal leakage | Do any trust signals cross the W4 permission matrix boundaries (employer/anon seeing bins or counts they shouldn't)? Verify against `w4-permission-matrix.md` |
| Learning auto-confirm usage | Is any auto-confirm policy enabled in prod (real rows?) — the honest state of the one automated trust writer |

## Rules carried forward

- No fabricated reputation, stars, or single scores — the owner ruling is a hard gate on the whole subjective half; inventory + proposal only, decision goes to the owner ONCE.
- Objective derivations must be count-based, explainable in one sentence, and render with their inputs inspectable (the W5 drill-down precedent).
- Never render the dormant `trust_score` columns.
- ONE reputation engine if any is ever built — no parallel derivations.
- Production acceptance stays local-stack until `PROD_QA_*` is provisioned (standing).

---

## SLICE LOG

### Slice 1 — trust presentation truth (this PR)
ONE canonical `EvidenceTier` module (`lib/evidence/evidence-tier.ts`): `verified === true` is the ONLY path to the top rung (an inconsistent manager_confirmed-source row never inflates — the first draft of this very slice got that wrong and the existing CV honesty guard caught it); the four parallel interpretation sites (match-v1, evidence-visuals, person page inline, cv skill-tiers) now derive from it, keeping their render tokens. ONE canonical lexicon (`evidenceTier` namespace, 11 keys × 12 locales; Danish translated for the ratcheted debt): "Patvirtinta vadovo įrašu / Pagrįsta darbo žurnalo įrašais / Pateikta paties" + entry/count/confirmations families; ~20 surface keys aligned; "Susieti įgūdžiai" (Linked skills) and "Marked accurate by others" eliminated and guard-banned. Auto-confirm honesty: `rowIsAutomatic` + qualifier on the decision timeline, CV proof table and inbox note — automatic never renders identically to hand-confirmed. `confidence_bin` dots gained their 3-item evidence-assurance legend; the numeric score stays unrendered (guard-pinned). **DOCTRINE TRANSITION recorded in four guards** (silent-trust-wording, cv-friendly-copy, no-disclaimer-ui, worker-facing-copy-exhaustive): the old "neutral records language, never who confirmed it" rule is replaced by the W6 precise-origin rule — a certification stem without a named origin is still banned, the vague class ("With records", "Reviewed records") is now banned, PERSON-certification visuals and platform-endorsement claims stay banned. Owner-gated item 10 widened with L4 (`worker_skills` trust columns incl. `verified_by` UUID); L5 recorded as a boundary note. Proof: new guard `evidence-tier-lexicon` + `review-status-automatic` tests; full vitest 12569/12569; browser `w6-tier-lexicon.spec.ts` 5/5 (worker profile + employer person page + CV, desktop + 375px, seeded auto-confirm row, no stars/scores/numeric confidence anywhere).

### Slice 2 — computeConfidence containment (this PR)
Caller map pinned: ONE writer (`confirm-actions.ts` approval recompute, columns `confidence_score/bin/last_recompute_at` only), ONE render (profile bin dots + slice-1 legend), zero other consumers. Containment: `SELF_LOGGED_CONFIDENCE_CAP = 15` — the self-logged term is capped BELOW the ≥30 substantiated boundary, so 30/100/10 000 unconfirmed self entries read as honest early evidence (green), never substantiation; crossing requires manager confirmations / distinct confirmers / real recency. Scope doctrine written into the module: evidence assurance for a skill's records — never reputation/trust/person score, never renamed, never merged with experience counts. Truth-table tests: self-only volumes never yellow; cap < 30 by construction; real confirmations cross honestly; photos/streaks/learning-signals are not and cannot become inputs (type + source pins on the module AND its only writer); no reputation-named exports; the writer never sets `verified`. Existing formula tests unchanged (no case exercised self>15 — W5 pipeline behaviour preserved). Full vitest 12574/12574. Browser: no visual change by design — the same dots, honest earlier.

### Slice 3 — experience records, moderation, disputes (Draft PR #974, PENDING_HUMAN_GATE)

**3A — domain.** ONE canonical subjective-experience domain on the `experience-eligibility.ts` contract. DRAFT migration `20260802120000_experience_records_v1.sql` (needs-human-gate, paired rollback, ledger Deferred entry, migration baselines 168→169): `experience_records` (binary sentiment, worker-or-org subject, canonical interaction ref, server-side eligibility re-derived IN the submit RPC, one record per author+subject+interaction with an idempotent duplicate outcome) + `experience_responses` (ONE moderated right of reply). Moderation (`submitted→in_moderation→published|rejected`, admin-only, reason mandatory) is a SEPARATE dimension from dispute (`none/opened/under_review/resolved_*`) — a published record stays published while disputed. No DELETE anywhere; removal is `resolved_removed`. 8 audited actions into the ONE `audit_logs` chain. Count-only aggregation: published only, positive/negative separate, **disputed rows stay counted AND are surfaced**, `resolved_removed` excluded, nothing else feeds it. App side fails closed (`needs_migration`), RPC-only writes, no legacy fallback, no backfill of old subjective artifacts.

**3B — surfaces + proofs (SUPERSEDED BY 3C — the two routes below no longer exist).** `/dashboard/experiences` (submitted-by-me in real state, published-about-me with the reply door and dispute door, count-only block, chat handoff) and `/dashboard/admin/experience-moderation` (moderation queue + dispute queue as separate lists; only the canonical transition available from the current state; reason mandatory; decisions confirm their audit row). Both routes classified in the route truth map. `experience` i18n namespace ×12 locales (lt/en/ru/nl/de/da really translated — the i18n-debt ratchet did not move). **The Product Gate refused both screens (A-09, undeclared surface) and it was right to** — see 3C.

**Local test apply (LOCAL ONLY, 127.0.0.1:54322 verified; production untouched).** Applied in sequence via `supabase db reset`; rollback verified (0 tables, 0 functions, `audit_logs` survives); re-apply verified; made fully re-runnable after the first re-apply flagged `create policy` (Postgres has no `if not exists`) — 0 errors on repeat.

**Behavioural + RLS proof: `apps/web/scripts/w6-experience-domain-proof.sql` — 43/43 PASS**, one transaction, rolled back, real `authenticated`/`anon` roles. Covers eligibility (non-party, self-review, fabricated interaction id, unfinished interaction, non-binary sentiment all refused), idempotent duplicate, the full moderation lifecycle incl. shortcut and reason refusals, count-only rules, right of reply permissions and single-response rule, dispute as a separate dimension incl. the disputed-stays-counted and removed-leaves-counts rules, no-silent-delete, audit prev/new+reason, and the RLS matrix (author / subject / unrelated / anon).

**Two real defects the proof caught (both fixed):** (1) Supabase's default privileges grant SELECT on every new public table to BOTH `anon` and `authenticated`; a `revoke insert, update, delete` alone left anon holding SELECT, so an anon read reached the RLS policy and ERRORED on `is_admin()` instead of returning empty — the migration now does `revoke all` then grants back exactly `select` to `authenticated`. (2) The proof's own admin actor could not be provisioned via `profiles.active_role='admin'`: the platform's P0 `trg_profiles_admin_grant_guard` strips a self-assigned admin role (nobody self-promotes) — the proof now provisions the moderator out-of-band through `profile_roles`, which is how a real admin exists.

**Browser proof (local, domain applied): `w6-experience-domain.spec.ts` 7/7** — count-only block with real 1 positive / 1 negative / 1 disputed, dispute marker, meaning line, no rating surface (structural check: no `score|rating|ovr|stars` testid anywhere — a lexical check was rejected because the product's honest "this is NOT a rating" copy would flag itself), reply door, chat handoff, mobile 375px no overflow, and the moderator queue server-side gated against BOTH a worker and an employer.

**Fail-closed proof (domain rolled back): `w6-experience-fail-closed.spec.ts` 2/2** — route serves (<500), product-level unavailable state, zero fabricated counts, and no technical leakage (`needs_migration`, SQLSTATEs, `pgrst`, relation names, `postgres`, `supabase` all absent from the worker-facing body), back-to-chat still available, mobile clean.

**Full vitest 12616/12616; tsc + lint clean.** `migration-safety` stays RED by design (SECURITY DEFINER + GRANT/REVOKE = the repo's documented human-gate class); `@human-gate-approved` was NOT self-added. PR #974 stays Draft + `needs-human-gate`. Production migration NOT applied. W7 not started.

**3C — architecture correction: the domain moves onto the canonical chat-first topology.**

3B was code-complete and behaviourally proven, and it was still architecturally wrong. It answered "where does the experience domain live?" with two new screens. The Product Gate refused both under A-09 (`undeclared_surface`), and the refusal is the finding: labourmarket.ai is a chat-first workspace, an answer the person asked for belongs in the RESULT PANEL, and a 73rd authenticated route is precisely the failure mode the unified-product work exists to undo. The screens were **deleted, not declared** — declaring them would have bought a green gate with a second dashboard.

*Worker/employer side.* The domain is now the canonical Workspace Result at **`?result=experiences`**, the same mechanism the Player Card, the calendar, the market and the opportunities results already use. The `reputation` slot in `lib/conversation/result-registry.ts` was **renamed and promoted**, not joined by a second entry: it was created as a gated `unverified` placeholder for exactly this store (W3 capability matrix row 24 — "the `reputation` result registry entry may then flip `unverified` → `real`"), and adding an `experiences` entry beside it would have been the second reputation system the W6 directive forbids. The world element it extends is still `reputation`; the result is named after the canonical domain that fills it. It also gained **its own action** — `worker.review-experiences` — instead of sharing `worker.what-next` with the market result: `resultForAction` is first-match-wins, so the market always won and the old reputation slot was unreachable except by hand-typing the query string. A result nobody can open from the conversation is not a result.

*Admin side.* The moderator queue is now **BAND 2d on the existing `/dashboard/admin` control room**, beside `FollowUpQueuePanel` and `SalesIntakePanel`. The control room already models exactly this shape — band 1 overview KPIs, band 2 action queues (live signals needing a decision), band 3 grouped navigation — so the queue needed a home, not a route. It inherits the control room's `requireSuperadmin` layout+page gate rather than bringing its own, and every write still re-checks `is_admin()` inside the RPC. Moderation and disputes stay two lists, because they are two dimensions.

*What did NOT change.* The domain, the RPCs, the RLS, the migration, the eligibility contract, the count-only aggregation rule, and the fail-closed behaviour are untouched — this slice moved surfaces, not truth. `ExperienceCountsBlock` stayed the ONE counts renderer and became a client component rather than growing a second copy for the panel's client tree. `revalidatePath` targets moved to the two routes that actually exist (`/dashboard`, `/dashboard/admin`); revalidating a deleted route would be a no-op dressed up as a refresh.

*Guard change, stated plainly.* `result-registry.test.ts` asserted `unverified.length > 0` ("the gate is meaningless if nothing is gated"). Both entries it named have since been verified and promoted, so that assertion would have meant holding a result back from a data source that IS real just to keep a counter above zero. It was replaced with a stronger test that pins the gate on the FUNCTION for every entry in every context (`canRenderInline === real && contexts.includes(ctx)`), which cannot rot away when the gated list is empty.

*Known gap, not papered over.* `ExperienceSubmitForm` still has **no mount point**. Submitting an experience needs an eligible finished interaction (accepted booking / completed engagement / concluded service request) as its context, and no surface hands it one yet. It was unmounted in 3B too. This slice did not invent an entry point for it — that is a real product decision about where a person is asked for an experience, and inventing one here would have been the same mistake 3B made with routes.

**One real defect the browser proof caught in this very slice.** The first draft set `contexts: ["personal"]`, copying the `opportunities` reasoning. The authenticated employer session refuted it immediately: standing in the Dev Construction workspace, the employer got "this result is not available in the current context" instead of their own submissions. The AUTHOR side of this domain is normally an employer acting from inside their organization, so personal-only hid half the domain from the half of the product that produces it. Corrected to all three contexts (the `journal` pattern) — "jobs that fit me" really is meaningless to an organization, but "the experiences I submitted, and the ones about me" is a fact about the signed-in PERSON in any workspace, and the read is RLS-scoped to the viewer either way.

**Re-validation after the correction.**

| Gate | Result |
|---|---|
| Product Gate | **GREEN — 0 violations, 0 new surfaces** (was 2 × A-09) |
| `next build` | clean; both deleted routes absent from the generated route table |
| `tsc --noEmit` | clean |
| `lint` | 0 errors (22 pre-existing warnings, unrelated files) |
| vitest | **12616 / 12616**, 792 files |
| Browser — canonical surfaces | `w6-experience-domain.spec.ts` **9/9** |
| Browser — positive admin | `w6-experience-moderation-admin.spec.ts` **2/2** (NEW) |
| Browser — fail-closed (domain rolled back) | `w6-experience-fail-closed.spec.ts` **2/2** |
| SQL domain proof, re-run after rollback + re-apply | **43 / 43, 0 failed** |
| CI | `quality` pass · CodeQL pass · Vercel pass · **`migration-safety` RED by design** |

The e2e specs were retargeted rather than deleted: `w6-experience-domain.spec.ts` drives `?result=experiences` and the control room band, and gained two REGRESSION tests that the deleted routes are actually gone (a soft-deleted route that still rendered would be the second dashboard by another name). `w6-experience-moderation-admin.spec.ts` is new and closes the gap 3B left — it proves the queue RENDERS in its new home for a real moderator, provisioned out-of-band through `profile_roles` (the P0 admin-grant guard strips self-assigned admin, correctly) with the grant removed in `afterAll` pass or fail, and the session deliberately NOT re-minted: the cookie carries no role, `is_admin()` reads the DB per request, which is the security property. Gated behind `W6_ADMIN_PROOF=1`. Local DB was returned to the applied state and re-verified (2 tables, 10 functions, 43/43).

**Migration-safety stays RED — deliberately, and it must.** The gate names four blocking findings on the UNCHANGED migration file (3C touched no SQL): `security-definer-function`, `grant-or-revoke`, `alter-drop-policy`, `data-dml`. That is the repo's documented human-gate class, exactly as intended. `@human-gate-approved` was NOT self-added, no CI check was bypassed, and no SECURITY DEFINER was stripped to buy a green light. PR #974 stays **Draft + `needs-human-gate`**. Production migration NOT applied. Not merged. Telegram not sent. W7 not started.

### THREE SEPARATE OWNER DECISIONS (do not bundle)

1. **Architectural approval** — confirm `?result=experiences` as the canonical home of the experience domain, and BAND 2d of `/dashboard/admin` as the moderator queue's home.
2. **Merge Draft PR #974.**
3. **Apply the production migration** `20260802120000_experience_records_v1.sql`.

They are three different decisions with three different blast radii. Decision 1 costs nothing to reverse; decision 3 changes production schema and privileges.
