# Product Constitution — labourmarket.ai

> **Status:** Binding product principles for labourmarket.ai / app.labourmarket.ai.
> Complements `docs/PLATFORM_DOCTRINE.md` (technical doctrine) and
> `docs/DECISIONS/0008-universal-labour-market-os.md` (universal-OS ADR). Where a
> product/UX decision conflicts with these principles, these win — flag the conflict.
> **Active product name:** labourmarket.ai. Candidate future name: *Retis*.
> "LABMA" is an unrelated, permanently retired project — not a name, alias,
> predecessor, architecture name or product family of labourmarket.ai. See the
> owner ruling in `AGENTS.md` → *Naming*.

This constitution locks the non-negotiables for the WOW Public Beta and beyond.

---

## 1. Non-locking role / intention (architectural law)

The first role / intention choice is **only a starting direction — never a permanent category.**

- A user **may select one or more** starting directions, and **may add more later**
  (roles, activities, companies, teams, agencies, projects, client needs, service offers, opportunities).
- The product must never imply the first choice is final or that a user *is* a single category.

**Correct framing:**
> Choose what you want to start with today. You can add more activities, roles,
> companies, teams, projects, or opportunities later.

**Forbidden framing:**
> You selected worker/company/agency, therefore this is your permanent category.

**Current enforcement (verified):** onboarding is multi-select (`OnboardingWizard`,
`Set<Role>`); roles persist in `profile_roles` with `active_role` as the *current*
workspace (not a lock); users add roles post-onboarding via the RoleSwitcher
("Add role" + `add_role` RPC). See `docs/handoffs/WOW-BETA-V1-ARCHITECTURE-AUDIT.md`.

## 2. One user → multiple activity spaces

One person ↔ one `profiles` row (§5.1 doctrine), but that person can grow into:
personal work identity · company activity · team/brigade · agency · project ·
client activity · hiring need · service offer · opportunity intent. The data model
already expresses this via `profile_roles`, `engagement_contexts` (§5.5), and
`organizations` — no schema change is needed to honor this principle.

## 3. Profile is a living work identity (not a CV form)

The profile combines experience, skills, documents, activities, evidence, trust,
mobility, languages, availability, and opportunities. It should feel like a premium
work identity / scouting profile, not a static form.

## 4. Company / team / agency are first-class activity spaces

A company, team, agency, or project can enter the system and build its own activity
presence (what we do, where we work, what/who we need, services offered, pilot/contact path).

## 5. No fake anything

The product must never present as **real** any of: AI, matching, verified skills,
ratings, candidates, companies, jobs, or metrics that are not backed by real data.
Pre-launch placeholder/sample data is allowed **only** when clearly labeled and
registered (`apps/web/content/placeholders.ts` + `<Placeholder>`; see
`docs/PLACEHOLDERS.md`). Unbuilt matching must be labeled beta / manual / pilot.
AI may suggest, never confirm or send on a human's behalf (doctrine §7 / §7.1).

## 6. Premium first impression

Unified, pleasant, serious, impressive from first touch. The app interior must
visually match the landing direction.

## 7. Universal labour-market scope

### 7.1 Canonical product definition (binding; owner text 2026-07-17, įrašyta 1:1)

> **LabourMarket.ai — universali Europos darbo rinkos ir profesinių galimybių
> erdvė, skirta visų profesijų, išsilavinimo lygių, patirties ir gyvenimo etapų
> žmonėms. Ji padeda kiekvienam atrasti didesnes savo galimybes, parodyti
> realius gebėjimus, rasti darbą, darbuotojus, komandą, mokymąsi, projektus ir
> partnerius, kurti naujas idėjas bei greičiau persikvalifikuoti.**

**English (reference translation):** LabourMarket.ai is a universal European
labour-market and professional-opportunity space for people of every profession,
education level, experience and life stage. It helps everyone discover more of
their opportunities, show real abilities, find work, workers, a team, learning,
projects and partners, create new ideas, and reskill faster.

This definition is a **product-architecture rule, not marketing text.** Every
surface — schema, search, matching, onboarding, profiles, learning/reskilling,
copy, and metadata — must serve all professions, all education levels, all
experience and all life stages, across the whole of Europe (not one country).

**Public-identity constraints (binding):**

- Public product identity is stated **positively and universally**. It is never
  defined through a single sector — **not even by negation** (no "not just X",
  no "not a Y platform").
- The platform never defines *itself* as construction / a trade / "work abroad" /
  a "labour-force agency" / a job board / a CV app. A concrete sector, profession
  or opportunity type appears in the product **only where a user themselves**
  selects it (a chosen profession, sector, vacancy, learning path, or
  market-data filter). Legitimate profession/sector taxonomy data is never
  removed — it is surfaced on user choice, not as the platform's identity.
- No sector may be given priority in the definition or architecture. The phrases
  **"primary vertical", "initial vertical", "construction-first", "default
  industry", "preferred sector", "pilot sector", "sector boost", "industry
  boost", "ranking boost"** and any analogous priority construct are forbidden
  in this canonical definition (guarded by
  `apps/web/lib/guards/universal-canonical-definition.test.ts`).

### 7.2 Architectural consequence

labourmarket.ai is a labour-market **opportunity OS** — not a CV app, not a job
board. Architecture, schema, and copy stay sector-agnostic; any sector-specific
attribute exists only as an **optional extension attribute** over the neutral
core (doctrine §5, §10), never as the core profile schema. Seed data and first
templates are not hardcoded assumptions (ADR 0008 — recruitment is a core
function, and the universal core is never boundaried to one sector). Learning,
reskilling and career-mobility are first-class architectural directions of the
model, surfaced in the product only where the corresponding function actually
exists (§5 "No fake anything").

The product **boundary** (what the system is never reducible to) and the value
**flywheel** (activity history → understanding of what one can offer → matching
against real demand → work/orders/customers → new activity) are locked in
`docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md` (owner directive 2026-08-14,
axiom A-13).

## 8. WOW beta scope discipline

Fewer strong, coherent, honest screens beat many weak ones. Every visible beta
claim must be honest; no empty buttons, dead-end CTAs, misleading copy, or
unfinished-looking core screens. Mobile must be clean (no header/bell/nav overflow).

## 9. Demo-to-Real Data Transition (extends §5)

Premium **concept / sample / preview** visualizations are allowed in landing and
product-vision UI when real data does not exist yet — an empty surface would
damage first impression and fail to communicate the product direction. They are
allowed **only** to support first impression, product explanation, or visual
direction, and **never** as real production achievements, real active users,
real verified matching, real customer metrics, or real platform statistics.

Every demo-like signal is classified as one of **concept · sample · preview ·
real**. A signal becomes **real** only when backed by real records / real
user-company-pilot activity / a traceable source — and for matching, scoring, or
verification, only when the actual logic exists and its output is traceable. A
visual is never promoted to real by relabeling alone. Until then it may remain
product-vision UI, but the surrounding copy must avoid false real-world claims.

Full taxonomy, transition conditions, copy rules, and the live inventory:
`docs/DEMO_TO_REAL_DATA_POLICY.md`. Promotion stays owner-authorised via the
Placeholder Governance flow (`docs/PLACEHOLDERS.md`).

## 10. No universal value — contextual fit signals only (architectural law)

labourmarket.ai **must never** score a person, worker, company, team, or agency
as having **one universal human or business value** — no single "overall rating"
(e.g. a lone 0–99 OVR), no global rank of a human being, no league table of
worth. A number that claims to summarise a person's or organisation's total
value is forbidden, even as a concept visual presented as real.

Every score, percentage, or signal the product shows **must be contextual and
explainable** — tied to a specific question and traceable to evidence:

1. **Capability coverage** — how a defined skill set is covered (e.g. "8 of 10
   required skills"), against a *named* skill set.
2. **Fit signal** — a percentage/indicator of fit against a **specific** search,
   project, role, need, or opportunity — never a standalone label on the person.
3. **Extra strengths** — capabilities held *beyond* the required criteria of that
   specific context, shown as additive, not as a global bonus score.
4. **Readiness / proof status** — based on **traceable evidence** (confirmed
   journal entries, documents, employer confirmations), never self-asserted.
5. **Future comparison types** — permitted **only if** every one is contextual,
   traceable, explainable, and human-dignity safe (a person can always see what a
   signal is measured against and why).

Every signal must answer: *measured against what, and from which evidence?* If it
cannot, it must not ship — not even as concept/preview. This **extends §5** (no
fake) and §9 (demo-to-real): a fit/coverage signal becomes real only when the
context is defined and the evidence is traceable; until then it stays governed
concept/preview and is never framed as a real, universal rating.

> **Standing conflict to resolve:** existing concept marketing copy describes a
> single "OVR — one 0–99 rating" / "profile strength" for a worker. That is a
> universal-value score and conflicts with this section. It must be reframed to
> contextual coverage/fit signals (or retired) **before** any scoring is built or
> promoted to real. Flagged here per Change control; tracked in `TASKS.md`.

Full doctrine — definitions, allowed/forbidden patterns, copy rules, and the
reframe path: `docs/CONTEXTUAL_FIT_SIGNALS.md`.

## 11. Onboarding channels and Definition of Done (codified 2026-05-28)

The product is **not invite-only**. Self-entry at `/auth/signup` is the
default channel: any person may sign up and start using the system
personally without an invitation. Invitations are an **additional**
channel for joining companies / agencies / teams / buyer organisations
and never replace the self-start path. Both channels write to the same
`profiles` + `profile_roles` + entity rows; no parallel invite-only
data model is allowed. Full rules:
`docs/policies/onboarding-channels-policy-v1.md`.

Every feature, slice, or sprint claiming "shipped" must satisfy the
seven-line Definition of Done — **BEFORE / AFTER / URL / ACTION /
RESULT / RELOAD / BLOCKER** — and declare a progression state of
**real / partial / blocked / preview**. A preview is never a completed
feature. The Agentai visible-product-progress state must not advance
for a stage whose DoD fails. Full rules:
`docs/policies/feature-definition-of-done-v1.md`.

Every PR that touches user-facing surfaces, schema, RLS, auth, roles,
onboarding, or signal-classified visuals must paste the constitution
compliance checklist into its PR description and into the matching
sprint artefact:
`docs/policies/constitution-compliance-checklist-v1.md`. A guard
(`pnpm -F web check:constitution`) verifies the three codified
policies above carry their required pinned phrases.

---

## 12. Axiom register (consolidated 2026-07-28 — no new rules)

Every axiom below already existed in a merged canonical document. This register
adds no vision; it gives each rule a **stable id** so a CI gate can point at it
instead of a human remembering which of ~40 product documents applies.

Machine-readable half: `apps/web/lib/product-gate/axioms.ts` (guard-pinned to
stay identical to this table).

| id | Axiom | Source (already decided) | Held by |
|---|---|---|---|
| **A-01** | Chat-first is the primary interface. `/dashboard` IS the conversation; structured data is the editable result behind it, never the entry point. | Canonical vision §15/§14; PR #864 | machine |
| **A-02** | ONE canonical underlying system: every entry path normalises into the same canonical objects; no duplicate objects, no re-entering data another path captured. | labour-market-os-constitution-v1 §1.1 | machine |
| **A-03** | ONE core work loop everywhere: chat → journal → calendar → messages. A second parallel navigation system is the defect this prevents. | `lib/config/navigation.ts` CORE_NAV_IDS (rebuild W5) | machine |
| **A-04** | Multiple entry points, suggestions not coercion, progressive completion — no mandatory long wizard, no blocked path. | labour-market-os-constitution-v1 §1.1 | heuristic |
| **A-05** | Non-locking role / intention; one user, multiple activity spaces. | this document §1, §2 | review |
| **A-06** | No fake anything — no fake AI, matching, verification, jobs, candidates or companies. | this document §5, §9; doctrine §7, §18 | machine |
| **A-07** | The profile is a living work identity, not a form and not a log of completed actions. | this document §3 | heuristic |
| **A-08** | One function has ONE home. | labour-market-os-constitution-v1 §1.1; canonical-paths + dashboard-duplicate guards | machine |
| **A-09** | Every surface must locate itself on the canonical chain; a feature that cannot is out of scope. | labour-market-os-constitution-v1 §1 | machine |
| **A-10** | One commercial catalogue: price, LMC rule, Stripe object, entitlement. | lmc-canonical-commercial-catalogue-v1 (#894) | review — machine half ships with #895/#896 |
| **A-11** | No feature launches without a known economic model. | PR #896 (not yet merged) | review — machine half ships with #896 |
| **A-12** | An unmeasured metric is reported as unmeasured, never as zero. | PR #897 (not yet merged) | review — machine half ships with #897 |
| **A-13** | The product is never reducible to a job board / recruitment platform / CV builder / ATS / marketplace / ERP / Work Journal / chatbot / data portal — those are capabilities inside the opportunity-realization flywheel (activity history → understanding of what one can offer → matching against real demand → new activity), and the flywheel is a product invariant. | docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md (owner directive 2026-08-14) | review |

**Conflict rule (unchanged, restated):** where any other product, UX or
architecture document conflicts with this constitution, **these win** — the
other document is the defect.

---

## 13. Product Gate (enforcement, 2026-07-28)

### 13.1 What it is

`.github/scripts/product-gate.mjs`, run on every PR in the `quality` workflow.
It diffs the PR and looks for NEW product surfaces: **screens, menu items,
dashboard elements, popups, modules, wizards and persistent cards**.

### 13.2 What every new element must declare

In `apps/web/lib/product-gate/surface-registry.ts`, five answers:

| Field | Question it answers |
|---|---|
| `origin_axiom` | which axiom PERMITS this to exist |
| `purpose` | what it is for, in one concrete sentence |
| `why_not_chat` | why a conversation cannot do this job |
| `why_not_existing_component` | why an existing component cannot carry it |
| `owner` | who is accountable |

A surface nobody can justify in five short sentences is a surface that should
not exist. A blank answer is not a declaration.

### 13.3 Automatic RED rules

CI fails — status **`PRODUCT_REVIEW_REQUIRED`**, merge blocked — when a diff:

| Rule code | Fires when | Axiom | Certainty |
|---|---|---|---|
| `second_dashboard` | another dashboard-like primary surface appears | A-01 | certain |
| `new_journal_module` | another Journal module surface appears | A-08 | certain |
| `new_persistent_menu` | a persistent nav item is added undeclared | A-03 | certain |
| `duplicate_action` | two surfaces claim the same canonical action | A-08 | certain |
| `profile_shows_completed_action` | a profile surface renders completed-action state | A-07 | heuristic |
| `wizard_replaceable_by_chat` | a wizard/stepper appears that a conversation could carry | A-04 | heuristic |
| `form_replaceable_by_dialog` | a form screen appears that the AI dialog could carry | A-04 | heuristic |
| `chat_importance_reduced` | chat leaves the core nav, or the conversation root loses its chat | A-01 | certain |
| `undeclared_surface` | any new surface has no declaration | A-09 | certain |
| `unknown_axiom` | a declaration cites an axiom that does not exist | A-09 | certain |

`heuristic` findings still block. The reviewer either declares the surface or
removes it — the gate never decides taste, it only refuses silence.

### 13.4 Architecture diff

Every run writes **`PRODUCT_ARCHITECTURE_DIFF.md`**: what appeared, why it
appeared, why it cannot be a conversation, which axiom permits it, and which
rules were checked — so a reviewer never has to reconstruct that from a diff.

### 13.5 Baseline

Everything that existed on **2026-07-28** is grandfathered: this enforcement PR
fixes nothing and redesigns nothing (that was its explicit scope). The known
conflicts in that baseline are recorded, with priorities, in
`docs/audits/product-constitution-audit-v1.md`. **Grandfathered means
un-audited, not approved.**

---

## 14. The canonical product graph (owner text, 2026-09-07 — binding)

**LabourMarket.ai is NOT** a job board, a recruitment site, a staffing
marketplace, a CV builder, a Work Journal, a timesheet application, a workforce
planner, an evidence database, a qualification platform, a booking calendar, or
an AI chatbot. Each of those is **one edge** of the following graph:

> PEOPLE ↔ REAL WORK ↔ SKILLS ↔ EXPERIENCE ↔ EVIDENCE ↔ QUALIFICATIONS ↔
> ORGANIZATIONS ↔ COMPANIES ↔ AGENCIES ↔ TEAMS/BRIGADES ↔ PROJECTS ↔
> SITES/OBJECTS ↔ TASKS/WORK STAGES ↔ SERVICES ↔ AVAILABILITY ↔ TIME ↔
> CAPACITY ↔ CURRENT DEMAND ↔ FUTURE DEMAND ↔ EDUCATION/TRAINING/RECOGNITION ↔
> COUNTRIES/JURISDICTIONS ↔ MOBILITY ↔ MARKET SIGNALS ↔ COMMERCIAL
> OPPORTUNITIES.

**Value chain:** REAL WORK → EVIDENCE → CAPABILITY → CAPACITY → DEMAND → MATCH
→ EXECUTION → VERIFIED RESULT → LIVING HISTORY → BETTER DECISION.

**Flywheel:** real historical work + new real work + verified evidence + project
results + supply + demand → better labour data → better skill understanding →
better matching → better planning → better forecasts → better benchmarks →
better commercial intelligence → more organizations → more real work data.

A task may work on ONE edge. It may **never** redefine the product as that edge.

**Two further principles carried by this section:**

- **Identity ≠ role.** The fundamental entity is an ACTOR. A person is
  simultaneously employee of one company, owner of another, student of an
  institution, member of a brigade, assigned to a project, available for
  another opportunity, a provider and a client. Those are relationships and
  contexts, never mutually exclusive identities.
- **Freedom + reality constraints.** The product models reality; it does not
  constrain human agency. A commitment is not a prohibition and time overlap is
  not unavailability. Detect → explain → warn → show alternatives → the
  authorized actor decides → explicit override → audit receipt. Block only for
  law, safety, authorization, another person's rights, or a genuine hard
  technical constraint.

**Machine half:** `apps/web/lib/product-gate/product-graph.ts`, enforced by
`apps/web/lib/guards/product-graph-journeys.test.ts`. A node may go empty only
with a dated `unrealized` or `narrowedOn` record naming why. `platform` and
`communication` capabilities are deliberately not graph nodes: the platform is
the machinery, and chat is one universal interaction surface **over** the graph,
not the graph itself.

## 15. Distinctions that may never collapse (2026-09-07)

Eight separations. Each has already collapsed once in this product, and each
collapse gave a real user a confidently wrong answer — none of them crashed, and
none of them failed CI.

| id | separates | the collapse |
|---|---|---|
| SEP-1 | FACT · DERIVED · FORECAST | AI extraction treated as fact |
| SEP-2 | COMMITMENT · PROHIBITION | *not yet* — the one most likely to collapse next |
| SEP-3 | EVIDENCE · VERIFICATION | self-confirmation counted as employer confirmation |
| SEP-4 | DEMAND · SUPPLY | an agency's declared capacity read as its need |
| SEP-5 | IDENTITY · ROLE | a person forced into one active role |
| SEP-6 | demonstrated · formal · equivalence · valid credential · missing | five years of real work read as "certificate missing" |
| SEP-7 | UNKNOWN · ZERO · FAILED · NOT_MEASURED | a failed read rendered as "you have nothing" |
| SEP-8 | exists · reachable · visible · actionable · correctly interpreted | a complete capability nobody could open |

**Machine half:** `apps/web/lib/product-gate/semantic-separations.ts`. Each
separation declares its enforcement honestly as `machine`, `tripwire` (the
vocabulary carrying the distinction must not disappear from its anchor module)
or `review`.

## 16. Permanent journey contracts (2026-09-07)

Six chains, with permanent ids, in
`apps/web/lib/product-gate/journey-register.ts`:

`J-WORKER-EVIDENCE` · `J-COMPANY-EXECUTION` · `J-AGENCY-SUPPLY` ·
`J-INSTITUTION-OUTCOME` · `J-IMPORT-HISTORY` · `J-TIME-FREEDOM`.

Every link is `LIVE`, `BROKEN` or `NOT_BUILT`, and the last two must say why in
words. **A link claiming to be LIVE whose capabilities are not live in the
capability register fails CI.** A route rendering is not a journey working; that
distinction is the whole point of this section.

## 17. What is NOT machine-checkable (honest limits)

The register, the graph and the journey contracts are checked by CI. These are
not, and pretending otherwise would itself be a SEP-7 violation:

1. **Whether a status is generous.** Nothing proves `PARTIAL` should not be
   `BROKEN`. Reachability is checked; adequacy is a review question.
2. **Whether a title still describes reality.** Ids are enforced in both halves
   of the register; wording is not.
3. **SEP-7 repo-wide.** Individual readers are guarded; there is no repo-wide
   proof that every Supabase read checks `error` before using `data`.
4. **SEP-2 at the schema level.** No unique, exclusion or trigger constraint may
   reject an overlapping assignment or booking. A migration adding one is a
   product decision and belongs at the human gate — the static gate cannot tell
   it apart from ordinary data hygiene.
5. **Human proof.** `HUMAN_UI_PROVEN` can only be granted by a human walking the
   surface in a browser and checking the side effects. No test may raise a row
   to it, and no agent may claim it on a suite going green.
6. **Whether a capability is any good.** Out of scope, deliberately.

---

## Hard "do not" list (product)

No billing, payments, production deploy, DNS, env, Supabase migrations, RLS/RPC
changes, destructive schema changes, external scraping, fake AI/matching/verification,
or fake jobs/candidates/companies — introduced as part of product/UX work.

## Change control

This constitution is amended only by explicit owner/DI decision, recorded here or
in `docs/DECISIONS/`. Implementation sprints must check their work against §1–§11.

§14–§17 were added on 2026-09-07 from owner text and carry a machine half in
`apps/web/lib/product-gate/`. Amending them means amending both halves: a rule
that exists in prose alone is the condition this window was opened to end.
