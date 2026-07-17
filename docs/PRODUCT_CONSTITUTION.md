# Product Constitution — labourmarket.ai

> **Status:** Binding product principles for labourmarket.ai / app.labourmarket.ai.
> Complements `docs/PLATFORM_DOCTRINE.md` (technical doctrine) and
> `docs/DECISIONS/0008-universal-labour-market-os.md` (universal-OS ADR). Where a
> product/UX decision conflicts with these principles, these win — flag the conflict.
> **Active product name:** labourmarket.ai. Candidate future name: *Retis*.
> "LABMA / LABMA OS" is historical / product-family context only — never the active name.

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

## Hard "do not" list (product)

No billing, payments, production deploy, DNS, env, Supabase migrations, RLS/RPC
changes, destructive schema changes, external scraping, fake AI/matching/verification,
or fake jobs/candidates/companies — introduced as part of product/UX work.

## Change control

This constitution is amended only by explicit owner/DI decision, recorded here or
in `docs/DECISIONS/`. Implementation sprints must check their work against §1–§11.
