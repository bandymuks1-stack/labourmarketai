# Surface / Bridge / Execution cleanup — v1 audit

**Status:** internal audit method only. **Not a UI concept.**
**Scope of this PR (PR A):** navigation naming, workspace-switch scope guard,
communication clarity, and this document. Market-map runtime, journal chips, and
stale-skill review are **deferred to PR B** (see "Market Map owner decision").

> **This is an internal review method, not a product feature.** There are **no**
> visible UI sections, cards, menus, labels, routes, or copy named
> "Surface", "Bridge", or "Execution" anywhere in the app. Those three words are
> used **only** in this document and in code review, as a discipline for proving
> that every visible thing is connected to real data, state, permissions, and code.

## Definitions

- **Surface** — what the user actually sees in the UI.
- **Bridge** — what connects that surface to real data, state, permissions, routes,
  actions, and user intent.
- **Execution** — the real implementation behind it: code, route, DB/RLS, server
  action, background job, tests/guards, production behaviour.

A surface with a weak or missing Bridge/Execution must be **removed, collapsed behind
"Išsamiau", renamed honestly, or wired to real data** — never left as decoration.

## Real routes (corrected against the spec)

The original task referenced `/dashboard/messages` and a "Mano paskyra" page. The
**real** routes/labels in `apps/web/app/[locale]/dashboard/` are:

| Spec name in task          | Real route / source                                   |
|----------------------------|-------------------------------------------------------|
| Personal home ("Mano erdvė") | `/dashboard` (`dashboard/page.tsx`), tab label `auth.dashboard.tabs.overview` = "Mano erdvė" |
| Market map                 | `/dashboard/market-map`                               |
| Journal / Įrodymai         | `/dashboard/journal`                                  |
| Messages                   | **`/dashboard/communication`** (there is no `/messages`) |
| Account / "Mano paskyra"   | `/dashboard/account`; label = key `auth.dashboard.tabs.account` |
| Workspace switch           | header `RoleSwitcher` (base identities Asmuo/Įmonė) → `switchActiveRole()` |

---

## Audit tables

Decision vocabulary: `keep` · `simplify` · `collapse` · `remove` · `rename` ·
`connect to real data` · `mark honestly as not active`.

### 1. `/dashboard/market-map`

| Element | Surface | Bridge | Execution | Decision |
|---|---|---|---|---|
| Map page (`market-map/page.tsx` → `market-map-shell`) | Title + OSM/Leaflet map + signal/atlas/readiness panels | Map markers from real saved location/device/city/country; precision label honest | `market-map-*` components + ~20 guards in `lib/guards/market-map-*`; merged in #490/491 | **keep (PR B owner decision)** — living atlas stays ON the map, see below |
| "Darbo rinkos pasaulio žemėlapis" / world map | Heading/panel under map | Real `lib/work-market/atlas.ts` zones | `work-market-atlas` guards | **simplify in PR B** — fold into the single map surface, no duplicate world-map heading |
| "Rinkos atlasas" | Atlas panel | Atlas data | guards present | **collapse in PR B** — atlas detail behind "Išsamiau", not a default panel |
| "Jūsų signalai žemėlapyje" (`market-map-my-signals`) | Self-signal panel | Real self-signal state | `market-map-self-signal` guard | **simplify in PR B** — render as map marker + compact summary, not a long panel |
| "Ką galite padaryti dabar" / readiness (`market-map-owner-readiness`) | Readiness panel | Owner-availability/skills | owner-readiness guards | **collapse in PR B** — secondary detail under "Išsamiau" |
| Location/radius control | Compact form | Real saved location/precision | location precision tests | **simplify in PR B** — one compact control |

> **PR A does not touch the market-map runtime.** Decisions above are the documented
> intent for **PR B** under the owner decision recorded below.

### 2. `/dashboard/journal`

| Element | Surface | Bridge | Execution | Decision |
|---|---|---|---|---|
| Entry list | Entry cards (text, date/qty, evidence status) | Per-user entries — query scoped by `profile_id = user.id` / `workers` (`journal/page.tsx`) | journal extraction tests (#485, #490) | **keep** — data is structurally personal |
| Skill chips on entries | Skill chips per entry | Should be grounded in *that entry* (recognized_from_text / manually_linked / confirmed / stale / profile-available) | chip-filter guard added in #490 | **PR B** — make chip source explicit; do not render all profile skills per entry; stale → "Reikia peržiūrėti" |
| Edit action | "Redaguoti" | Prefills original text; text-only edit keeps structured metrics | edit-text-loss fix (#490) | **keep** |

### 3. `/dashboard/communication` (the real "Messages")

| Element | Surface | Bridge | Execution | Decision |
|---|---|---|---|---|
| Thread list | Conversation cards | `conversations` (id, subject, **kind**, created_by, updated_at) + `conversation_participants` (RLS-scoped to the user) | `communication/page.tsx`; RLS scopes visible rows | **connect to real data (PR A)** — show type + scope + counterparty/honest-unknown |
| Conversation type | `kind` badge (direct/support/team) | Real `kind` enum column | already rendered | **keep + always show** |
| Counterparty | *(was absent)* | Participant identity is **not** in the list query; RLS on other participants' profiles unverified | — | **mark honestly as not active (PR A)** — `support` → known support team; others → honest "Pašnekovas nepatikslintas"; real per-name identity = **missing bridge, PR B** |
| Workspace/scope | *(was absent)* | Conversations are **not** tied to a workspace in the schema | — | **mark honestly as not active (PR A)** — `support` → "Pagalbos kanalas"; others → honest "Kontekstas nepatikslintas" |
| Empty state | Honest empty card | n/a | existing | **keep** |

### 4. `/dashboard/account` (the page currently titled "Mano paskyra")

| Element | Surface | Bridge | Execution | Decision |
|---|---|---|---|---|
| Page title + nav tab | "Mano paskyra" | i18n `auth.dashboard.tabs.account` (single source) | nav config + account page H1 | **rename (PR A)** → **"Nustatymai"** — the page is email/theme/roles/locale/preferences |
| Email / theme / admin-UI / roles list | Settings sections | Real `profiles`, `profile_roles`, theme pref | account page reads | **keep** — these are settings, confirming the rename is honest |
| "Mano erdvės / My spaces" catalogue | Identity actions + role catalogue | Real roles/company existence (`getOwnCompany`) | `room-based-account-spaces` guard | **keep** — cross-space catalogue lives here, not in active rooms |

### 5. Header navigation

| Element | Surface | Bridge | Execution | Decision |
|---|---|---|---|---|
| Primary nav tabs | Mano erdvė / Žemėlapis / Darbo kortelė / Įrodymai / Žinutės / Mano paskyra | Derived from `feature-availability` → `navigation.ts` (single source) | `worker-nav-human-labels` guard | **rename (PR A)** — last tab "Mano paskyra" → "Nustatymai"; rest already correct |
| Bottom nav (mobile) | Same tabs, `md:hidden` | Same catalogue | `BottomNav` | **keep** — inherits the rename automatically |

### 6. Workspace switch

| Element | Surface | Bridge | Execution | Decision |
|---|---|---|---|---|
| Header role switcher | Base identities **Asmuo / Įmonė** with status chips | `switchActiveRole(role)` → `profiles.active_role` + `revalidatePath("/", "layout")` | `actions.ts:switchActiveRole`; `header-role-switcher-parity` guard | **keep — real bridge confirmed** |
| Switch labels | "Asmens erdvė" / "Įmonės erdvė" (`auth.roleSwitcher.personSpace/companySpace`) | i18n | role-switcher reads `baseIdentityLabelKey` | **rename (PR A)** — LT "Asmens erdvė" → **"Asmeninė erdvė"**; "Įmonės erdvė" already correct |

### 7. Journal skill chips — see row 2 (PR B).

### 8. Map signals / atlas / world map / location panels — see row 1 (PR B).

### 9. Settings / account / preferences — see row 4.

### 10. Company vs personal scope

| Element | Surface | Bridge | Execution | Decision |
|---|---|---|---|---|
| Personal journal under company role | Journal entries | Query keyed to `profile_id = user.id` — **never** company-scoped | `journal/page.tsx`; new `workspace-scope-isolation` guard (PR A) | **keep — no leak structurally possible**; pinned by regression guard |
| Active workspace label | Header identity chip | `active_role` resolved server-side per request; switch revalidates layout | `switchActiveRole` revalidatePath | **keep** — label updates immediately on switch |

---

## Market Map owner decision (binding for PR B)

Recorded from the owner on this PR:

- **The map must stay alive visually.** The living-atlas identity belongs **ON the
  map** — via real markers/avatars/statuses (person, company, demand, project/work
  location, own/preferred location) — **not** as long text panels stacked below the map.
- **"Compact but visible" = visual map objects + actions, not panels.** Default view:
  title "Žemėlapis", one-line explanation, the real OSM/Leaflet map, compact filters
  (Ieškau darbuotojų / Ieškau darbo / Įmonės / Žmonės / Darbo poreikiai / Prieinami
  dabar · vėliau), and real markers when real data exists.
- **"Išsamiau" is secondary only** — raw signal lists, audit/provenance, old readiness
  explanations, history, admin/debug detail, long lists not needed for the first
  action. **The real product must never live behind "Išsamiau."**
- **Selecting a marker** opens one compact action sheet (who/what, distance + honest
  precision, relevant skills/demand/readiness, "Peržiūrėti profilį", "Kreiptis",
  "Rašyti", "Išsaugoti"), respecting contact permission / free-contact quota **if such
  product logic exists**.
- **If a map object has no real bridge/action, it must not be shown as live.** If no
  real data exists for a filter, show an honest on-map empty state
  ("Kol kas nėra realių signalų šiame filtre") with a real CTA — never fake markers.
- **Contact / permission / quota logic must not be invented in PR A.** PR A only
  audits whether the Bridge/Execution exists. It does **not** — so it is recorded here
  as a **missing bridge**: when a person/company/demand marker is selected, the UI must
  eventually answer "can I contact this?", "direct / request / message?", "free contact
  allowance used or remaining?", "available for my workspace?", and "if not, why?". If
  that quota/permission logic does not exist yet, the action must honestly show
  "not active yet" or be omitted — never a fake quota.

**PR B should implement the map visual-action model only after the real data bridges
(markers, participant identity, contact permission/quota) are confirmed to exist.**

## Honest constraints recorded during this audit

- **i18n reality:** there are **11 locale files**, but only **LT / EN / RU** are
  enforced at parity (`i18n-lt-en-parity.test.ts`); the other 8 (da, de, et, lv, nl,
  no, pl, sv) are intentionally partial and use `[EN]` placeholders, ratcheted by
  `i18n-debt` (da/de baseline 766; en/lt/ru must stay at 0 markers). PR A therefore
  ships real translations for LT/EN/RU and only updates the visible `[EN]` placeholder
  text for the account label in the partial locales (no new `[EN]` debt).
- **Authenticated preview is blocked:** preview auth redirects to production, so
  authenticated screenshots cannot be captured on preview. PR A delivers code/route/
  guard proof; authenticated UI must be smoke-tested on **production after merge**.
