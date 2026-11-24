# Consolidated authenticated product cleanup — sprint spec

> **Provenance note.** The owner referenced this path as the sprint driver, but the
> file did not exist on disk at execution time (verified repeatedly). This document
> was authored by Claude Code from the owner's inline directive + the marketplace
> addendum (owner override, 2026-06-25) so the sprint has a single written spec to
> execute and review against. If an authoritative original surfaces, reconcile and
> supersede this file.

**Branch:** `feat/cc/authenticated-product-cleanup-v1` · base `main@d17be16`
**One coherent PR. No splitting. No DB / migrations / RLS / auth-permission / billing /
DNS / env / payments / production-data changes. No merge, no deploy without owner review.**

---

## 1. Goal (premium product architecture cleanup — not a card-grid cleanup)

Fix real product usability / sales-readiness problems by making the authenticated
product obey **one place per concept** and read as one premium product, not a pile
of tiles. Concretely the product must have exactly:

- **one CV** (Mano CV);
- **one person / profile identity**;
- **one company identity**;
- **one shared marketplace** connecting people and companies;
- **one map**;
- **one messages area**;
- **one account / settings area** (settings — *not* a second dashboard);
- **one admin entry**.

## 2. Marketplace addendum (owner override — binding for this sprint)

Marketplace is **not** a separate duplicated module. Marketplace is the **shared
connection layer** between people and companies, in one place.

- **Mano CV must become the person's player-card / avatar marketplace identity**, not
  just a work-record list.
- The marketplace connects existing CV / company / map / messages flows compactly and
  honestly:
  - **person side:** Mano CV / player-card / avatar / skills / work records;
  - **company side:** company profile / needs / offers / commercial actions;
  - **shared layer:** map signals + messages + (later) scouting **only when real**.
- **Do not** create duplicate marketplace pages repeating CV, company, map, messages,
  dashboard, or account.
- **Do not** create fake listings, candidates, scores, availability, markers,
  verification, or matching.
- **Do not** scatter "Samdyti / Pateikti poreikį / Pirkti paslaugas / Siūlyti
  darbuotojus / Projektai" across account/dashboard as separate cheap tiles. Group
  commercial functions under **one company / marketplace channel**.

## 3. IA audit — current state vs the rule (global)

The primary navigation already encodes most of "one of each" (good foundation):
`overview · market_map · profile_text_first · journal · communication · account_roles`
(`apps/web/lib/config/navigation.ts`). Findings against the rule:

| Concept | Canonical home | Duplication / problem found | Action this sprint |
|---|---|---|---|
| **Person identity / CV** | `/dashboard/profile` (edit+hub) | identity split across `/dashboard/profile`, `/cv` (export), `/dashboard/player-card` (card); player-card hid the real photo behind initials | **Mano CV = player-card/avatar identity**: card shows real avatar; CV export honest name; journal→CV bridge; profile stays the single person home; `/cv` = export derivative; player-card = identity facet (no new identity page) |
| **Company identity** | `/dashboard/company` | — | keep single; commercial actions grouped under company channel |
| **Marketplace (shared layer)** | `market-map` + `communication` | no duplicate marketplace page exists (good) — the connection layer is map signals + messages, already shared by person & company action sets | keep as the shared layer; do **not** add a duplicate marketplace page |
| **Map** | `/dashboard/market-map` | single | keep single |
| **Messages** | `/dashboard/communication` | account page labelled the **manager evidence-inbox** (`/dashboard/inbox`) as "Žinutės / Messages" → two "messages" | relabel inbox link to its true purpose (manager work-review); messages = communication only |
| **Account / settings** | `/dashboard/account` | account hosts the **full action catalogue (both identities) + My Spaces + role catalogue** → reads as a second dashboard | reduce dashboard-feel (settings framing, clarify it is identity/spaces not a launcher). **Conflict flagged — see §5** |
| **Admin** | admin badge in header (`role-switcher.tsx`) → `/dashboard/admin` | already one fast entry, admin-only | keep; verify only |
| **Commercial actions** | company identity block (`identity-actions.tsx` `COMPANY_ACTIONS`) | already grouped (need/hire/buy/offer/projects) — NOT scattered as raw tiles | keep grouped; remove duplicate "next actions" tile on company dashboard |
| **Skill recognition** | `lib/structuring/*` | logic already sector-neutral (DEFAULT_SECTOR="other", guard-enforced); residual construction prominence lives only in **marketing demo content** | out of authenticated scope — documented, deferred to a marketing pass |
| **Overflow** | dashboard grids | a few non-responsive grids (opportunities, company counts) | targeted responsive fixes |

## 4. In-scope this PR (concrete, bounded, no DB/auth)

1. **Mano CV = player-card / avatar identity** — scouting card renders the real
   consented avatar (photo→monogram fallback) on `/dashboard/player-card` and the
   today screen; CV export shows an honest "name not added yet" instead of a blank/`—`.
2. **Journal → CV bridge** — the work log shows `confirmed/total` entries and a link to
   the CV it feeds (honest counts only).
3. **One messages** — relabel the manager evidence-inbox away from "Messages"; ensure
   communication is the only "messages" surface.
4. **Commercial actions grouped** — keep all company commercial actions under the one
   company channel; remove the duplicate generic "next actions" tile on the company
   dashboard.
5. **Account = settings, not a dashboard (safe portion)** — settings framing + clarify
   the spaces/identity catalogue is not a launcher; see §5 for the deferred structural part.
6. **Overflow** — responsive grid fixes; break-words on card titles.
7. **Guards** — extend/add guards locking: player-card uses the avatar, CV name
   fallback, single "messages" concept. Do not break existing IA guards.

## 5. Superseded decisions / guards (owner override 2026-06-25 — done in THIS PR)

The owner directive overrides the earlier IA. A guard that protects wrong product
architecture is product debt, not a blocker — so these are superseded and their guards
updated in this PR (documented, not silently broken):

| Superseded | Old rule | New rule (this PR) |
|---|---|---|
| **PR #204** `room-based-account-spaces-ia-reset-v1` + `room-based-account-spaces.test.ts` (L105–110) | All-roles catalogue + future-module grid **must live on `/dashboard/account`** | **Account = settings only.** The cross-space catalogue + coming-later grid are removed from account; the person↔company identity model is served by the role switcher + the overview's identity actions + `/dashboard/start/*`. Active room stays clean (that intent kept). |
| `worker-player-card-honesty.test.ts` (L37 mounts on `/dashboard/player-card`) | Player card lives on its own route | **Mano CV (`/dashboard/profile`) leads with the player-card/avatar identity.** `/dashboard/player-card` redirects into Mano CV; the honesty mount assertion repoints to the profile page. |
| `identity-actions.tsx` company grid | Commercial actions render as a grid of separate peer tiles | **One compact company/commercial channel** — collapsed, not a scatter of cheap tiles. |

### New target IA (one place per concept) — canonical surfaces (owner correction 2026-06-25)

- **Profilis / Asmuo** = `/dashboard/profile` — the **edit identity** surface only:
  personal data, avatar upload/edit, skills/profile fields. **Not** the CV page.
- **Mano CV** = the **visible work-records surface** (canonical route
  `/dashboard/journal`; the legacy `journal` route keeps working). Leads with the
  **player-card / avatar identity** at the top, then the **work records** below. This
  is the person's marketplace identity.
- **Darbo kortelė / player-card** = the **visual layer inside Mano CV** (the player
  card at the top of the Mano CV surface), **not** a separate competing page.
  `/dashboard/player-card` → **redirects to the Mano CV surface** (`/dashboard/journal`).
- **`/cv`** = export / share derivative only (print-to-PDF), never the main authenticated
  editing surface.
- **Company identity** = `/dashboard/company` — one compact commercial channel
  (needs / offers / hire / buy / projects grouped, not scattered).
- **Marketplace** = the shared connection layer: person (Mano CV) ↔ shared
  (`market-map` signals + `communication` messages) ↔ company channel. No duplicate
  marketplace page; no fake listings/scores/matching (later scouting only when real).
- **One map** `market-map` · **one messages** `communication` · **one account
  (settings only)** `/dashboard/account` · **one admin** (header badge).

> Correction applied: an earlier draft put the player-card lead on `/dashboard/profile`.
> That is reverted — Profilis stays the edit surface; the player-card/avatar identity +
> work records lead **Mano CV** (the journal surface). No duplicate Profile/CV/player-card.

## 6. Hard boundaries

No DB, migrations, RLS, auth-permission changes, billing, DNS, env, payments,
production data, merge, or deploy. Copy / UI / IA / component-level only.

## 7. Delivered (this PR) + validation

**Visible IA now (no competing identity entries):**
- Primary nav: `Mano erdvė · Žemėlapis · Profilis · Mano CV · Žinutės · Nustatymai`
  (the old `Darbo kortelė` profile tab → **Profilis**; journal tab → **Mano CV** in all
  11 locales).
- **Profilis** (`/dashboard/profile`) = edit person/profile data + avatar upload.
- **Mano CV** (`/dashboard/journal`) = player-card/avatar identity lead + readiness
  panel + work records + journal→CV bridge.
- **`/dashboard/player-card`** → redirects to Mano CV; removed from the account menu,
  identity actions, and project-ops link. **`/cv`** = export only (honest name fallback).
- **Account** (`/dashboard/account`) = settings only (email, edit-identity link,
  appearance, admin-UI, roles list, language, sign out). Catalogue + future-grid +
  identity-actions removed.
- **Company/commercial** = one compact channel (`CompanyChannel`) grouping
  need/hire/buy/offer/projects; map + messages stay the shared nav layer.
- **Messaging** one place: the manager evidence-inbox relabelled "Work review"
  (`journal.inbox.title`, added in 11 locales — it was a latent missing key).

**Superseded guards (updated + documented):** room-based-account-spaces,
room-separation, action-truth, clickable-affordance, owner-role-select-dashboard,
product-readiness (×2), identity-action-workspace, command-center, market-map-nav,
dashboard-active-role-overview, feature-reachability, worker-nav-human-labels,
avatar-upload-real, readiness-chain, worker-player-card-honesty,
project-operations-launch.

**Investigated, no change (documented honestly):**
- *Overflow*: dashboard grids already use sound responsive patterns (`min-w-0`,
  `truncate`, `break-all`, responsive `grid-cols`); no confirmed overflow bug warranted
  a speculative layout change unverifiable without a browser.
- *Company "duplicate" next-actions*: `CompanyActionNextActions` is a consistent,
  guard-protected cross-room flow card (agency/buyer/candidates/company/projects),
  distinct from the company-specific `CompanyNextActions` status card — not a true
  duplicate; left intact.

**Validation (all green):** typecheck 0 · lint 0 · `check:i18n-debt` OK (within
baseline) · `placeholders:check` OK · full vitest **5054/5054** · `next build` OK.

**Status:** open as a **draft PR for owner review** — not merged, not deployed.
