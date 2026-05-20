# Roadmap

> **VISION CHECK.** Before adding or rearranging milestones, re-read
> `docs/PROJECT_VISION.md` sections **12** (six build stages), **13**
> (first sellable product), and **14** (mistakes to avoid). This roadmap
> is the operational projection of those sections; it must not drift from
> them.

Each milestone names the `PROJECT_VISION.md` (PV) sections it implements.
Six founder "etapai" map 1:1 to M1–M5+.

## M0 — Foundation ✅ (current)

Repo, lean stack, design system, placeholder governance, Supabase schema
+ RLS + reference data, public marketing site (LT+EN), live landing skin
(map, counters, player cards), enriched role sub-pages, this canonical
vision set. No auth, no CRUD, no AI.
**Implements PV:** §10 (honesty), §11 (map seed), §2/§4 (positioning,
9 markets), §1/§15 (messaging).

## M1 — Etapas 1: Product core (in progress)

### Slice 6 ✅ — Magic-link auth + multi-role + marketplace shell

Delivered: passwordless signup/login via Supabase magic link; route
group `/[locale]/auth/{signup,login,callback,logout}`; middleware that
gates `/dashboard` behind a session and `/onboarding` until the user
completes the first form; `customer` role added to the enum; multi-role
catalogue table `profile_roles` with per-role JSONB onboarding payload;
`RoleSwitcher` in the authenticated header; empty `NotificationPanel`
with cross-role-CTA architecture wired; dashboard shell with three
sections per active role (What I offer / What I seek / My proofs), four
tabs (Overview, Discover, Search, My account), all empty states honest
and pointed at M2/M3 ETAs (PV §10); full bilingual `auth.*` i18n;
Playwright harness with conditional-skip auth specs.
**Schema (applied via `0003_multi_role.sql`):** `profile_roles`,
`profiles.active_role`, `profiles.onboarded_at`; RLS helpers retargeted
to `active_role`. ADRs **0012** (multi-role) and **0013** (hybrid
marketplace pattern).

### Remaining in M1

Skill verifications schema + UI (5 levels — ADR 0009), document
statuses module, profile module deeper editing (worker
profession/skills, company industry/headcount/projects, agency
regions). **Implements PV:** §5 (Person, Skill, Document), §6
(5 verification levels — schema), §7 (roles), §8 modules 1/2/4.

## M2 — Etapas 2: First sellable company product

The `PROJECT_VISION.md` §13 product: company account, worker/candidate
profiles, skills list, document statuses, work-need creation, ranked
candidate list (explained), **work journals** (construction professions
first), **decision queue** (first-class), **teams as first-class
entity**.
**Implements PV:** §3 (matching + why), §5 (Work-need, Project, Team),
§8 modules 3/5/6/7/8/10, §13 (the 10 minimum functions).
**Schema:** `professions`, `journal_templates`, `work_journals`,
`journal_entries`, `decision_queue` (view), `team_entities`.

## M3 — Etapas 3: Work evidence + B2C marketplace

Work-evidence core; B2C `customer` marketplace
(`service_requests`, `service_bookings`) as a parallel layer over the
same worker data.
**Implements PV:** §5 (Work-evidence), §7 (`customer`), ADR 0007.
**Schema:** `service_requests`, `service_bookings`.

## M4 — Etapas 4: Agencies + intelligence + AI layer start

Agencies, external sourcing, market intelligence, and the **start of the
AI operational layer (6 agent types)** — on top of the core, never
fused with it.
**Implements PV:** §8 modules 11/12, §9 (AI agents), ADR 0011.
**Schema:** `market_intelligence_signals`.

## M5 — Etapas 5: Network effects + launch hardening

Marketplace network effects, polish, legal text, transactional email.
**Implements PV:** §8 module 13, §14 (honesty > polish).

## Post-M5 — Etapas 6+

Full market infrastructure; more profession families beyond the initial
five (`docs/PROFESSION_TEMPLATES.md`); rapid country expansion beyond the
9 (PV §4 — no core migration required).

## P1 / P2 (parallel tracks, not milestones)

- **P1 — Trust & verification depth:** maturing the 5-level model into
  scoring (OVR / company score formulas published).
- **P2 — Billing:** Stripe/Montonio, plan enforcement (pricing stays a
  governed placeholder until then).
