# LabourMarket.ai — Systemic UX / Roles / Map / Communication / Skills Audit (v1)

> Stage 1 deliverable. Audit **before** code changes. Findings come from a read-only
> sweep of `apps/web/app`, `apps/web/lib`, `apps/web/components`, `apps/web/messages`,
> and `supabase/migrations`. Each row marks whether the issue is a **symptom** or a
> **systemic** root cause, the likely root cause, the proposed fix, priority, and
> whether a DB migration is required.

Date: 2026-06-16 · Branch: `fix/systemic-ux-roles-skills-map-comms-v1`

## Legend

- **Type**: `SYSTEMIC` = shared root cause; `symptom` = surface instance of a systemic cause.
- **Prio**: P0 (identity/skill-recognition/map-chat/mobile-break/admin-leak/false-evidence), P1, P2.
- **DB migr.**: does the fix require a Supabase migration? **Fixable w/o DB?**

---

## A. Role / identity / space logic

| Route / component | Problem | Repro | Type | Likely root cause | Proposed fix | Prio | DB migr. | Fixable w/o DB |
|---|---|---|---|---|---|---|---|---|
| `lib/config/roles.ts` (`customer` row), `components/app/role-switcher.tsx`, `dashboard/start` | "Pirkėjas" (buyer) and "Agentūra" (agency) appear as **top-level switchable roles/spaces** | Open role switcher / "Mano erdvės" → see Pirkėjas + (legacy) Agentūra as peer spaces | **SYSTEMIC** | Legacy 4-role model (`worker\|company\|agency\|customer`) still drives the switcher; `customer` is `start-available`, switcher renders every *held* role verbatim | `customer.availability="hidden"`; filter switcher's held-role map to switchable identities (worker/company); reframe `/dashboard/start` as Įmonė setup with buy/agency as actions | P0 | No | **Yes** |
| `components/app/identity-actions.tsx` | Correct model already exists (Asmuo/Įmonė + action cards buy/hire/offer/need) but is not the sole identity surface | n/a | SYSTEMIC | Two parallel identity models live simultaneously | Make IdentityActions the canonical surface; keep `/dashboard/buyer` + `/dashboard/agency` as **action destinations** only | P0 | No | Yes |
| `lib/auth/actions.ts:8` `Role` union | `agency`/`customer` are DB enum values + `profile_roles` rows | n/a | SYSTEMIC (data) | DB enum carries the wrong identities | **Defer** true data collapse to a separate RED migration (re-map agency/customer→company + company_type/action flag); UI-only fix now | P1 | Yes (follow-up) | Partial |

## B. Skills: taxonomy, recognition, evidence

| Route / component | Problem | Repro | Type | Likely root cause | Proposed fix | Prio | DB migr. | Fixable w/o DB |
|---|---|---|---|---|---|---|---|---|
| `components/app/capability-profile-section.tsx`, `messages/*/skill-names.json` | Skill taxonomy mixed in one flat list (profession + task + general + admin together) | Profile → all skills are one chip list | **SYSTEMIC** | No functional group axis; DB `skills.category` is construction sub-discipline only; i18n names are flat | Add slug→`skill_group` map (profession / specific / general / administrative / evidence) + render grouped | P1 | No (static map) | **Yes** |
| `components/app/journal-entry-composer.tsx:489-499` | **Skill recognition is NOT run on the primary "Save" button** — only the optional "Sutvarkyti tekstą" button calls `analyse()` | Type journal text, press Save → no skills recognized | **SYSTEMIC** | Primary submit calls `submit()` directly, bypassing `extractJournalSuggestions`/`recognizeSkills` | Run recognition automatically as part of analyse-before-save / surface suggestions on save | P0 | No | **Yes** |
| `components/app/journal-entry-composer.tsx:225-233` | Recognized skills filtered to **already-declared slugs only** → new workers get nothing | New worker w/ 0 declared skills sees no matches | **SYSTEMIC** | `workerSkillBySlug` declared-only filter discards undeclared matches; v1.1 path excludes low-confidence + caps at 4 | Surface recognized-but-undeclared skills as add-to-profile suggestions; keep low-confidence in suggestion bucket | P0 | No | Yes |
| `lib/structuring/keywords.ts`, `synonyms.ts` | LT dictionary gaps: no needles for nuotekos/drainage, vėdinimas/HVAC, šildymas, recruiting (darbuotojų paieška), scheduling (grafikų derinimas), generic "pildžiau dokumentus" | Test sentences recognize only partially | **SYSTEMIC** | Construction-biased lexicon; many `skill-names.json` slugs have zero keyword rows | Add LT needles + synonyms for the gaps; add CI check that every skill slug has ≥1 keyword | P0 | No | Yes |
| `components/app/profile-hub-overview.tsx:117-140` + `messages/lt.json:247-248` | **"Paremta darbo įrašais: 6 iš 21"** shown together with **"Dar nėra darbo įrašų..."** — contradiction | Profile with supported>0 and unsupported>0 | **SYSTEMIC** | Two predicates over same `deriveSkillEvidence` both fire; `noneYet` copy reads as absolute | Deterministic status text: 0→"Dar nėra darbo įrašų...", 1..N-1→"Kai kuriuos įgūdžius jau paremia darbo įrašai.", N→"Visi šie įgūdžiai turi darbo įrašų pagrindimą." Never show both | P0 | No | **Yes** |
| `lib/profile/skill-evidence-state.ts` (exists, not surfaced) | Per-skill evidence status (self/work/manager/document/unverified) not shown per chip | Profile chips show generic "self-declared" | symptom | 3 parallel evidence models; only coarse one surfaced | Surface per-skill state; consolidate models | P1 | No | Yes |

## C. Project page: location + communication

| Route / component | Problem | Repro | Type | Likely root cause | Proposed fix | Prio | DB migr. | Fixable w/o DB |
|---|---|---|---|---|---|---|---|---|
| `app/[locale]/dashboard/projects/[id]/page.tsx` | **No location block** — only a tiny city chip; `country` fetched but never rendered; no location-status, no map-context zone | Open a project → no "Vieta" block | **SYSTEMIC (missing capability)** | Page never renders a location section; projects have `city`+`country` already | Add honest Location block (city/country + status + context zone). No fake marker — show "Vieta nurodyta tekstu, žemėlapio taškas dar nepatvirtintas." | P0 | No (city/country exist) | **Yes** |
| `app/[locale]/dashboard/projects/[id]/page.tsx`, `components/app/arena/project-map.tsx` | **No communication entry** on project detail or cards | Open a project → no chat CTA | **SYSTEMIC (missing capability)** | No project→conversation wiring; `conversations` model exists (0021) but no project link | Add "Pokalbis dėl projekto" CTA + "Komunikacija" block; wire to `getOrCreateDirectConversation` with project-context `subject` (no migration). True project-bound thread = follow-up migration | P0 | No (subject-tagged) | **Yes** |
| `lib/market-map/demand-locations.ts` | Honest signal-only vocabulary exists and must be reused for project location | n/a | reference | — | Reuse `isMappable` rule + status vocabulary | — | No | Yes |

## D. Admin / telemetry / technical-term leakage

| Route / component | Problem | Repro | Type | Likely root cause | Proposed fix | Prio | DB migr. | Fixable w/o DB |
|---|---|---|---|---|---|---|---|---|
| `app/[locale]/dashboard/admin/*` | No shared admin **layout** guard — each of 15 pages repeats `requireSuperadmin` (fragile; a new page that forgets leaks) | n/a (all current pages gated) | **SYSTEMIC (fragility)** | Per-page gating, no structural fail-closed | Add `dashboard/admin/layout.tsx` calling `requireSuperadmin` once; keep per-page as defense-in-depth | P0 | No | **Yes** |
| `components/app/arena/project-map.tsx:68`, `messages/*.json:3389,3399,117,3541` | User-facing "ARENA"/"areną" leak | Manager map button "Atidaryti areną" | SYSTEMIC | Internal term in user copy | Rename ARENA→"Projekto eiga" | P1 | No | Yes |
| `app/[locale]/dashboard/projects/page.tsx:140`, `messages/lt.json:3399` | "Draftas — projektai ir komandos" unexplained | Projects page header | symptom | Internal term | Rename "Draftas"→"Ruošiama" | P1 | No | Yes |
| `messages/{lt,en}.json:2707` | "(read-only)" unexplained in user gate screen | Company coming-soon gate | symptom | Internal term | "tik peržiūrai" / "view only" | P1 | No | Yes |
| `messages/*.json` admin namespaces (telemetry/QA/v1/task_name) | These appear ONLY in admin-gated screens — acceptable | n/a | not-a-leak | — | Add namespace-aware guard so they never leak into user copy | P1 | No | Yes |

> NOTE on owner seeing "Operacijų telemetrija (v1)": all those strings live in admin-only
> namespaces and pages are correctly gated; most likely the owner's account carried an
> admin signal (`active_role='admin'` or `profile_roles` admin row). Fix hardens structure
> + adds a guard so it can never leak to a genuine non-admin.

## E. Mobile UX / overflow / native pickers

| Route / component | Problem | Repro @360 | Type | Likely root cause | Proposed fix | Prio | DB migr. | Fixable w/o DB |
|---|---|---|---|---|---|---|---|---|
| `components/app/arena/confirm-pulse.tsx:20-49` | "N įrašai laukia tavo patvirtinimo" CTA overlaps/squeezes text | 360px | **SYSTEMIC** | CTA lacks `shrink-0`/`w-full` fallback; row only `flex-wrap` | `flex-col gap-3 sm:flex-row`; CTA `w-full sm:w-auto shrink-0` | P0 | No | **Yes** |
| `app/[locale]/dashboard/profile/page.tsx:314-356` | 4-link action row ("Man tinkamos galimybės / Eksportuoti CV / …") wraps raggedly | 360px | **SYSTEMIC** | No "max 2 + Daugiau" overflow pattern anywhere | Shared `ActionRow` (2 primary + "Daugiau" → MobileSheet) | P0 | No | Yes |
| `components/app/demand-request-button.tsx:347,368,397` | Native white `<select>` (profession/country/accommodation) in dark app, mixed with one DarkListbox | open form on Android | **SYSTEMIC** | 60 native `<select>` across 27 files; DarkListbox/OptionCards exist but under-adopted | Replace with `DarkListbox`/`OptionCards`; guard new raw `<select>` | P0 | No | Yes |
| `components/app/project-operations-board.tsx:206,308,333` | Project rows rely on `justify-between`+wrap, no `sm` stacking | 360px | symptom | Missing `flex-col sm:flex-row` + `min-w-0` | Stack rows on mobile | P1 | No | Yes |
| `playwright.config.ts` | No mobile viewport smoke (360/390/430) | n/a | SYSTEMIC (coverage) | Only Desktop Chrome project | Add mobile device projects + no-horizontal-overflow assertion | P1 | No | Yes |
| `role-switcher.tsx`, `profession-skills-picker.tsx`, `worker-trade-profile.tsx` | Already custom dark (NOT native) | n/a | not-a-bug | — | Leave as-is | — | No | Yes |

---

## Systemic root causes (the few causes behind many symptoms)

1. **Two parallel identity models.** Legacy 4-role (`worker/company/agency/customer`) coexists with the correct 2-identity + actions model (`IdentityActions`). Fix = make the 4-role plumbing surface only Asmuo/Įmonė/Admin and treat buy/sell/hire/agency as actions.
2. **Skill recognition is wired to the wrong button + over-filtered + under-vocabularied.** Three independent breaks that together make text→skill recognition feel dead.
3. **Evidence status computed by two predicates that can both be true** → contradictory copy. Needs one deterministic status function.
4. **Projects are cards, not work objects.** Location + communication capabilities simply were never rendered, though the data (`city`/`country`) and the conversation model already exist.
5. **Per-page admin gating with no structural fail-closed**, plus internal terms (ARENA/Draftas/read-only) leaking into user copy. Needs a layout guard + a namespace-aware term guard.
6. **Dark design-system controls exist (DarkListbox/MobileSheet/OptionCards) but were never rolled out**, and there is no shared overflow/action-row pattern → native white pickers + clipped CTA rows.

## DB-migration boundary (deferred, owner-gated)

- True identity data collapse (agency/customer enum → company + company_type) — **RED migration, follow-up**.
- Verified project map **markers** (lat/lng on `projects`) — **migration, follow-up**. v1 shows honest text-only status only.
- One persistent **project-bound** conversation thread (`conversations.project_id`) — **migration, follow-up**. v1 uses subject-tagged direct conversation.
- Real skill-evidence **persistence** beyond existing `journal_entry_skills` — **no new migration this sprint**.

Everything marked **Fixable w/o DB = Yes** is in scope for this sprint.
