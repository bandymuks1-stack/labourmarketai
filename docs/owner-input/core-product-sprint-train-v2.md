# Core Product Sprint Train v2 — status (with Player Card wagon)

Project: **labourmarketai** · Repo: `bandymuks1-stack/labourmarketai`
Source spec: owner's `core-product-sprint-train-v2-with-player-card.md`.

Supersedes the v1 train plan: v2 keeps Wagon 1 unchanged and inserts a new
**Wagon 2 — Player Card / CV identity surface**; the remaining wagons shift down.

Core loop this train must strengthen (never add noise around):
`Mano erdvė → Darbo žurnalas → Žemėlapis → Žinutės`

## Global rules (binding for every wagon)

- One wagon at a time; one focused PR per wagon unless owner approves otherwise.
- Do not start the next wagon until the current one is merged/deployed or owner-held.
- **No merge/deploy without owner approval.** No production DB mutation without approval.
- No DB/schema/RLS/RPC/Supabase/env/DNS/billing/payment/auth-core change unless the
  wagon is explicitly **RED** and owner approves.
- No fake skills / data / companies / messages / bookings / markers / demand.
- No public/self-view `confirmed / verified / proof / trust badge / patvirtinta /
  patvirtino / tvirtinate kaip` wording. No raw i18n keys. No raw slugs. No duplicate
  concepts. No visual-WOW redesign unless explicitly requested. Never print secrets.
- If uncertain → stop and report.

---

## Train progress

| # | Wagon | Status | Branch | PR |
|---|---|---|---|---|
| 1 | Finish PR #514 and deploy | ✅ **DONE — merged + deployed** | `audit/journal-real-world-recognition-p0` | [#514](https://github.com/bandymuks1-stack/labourmarketai/pull/514) (merged) |
| 2 | **Player Card / CV identity surface** | 🔧 **in progress — PR open, awaiting owner review** | `fix/cc/player-card-identity` | [#517](https://github.com/bandymuks1-stack/labourmarketai/pull/517) |
| 3 | Login branding | ⏳ not started | — | — |
| 4 | Approval Authority Layer 0 | ⏳ not started | — | — |
| 5 | Contact Permission + Counterpart Identity | ⏳ not started | — | — |
| 6 | Human-in-loop learning model (doc-first) | ⏳ not started | — | — |
| 7 | Map as main market surface | ⏳ not started | — | — |
| 8 | Services / bookings real model (doc-first) | ⏳ not started | — | — |
| 9 | Company control room | ⏳ not started | — | — |
| 10 | Stale data backfill (report-first) | ⏳ not started | — | — |
| 11 | Secondary surfaces cleanup | ⏳ not started | — | — |

> Train rule: only the **current** wagon is worked. Wagon 2 is **not** started until
> the owner approves moving on.

---

## Wagon 1 — Finish PR #514 and deploy ✅

**Goal:** ship the 3-level Work Journal recognition model to production.

- **Branch:** `audit/journal-real-world-recognition-p0`
- **PR:** #514 — `audit(journal): real-world recognition audit (P0)` — **MERGED (squash)**
- **Merge commit (in `main`):** `94b44a44f54727bf178694eddbaedef4eeda712f`
- **Production deploy:** Vercel — **success**

### Approved 3-level model (shipped)

1. **AUTO SIGNAL** — confident current signal, shown under "Sistema suprato" /
   detected buckets.
2. **CANDIDATE SUGGESTION** — "Panašūs įgūdžiai / Similar skills / Похожие навыки"
   (subtitle "Pasirinkite, jei tinka / Choose if this fits / Выберите, если
   подходит"); the worker **chooses** — never a current signal, never a linked fact;
   choosing routes through the existing self-declared-claim path.
3. **MANUAL ONLY** — "Susieti ranka / Add manually" fallback.

Implementation: `lib/structuring/recognition-tiers.ts` (`classifyEntryRecognition`),
`components/app/similar-skills-section.tsx`, composer wiring in
`components/app/journal-entry-composer.tsx`. Candidate-only mode hides the "what the
system understood" panel so an uncertain entry never implies understanding.

### Required behavior — verified

- `ploviau grindis` / `mopped the floor` / `мыл полы` → cleaning ("Valymo darbai"),
  **never flooring** (suppressed across every recognizer surface, incl. the profile
  narrative extractor).
- Valid installation still maps to flooring: `klojau grindis`, `dėjau laminatą`,
  `klojau parketą`, `montavau grindis`.
- Candidate suggestions never appear as current signals or linked facts.
- No fake skill, no raw slug, no confirm/verify/proof/trust wording, no duplicate
  concept (guard-enforced).

### Final counts (50-entry pack)

| Tier | Count | Required |
|---|---|---|
| AUTO SIGNAL | 35 | 35 ✅ |
| CANDIDATE SUGGESTION | 8 | 8 ✅ |
| MANUAL ONLY | 7 | 7 ✅ |
| BAD | 0 | 0 ✅ |
| DUPLICATE/RAW | 0 | 0 ✅ |

### Allowed vs forbidden scope (as executed)

- **Allowed:** deterministic recognizer logic, tier classification, candidate UI,
  i18n (LT/EN/RU), tests, docs.
- **Forbidden / not touched:** DB/schema/RLS/RPC/Supabase/env/DNS/billing/payment/
  auth-core; fake data; certification/verification wording.

### Validation (merged head `720cf93` → `main` `94b44a4`)

- quality CI green · migration-safety green (no migration files) · Vercel preview green.
- typecheck ✅ · lint ✅ · build ✅ · full vitest **398 files / 5707 tests** ✅.
- mergeable CLEAN · risky-path scan **NONE** (recognizer logic + tests + i18n + docs).

### Post-deploy smoke (production, unauthenticated) — no 404/5xx

| Route | Result |
|---|---|
| `/lt` | 200 |
| `/lt/dashboard` | 307 → 200 (auth redirect to login) |
| `/lt/dashboard/journal` | 307 → 200 |
| `/lt/dashboard/market-map` | 307 → 200 |
| `/lt/dashboard/communication` | 307 → 200 |
| `/lt/dashboard/account` | 307 → 200 |

The 307s are normal unauthenticated→login redirects, not errors.

### Confirmed safety

- **No** migrations / Supabase / DNS / env / billing / payment / auth-core changes
  applied. **No** production DB mutation. No field/function rename, no data deletion,
  no public test route, no auth bypass.

### Owner decision needed

- **None for Wagon 1** (approved, merged, deployed — closed).
- **Next:** owner go to start **Wagon 2 — Player Card / CV identity surface**.
  Not started.

---

## Wagon 2 — Player Card / CV identity surface 🔧 (IN PROGRESS — PR #517)

**Goal:** make the Player Card the single, consistent person-identity surface across
`Mano erdvė`, account/profile, CV/work-records, and the map own-marker/compact card —
"one person = one clear player identity", using existing data only.

- **Branch:** `fix/cc/player-card-identity` · **PR:** #517 (open, not merged).
- **Deliverable:** `docs/owner-input/player-card-cv-identity-surface-v1.md`.
- **Done in this PR (Layer 0):** single `personMonogram` source of person initials;
  Player Card + map own-marker now show the SAME two-letter monogram and the SAME dark
  avatar tile (map cyan blob → Player-Card dark tile; cyan ring preserved). No new
  copy/i18n; no fake data; no forbidden wording; no raw slug/key/ID.
- **Allowed (Layer 0):** UI composition from existing data, copy cleanup, route/card
  consistency, avatar/initials fallback, compact map-card consistency, empty-state
  clarity, mobile cleanup, label/concept dedupe, forbidden-wording/raw-slug guards, docs.
- **Forbidden / RED (owner-gated, NOT started):** DB/schema/RLS/RPC/Supabase migrations;
  avatar storage/RLS changes; auth/profile ownership rules; public-search exposure; paid
  visibility; ratings/reviews; verification/approval authority model; map service/demand
  layers needing schema. No fake avatar/skill/location/CV/record/availability/rating/
  badge/employer-proof. No `confirmed/verified/proof/trust/employer verified` wording.
- **Validation:** typecheck ✅ · lint ✅ · build ✅ · full vitest 399 files / 5713 tests ✅
  · risky-path scan NONE · migration-safety GREEN.
- **Noted follow-ups (Layer 0, separate):** marker `professionLabel` enrichment; migrate
  4 admin/list `initialsOf` copies to `personMonogram`.

> Owner decision needed: review + merge PR #517; then go/no-go for Wagon 3 (Login branding).

---

## RED items NOT started (carried across the train, owner-gated)

- Human-in-the-loop **learning DB model** (Wagon 6) — designed in the journal audit
  doc §4b, **not implemented**.
- Real NLP extraction model · structured multi-clause parser · stale-link DB backfill
  (Wagon 10) · broader capability-label i18n · broader language expansion ·
  approval/confirmation authority model.

---

## Notes

This file is the single source of truth for v2 train progress. Each wagon appends its
own section (branch, PR, allowed/forbidden scope, validation, RED, owner decision) and
updates the progress table. Wagon 1's full technical detail lives in
`docs/owner-input/journal-real-world-recognition-audit-p0.md`.
