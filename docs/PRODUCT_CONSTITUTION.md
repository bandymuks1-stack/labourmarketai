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

labourmarket.ai is a labour-market **opportunity OS** — not a CV app, not a job
board, not construction-only. Construction is an early example, never a boundary
(ADR 0008). Architecture, schema, and copy stay sector-agnostic.

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

---

## Hard "do not" list (product)

No billing, payments, production deploy, DNS, env, Supabase migrations, RLS/RPC
changes, destructive schema changes, external scraping, fake AI/matching/verification,
or fake jobs/candidates/companies — introduced as part of product/UX work.

## Change control

This constitution is amended only by explicit owner/DI decision, recorded here or
in `docs/DECISIONS/`. Implementation sprints must check their work against §1–§9.
