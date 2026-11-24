# Universal Opportunity Platform — Reality Audit & Opportunity Map v1

**Date:** 2026-07-17 · **Base:** `main` @ `052009c3` (after #799/#800/#801 merged)
**Method:** read-only reality audit across the whole product. No feature was built
blind; every claim is tied to a canonical module or an honest absence.

Purpose: verify whether LabourMarket.ai is built and presented not only as a
job-search / worker-search system, but as a **universal European professional-
opportunity ecosystem** — work, growth, transferable skills, transitions,
reskilling, learning, projects, teams, partnerships, mentorship, ideas,
intelligence, mobility, and potential discovery.

**Capability state legend:** `WORKING_REAL` (real data, live) · `WORKING_LIMITED`
(works but bounded) · `ARCHITECTURE_READY` (built, not activated) ·
`DOCUMENTED_ONLY` (described, unbuilt) · `MISSING` · `MISLEADING` (looks live
publicly but has no real backing).

---

## 1. Headline verdict

The **engine is real and doctrine-disciplined**: one deterministic, explainable
matching engine, one canonical skill map, honest degradation everywhere, and
**no fabricated courses, mentors, projects, partners, AI-advisor, or metrics**.
The residual gaps are overwhelmingly **DATA/OWNER-gated, not code** (empty seeded
tables, unapplied draft migrations, sources OFF) — and one real product gap:
**growth / transferable-skills / adjacency logic exists but is never surfaced to
the user.**

The single most important structural finding:

> `lib/taxonomy/profession-skills.ts` (`professionRelatedness`, `professionsForSkill`,
> real seed-mirrored, drift-guarded) is a genuine transferable-skills primitive.
> `professionRelatedness` is used **only as a hidden matching bonus**
> (`match-v1.ts:~552`); `professionsForSkill` is **called nowhere in the app**.
> The platform *sees* transferable skills and adjacent professions but never
> *shows* them. This is the cheapest real "more-than-a-job-portal" win, and it
> requires **no new engine or skills system** — only UI + a server read over the
> existing canonical module.

---

## 2. Opportunity Map (14 areas)

| # | Area | State | Canonical module(s) | Data | User sees | Missing / blocker |
|---|---|---|---|---|---|---|
| 1 | Work opportunities | WORKING_LIMITED | `lib/opportunities/{load-worker-opportunities,opportunity-fit,recommendations-model,discovery-filters}.ts`; `dashboard/opportunities/page.tsx` | Real own readiness; open demand via gated RPC `list_open_demand_for_workers()` — approved-route false for every real row today | Real readiness chips + honest "opportunities will appear here" empty state; match cards when rows exist | DATA/OWNER (approved-route signal + real demand rows) |
| 2 | Career growth | MISSING (as a capability) | inputs: missing-skill chips (`recommendations-model`), `professionRelatedness` | real | Only "skills missing for *this* job"; no progression/next-role map | CODE + OWNER (build a growth view; decide shape) |
| 3 | Transferable skills | ARCHITECTURE_READY | `lib/taxonomy/profession-skills.ts::professionsForSkill` | real (232-link seed) | **Nothing** (never rendered) | CODE (pure UI + server read) |
| 4 | Career transitions / adjacency | ARCHITECTURE_READY | `profession-skills.ts::professionRelatedness` (Jaccard, thr 0.2 at `match-v1`) | real | **Nothing** (only hidden match bonus) | CODE (pure UI) |
| 5 | Reskilling | DOCUMENTED_ONLY | — (`PRODUCT_CONSTITUTION §7.1` direction) | — | Nothing (honestly absent; no fake "reskill now") | OWNER + PARTNER (content source) |
| 6 | Learning pathways | MISSING | `/dashboard/learning` + `lib/learning/*` are **skill-confirmation review, not courses** | — | "Not available yet" honest state | PARTNER/LICENCE + CODE + OWNER (no course source exists) |
| 7 | Projects | WORKING_REAL (mgr) / WORKING_LIMITED (worker) | `lib/projects/*`; `dashboard/projects/*` | real `projects` + `project_worker_assignments` (applied) | Managers create/manage; workers see only *assigned* projects | worker open-project discovery = OWNER decision |
| 8 | Teams / brigades | ARCHITECTURE_READY | `lib/company/team-brigades.ts` (org_type='team' + `create_team_v1`) | base spine migration `20260705220000` is DRAFT and **absent from APPLIED_LEDGER** | Honest "prepared, not enabled" | OWNER (confirm/apply base spine — see §5) |
| 9 | Partnerships / collaboration | WORKING_REAL | `lib/invitations/*` (canonical `invitations`, applied 2026-07-12) | real | `dashboard/network` invite/accept/collaborate_partner → `collaborator` engagement | none |
| 10 | Mentorship & professional connections | connections WORKING_REAL / mentorship MISSING | `lib/invitations/network.ts` (people/company search, engagements) | real | Network search + consent-gated contact; **no mentorship feature** | mentorship = CODE/OWNER (does not exist) |
| 11 | Entrepreneurship / new ideas | MISSING | — ("Ideas Integration v1" = job-interest/shortlist, **not ventures**) | — | Interest signals + shortlist notes (not idea incubation) | CODE/OWNER; **naming risk** (see §4) |
| 12 | Labour-market intelligence | WORKING_LIMITED | `lib/intelligence/*` (`intelligence-read`, `salary-model`, `skills-demand-model`, `source-governance`) | salary table applied but **empty**; company demand real; worker cards architecture-ready; **all external sources OFF** | Salary-vs-benchmark (once seeded) + company "skill scarcity"; other cards honest-unavailable | DATA (curated salary rows) + OWNER/LEGAL (source activation) + migration apply (observations) |
| 13 | International & regional mobility | WORKING_LIMITED | `match-v1` country criterion; `lib/country-readiness/requirements.ts` (real EU-framework matrix) | real matrix; needs cross-border demand rows | Country as a real match dimension + document checklist | DATA + CODE (no mobility explorer; region = string match) |
| 14 | Talent & potential discovery | WORKING_REAL | `lib/scouting/scouting.ts` → `lib/market/match-subject.ts`; `player-card` | real RLS-scoped worker supply | `dashboard/company/scouting` (real, ranked, §19 basis) | DATA (needs real worker population); `dashboard/talent` = superadmin **sample** page (§4) |

---

## 3. Audit-question answers (evidence-based)

1. **Where could I grow (not just which job)?** — **No.** Only job-fit + missing skills for that one posting. (Area 2 MISSING.)
2. **Transferable skills across professions?** — **Internally yes, to the user no.** `professionsForSkill`/`professionRelatedness` real but only a hidden match bonus. (Areas 3/4.)
3. **Adjacent professional directions?** — **No user surface;** primitive is one call away.
4. **Identify skills gaps?** — **Yes, real** (`fit.ts::computeContextFit` — catalogue slugs vs worker skills), bounded to human-structured needs.
5. **Link gaps to real learning paths?** — **No.** No learning-content source exists; gaps link only to "log journal evidence."
6. **Help reskill?** — **No** real reskilling (documented direction only; honestly absent).
7. **Discover projects/teams/partners?** — Partners **yes** (network); teams **gated** (base spine unconfirmed); projects **partial** (own/assigned only, no open board).
8. **Org finds competence/team/collaboration, not just a worker?** — competence via scouting (real); collaboration via `collaborate_partner` (real); team via enquiry (gated).
9. **Supports students / graduates / experienced / career-changers?** — **Yes** on the landing audience band (all four named); the profile/education model is universal (all education levels), though the education feature is off pending a migration.
10. **Show potential without prior title?** — **Partially.** Matching is skills+evidence based, `professionSlug` nullable throughout; presenting "potential" as its own narrative is not built.
11. **Recommendations explained?** — **Yes.** A recommendation cannot be constructed without its `basis`; matching returns reasons/gaps/missingData + per-dimension breakdown; "deterministic rules, no AI" disclosed.
12. **Market data helps real career decisions?** — **Minimal today.** Only salary-vs-benchmark (once an admin seeds real rows); everything else honest-empty. Architecture ready, not yet decision-grade.
13. **Usable for all education levels?** — **Model yes** (university/vocational/college/doctorate/cert), universal by constitution; the education *feature* is off pending an owner-applied migration.
14. **Public UX shows broader value than "find work"?** — **Partial.** The **landing** does (audience band, "Not just a CV", growth pillars); the **SEO metadata + `/work-opportunities` + `/for-workers` + `/worker-intake`** pull it back to jobs/CV/recruitment, and there is **no public growth/learning surface**. (See §6.)
15. **Non-existent features promised/shown?** — **No fabricated features.** Honesty posture is strong and guard-enforced (no fake courses/mentors/projects/partners/metrics; payments "not active yet").

---

## 4. MISLEADING / naming risks (flag, do not fake)

- **`dashboard/talent/page.tsx`** renders hard-coded `SAMPLE_WORKERS`/`SAMPLE_JOBS` ("Talent · Preview"). **Mitigated** (superadmin-gated, every entity prefixed `"Sample ·"`, "sample data only" banner). Low risk; must never be un-gated or reused as the real talent entry point — the real discovery is `dashboard/company/scouting`.
- **"Learning" label** (`/dashboard/learning`) denotes *skill-confirmation review*, not courses — a user could arrive expecting learning content. Rename if a real learning feature ever lands.
- **"Ideas Integration v1"** is job-interest + employer-shortlist, **not** entrepreneurship/venture. Presenting it as an "ideas/entrepreneurship" capability would misrepresent it. Naming risk only — no fake data.

---

## 5. Owner-decision items (blockers that are not code)

1. **Team spine ledger gap** — `20260705220000_team_brigade_org_spine.sql` is DRAFT and **not in `docs/APPLIED_LEDGER.md`**, yet its dependents (`team_profile_details_v1`, `team_enquiries_v1`) are recorded applied 2026-07-16. Confirm whether team creation is actually live in prod before any UI claims teams "work". (No migration applied by this audit.)
2. **Intelligence data**: `market_rate_averages` is applied but **empty** — needs an admin to enter real, sourced salary rows; the observations store (`20260714230000`) is a draft migration; external sources (`eures`, `stat_gov_lt`, `uzt_lt`, `cvbankas_salary`) are OFF pending legal/licence activation.
3. **Education/qualification feature**: universal model built; feature off pending owner-applied migration `20260714160000_worker_education_achievements_v1.sql`.
4. **Learning/reskilling content**: no course/provider source exists — a content partner/licence + product decision is required before any learning-pathway surface can be honest.
5. **Growth product shape** (area 2): the inputs exist; the "where you could grow" view is a genuine unbuilt product decision.

**No migration was applied in this audit. #798 (NAV Norway) untouched.**

---

## 6. Job-portal narrowing (public identity)

The landing page already presents a broad opportunity identity (audience band names workers, job-seekers, freelancers, students & new entrants, career-changers, employers, agencies, project owners; pillars "Not just a CV", "Don't let your skills stay invisible"). The narrowing lives in:

1. `lib/seo/metadata.ts` `BRAND_SEO` (every locale) — "Workers, Employers, Skills and Work Opportunities" / "see needs, readiness, skills, work opportunities and market signals". No growth/skills-development framing at the brand level.
2. `lib/seo/metadata.ts` `PAGE_SEO.workers` / `.workOpportunities` — pure job-seeking/CV/recruitment.
3. `app/[locale]/(marketing)/work-opportunities/page.tsx` — jobs-only ("Build profile & CV → Show skills → Reach needs").
4. `app/[locale]/(marketing)/for-workers` + `worker-intake` — recruitment-funnel framing.
5. **Structural**: `lib/learning/*` is never surfaced in the marketing tree — no public growth surface counterbalances the jobs framing.

**Honesty constraint on any fix:** the platform's *real* broader value is the **evolving Work-Journal profile + skills visibility + explainable matching** — NOT courses/reskilling (those don't exist). Public copy may broaden toward *skills, professional profile and where your strengths fit*, but must **not** claim learning/reskilling/course features until they exist (§5 No-fake). Handled as Wave 1 (copy only).

---

## 7. Recommended forward waves (evidence-based, small, reuse canonical modules)

- **Wave 1 (copy):** de-narrow `BRAND_SEO` + `/work-opportunities` framing to reflect the *real* broader value (skills, professional profile, where strengths fit) without promising unbuilt learning; add a guard so metadata/landing can't define the product as jobs/CV-only. (Shipped alongside this audit.)
- **Wave 2 (connect, code):** surface `professionsForSkill` ("your skills also fit these professions") and `professionRelatedness` ("adjacent directions") as a **read-only worker card over the existing `profession-skills.ts`** — pure UI + server read, no new engine/skills map, §19-style basis, honest empty state. **Owner decision:** placement + copy tone.
- **Wave 3 (learning honesty):** blocked on a real content partner/licence (owner). Until then, keep the honest absence; do not add course recommendations.

## 8. Guarantees
- No migration applied. #798 untouched. No schema/RLS/auth change. No fabricated feature introduced. All engine/skill/profile logic reuses the single canonical modules (anti-duplication guarded).
