# Visible product structure audit — v1

**Purpose:** map the whole currently visible Labourmarket.ai product as a normal user would understand it, before an owner visual review. **Audit/report only — no product behavior changed, no schema/RLS/permission work, no redesign, no new features, no merge, no deploy.**

**Method:** read-only source review (routes, components, i18n, queries) on `main` after the latest merge. No production DB queries. Findings are grounded in what the code actually renders today.

**Status legend:** **GREEN** = clear, connected, useful, safe to keep visible · **YELLOW** = useful but confusing / duplicated / copy or placement needs simplification · **RED** = should not be visible as a normal user feature yet (incomplete, sample/placeholder, unconnected, or needs schema/RLS/permission).

---

## 0. Headline findings (read this first)

1. **The core is honest.** Almost every real surface is wired to real Supabase data with honest empty/"Ruošiama" states. No fake counts, no dead CTAs in the core, no fake verification. This is a strong base.
2. **Primary navigation is too thin; the real product is buried.** The authenticated primary nav shows only **4 user tabs** — *Mano erdvė, Žemėlapis, Žinutės, Nustatymai*. Two of the six things the owner considers primary — **Darbo žurnalas** (`/journal`) and **Mano profilis / CV** (`/profile` + `/cv`) — are real but reachable only via in-page action cards or direct URL. Meanwhile ~25 other real routes have **no primary home at all**.
3. **There are three sample-data "preview" surfaces visible to any logged-in user** — `/talent`, `/visual-os`, `/visual-os/agency` (and a `/design` playground). They are honestly labelled "Sample ·" / "VISUAL PLAN · NOT A FEATURE PATH", but a normal user can still reach them. → **RED: make admin/owner-only.**
4. **Identity is split across 4–5 surfaces** (profile / journal / cv / player-card / reports-evidence). player-card already redirects into journal; the rest are real but overlap in the user's mind. → consolidate under one "Mano profilis / CV".
5. **"Message-like" surfaces are three different things** — *Žinutės* (`/communication`), *Žurnalas peržiūrai* (`/inbox`), *Nurodymai* (`/instructions`) — with no shared home. → naming/grouping needs simplification.
6. **Discovery is spread across many doors** — map, marketplace(redirect), opportunities, candidates, talent, search, company/scouting — several of which point at the same idea. Map-first is already the intended correction; finish it.

---

## 1. Public surface (`/lt` and marketing)

**Verdict: GREEN overall — honest, source-backed, clearly explains the product.** A visitor can tell within the hero what Labourmarket.ai is: "create a profile with real, evidenced skills and get matched to real work needs, for workers and employers across Europe."

**Public routes reviewed (all under `/[locale]/(marketing)` unless noted):** `/` (landing), `/for-workers`, `/for-companies`, `/for-agencies`, `/pricing`, `/vision` (gated, noindex, owner preview), `/labour-market` + `/labour-market/[country]` (LT/LV/EE live; PL/DE/NL/DK/NO/SE "coming soon"), `/work-abroad`, `/work-opportunities`, `/worker-intake`, `/company-need`, `/match-preview`, `/professions`, `/skills`, `/legal/terms|privacy|cookies|marketplace-rules`; auth: `/auth/login|signup|forgot-password|reset-password` (+ `callback`, `logout` route handlers).

**Strengths:**
- Every market stat links to an official EU source (Eurostat/EURES/Cedefop) with a date.
- AI is consistently caveated ("a draft you review", "does not verify", "nothing is saved/published automatically").
- Legal pages honestly say "being prepared" rather than publishing fake terms; marketplace-rules is real and live.
- Login/register entry points are clear (top-nav "Log in" / "Start Now"; CTAs across pages → `/auth/signup`).

**Flags:**
| # | Item | Class | Note |
|---|---|---|---|
| 1 | **Three preview-only public forms** (`/worker-intake`, `/company-need`, `/match-preview`) all compute/draft but save nothing | YELLOW | Intentional signup funnel and clearly labelled, but a first-time visitor can mistake them for the real app. Consider one clear "preview" framing + a single primary intake. |
| 2 | **"available across nine countries"** (for-workers) vs only 3 live country pages | YELLOW | Not false ("available"), but invites "where are the other six?". Clarify. |
| 3 | **"Explainable fit direction"** (for-agencies) | YELLOW | Reads as an AI/matching promise; confirm it maps to the real deterministic scouting, not an unbuilt AI. |
| 4 | **Footer "Created by …" studio credit** | YELLOW | A partner/brand credit in public UI. Confirm against the "no external brand names in public UI" rule; keep only if owner-approved. |
| 5 | Pricing shows 4 tiers but "pricing not final / billing never starts here" | GREEN | Honest; no real payment button. Keep. |
| 6 | `/vision` reachable by direct URL though gated | GREEN | noindex + internal-preview banner; low risk. |

No raw i18n keys and no dead CTAs were found on the public surface.

---

## 2. Authenticated main structure

**Entry:** `/dashboard` is a single page that branches on the user's active role (worker vs company/agency/customer). All data is real (professions, skills, journal counts, pending review via RPC, pending bookings, own demand requests).

Reviewed in depth: `/dashboard`, `/dashboard/market-map`, `/dashboard/journal`, `/dashboard/communication` (+ `/[conversationId]`), `/dashboard/account`, `/dashboard/profile`, `/dashboard/cv` (also top-level `/cv`), `/dashboard/player-card` (→ redirect), company/agency/buyer spaces, projects, inbox, instructions, scouting, candidates, opportunities, bookings, documents, reports/evidence, start/*, and the design-preview surfaces.

The detailed per-route behavior is in the **Function map (§4)**. Headline: **the authenticated core is connected and honest**; the problem is **structure and surface count**, not fakery — except the three sample-data preview routes (§4, RED).

---

## 3. Navigation model

### 3.1 Primary nav (desktop tabs `DashboardTabs` + mobile `BottomNav`)
Sourced from `lib/config/navigation.ts` → `VISIBLE_PRIMARY_NAV_ITEMS` (+ `ADMIN_NAV_ITEM`). Active-state + `aria-current` are correct; mobile omits admin by design.

| Order | id | Route | LT label | Class |
|---|---|---|---|---|
| 1 | overview | `/dashboard` | **Mano erdvė** | GREEN |
| 2 | market_map | `/dashboard/market-map` | **Žemėlapis** | GREEN |
| 3 | communication | `/dashboard/communication` | **Žinutės** | GREEN |
| 4 | account_roles | `/dashboard/account` | **Nustatymai** | GREEN |
| (cond) | admin | `/dashboard/admin` | **Administravimas** | GREEN (admin-only; desktop only) |

**Gap vs owner target:** *Darbo žurnalas* and *Mano profilis / CV* are **not** primary tabs today — they live in the in-page `IdentityActions` cards. That is the single biggest structural gap.

### 3.2 Account / header menu (`AccountMenu`, `RoleSwitcher`, `CurrentSpaceHeader`)
- **AccountMenu** (avatar dropdown): Admin (if admin) → `/dashboard/admin`; Account → `/dashboard/account`; Sign out (POST logout). Product areas were deliberately removed from here.
- **RoleSwitcher**: switches **base identity** — *Asmuo* (person/worker) vs *Įmonė* (company; agency/customer fold in). Missing identities → "Add role" → `/dashboard/start/{role}`.
- **CurrentSpaceHeader**: shows the active space name + one-line purpose + "My spaces" → `/dashboard/account`.

### 3.3 Dashboard cards (home)
Worker home: `IdentityActions` (Profilis & CV, Žemėlapis, Žinutės, Manage spaces), `TodayScreen`, `WorkCard`, invitations, pending-bookings card (only if >0). Company/agency home: identity actions, single `DashboardNextAction`, chain actions, demand intake + honest readback. **All real data.**

### 3.4 Duplicate exits / same-thing-different-name (flagged)
| Cluster | Surfaces | Issue |
|---|---|---|
| **Identity** | `/profile` (Profilis), `/journal` (Darbo žurnalas, with player-card as visual lead), `/cv` (printable), `/player-card` (→ redirects to journal), `/reports/evidence` | 4–5 doors around "my skills / CV / identity". Real, but overlapping in the user's mind. |
| **Discovery** | `/market-map`, `/marketplace` (→ redirects to map), `/opportunities`, `/candidates`, `/talent` (sample), `/search` (honest placeholder → scouting), `/company/scouting` | Many discovery doors; map-first is the intended single direction but several doors remain. |
| **Message-like** | `/communication` (Žinutės), `/inbox` (+ `/quick`, `/report` — manager journal review), `/instructions` (Nurodymai) | Three different functions that all read as "messages/notifications" with no shared home. |
| **Company role spaces** | `/company`, `/agency`, `/buyer`, `/start` (+ `/start/company|agency|buyer`) | Several setup/space routes; `/start` already unifies entry, but the spaces themselves are separate. |
| **Account** | `/account` tab labelled **Nustatymai** but its feature key is `account_roles` ("Vaidmenys") | Tab label is fine; internal naming tension only. |

### 3.5 Primary vs secondary vs hidden (recommendation preview)
- **Primary (promote to tabs):** Mano erdvė, Žemėlapis, Žinutės, **Darbo žurnalas**, **Mano profilis / CV**, Nustatymai.
- **Secondary (inside a space, not a global tab):** company/agency/buyer, projects, scouting, candidates, bookings, documents, opportunities, inbox(review), instructions, reports/evidence, start.
- **Admin-only / hidden:** admin/*, **talent, visual-os, visual-os/agency, design** (sample/preview).

---

## 4. Function map

Class key: **R** = real data · **HP** = honest placeholder (admits what's missing, points to real path) · **S** = sample/placeholder data · **RD** = redirect.

| Function (LT) | Route | User thinks it… | Actually does today | Data | Safe visible? | Action |
|---|---|---|---|---|---|---|
| Mano erdvė | `/dashboard` | my home / next step | role-aware overview, one next action | R | yes | **keep** (primary) — GREEN |
| Žemėlapis | `/market-map` | see myself & market on a map | signal-only map; future layers marked "Ruošiama"; no fake markers | R | yes | **keep** (primary) — GREEN |
| Darbo žurnalas | `/journal` | log work, builds my CV | real entries + confirmation states; player-card visual lead | R | yes | **promote to primary** — GREEN data / YELLOW placement |
| Mano profilis | `/profile` | my profile & skills | real skills/professions/engagements/trust counts | R | yes | **promote + consolidate** — GREEN / YELLOW |
| Mano CV | `/cv` (and `/dashboard/cv`) | printable verified CV | real verified CV (tiers, proofs), print-to-PDF | R | yes | **fold under profile/CV** — GREEN / YELLOW |
| Mano darbo kortelė | `/player-card` | my card | **redirects → /journal** | RD | yes | keep as redirect — GREEN |
| Įrodymų ataskaita | `/reports/evidence` | evidence report | real evidence ladder, print-to-PDF | R | yes | secondary under profile/CV — GREEN |
| Žinutės | `/communication` (+ `/[id]`) | my messages | real RLS-scoped threads; honest restricted counterpart (just fixed) | R | yes | **keep** (primary) — GREEN |
| Žurnalas peržiūrai | `/inbox` (+ `/quick`,`/report`) | inbox | **manager** journal-review queue (gated RPC) | R | yes (managers) | rename/group as a manager tool — YELLOW |
| Nurodymai | `/instructions` | messages? | work-instruction channel (v1 pilot) | R | yes | group with Žinutės conceptually — YELLOW |
| Pasiūlymai | `/bookings` | my proposals | real bookings accept/decline; honest degradation | R | yes | secondary; surface in home when pending — GREEN |
| Nustatymai | `/account` | settings | email/appearance/language/roles/sign-out | R | yes | **keep** (primary) — GREEN |
| Įmonės erdvė | `/company` (+ `/projects/new`, `/scouting`) | run my company | real company ops, demand draft, scouting | R | yes (company) | secondary space — GREEN |
| Agentūros erdvė | `/agency` (+ `/pool`) | run my agency | real agency ops | R | yes (agency) | secondary space — GREEN |
| Pirkėjo erdvė | `/buyer` | my requests | real buyer requests, manual review | R | yes (buyer) | secondary space — GREEN |
| Nuo ko pradėti | `/start` (+ role setups) | how to begin | real entity-state hub + setup forms | R | yes | keep (entry) — GREEN |
| Projektai | `/projects` (+ `/[id]`,`/operations`) | run projects | real projects/assignments | R | yes (manager) | secondary — GREEN |
| Talento paieška pagal poreikį | `/company/scouting` | search candidates by need | real deterministic match, anonymized previews | R | yes (company) | this is the real "search" — GREEN |
| Talento paieška | `/search` | free-text search | **honestly says no search yet** → points to scouting + post-a-need | HP | yes | merge into scouting entry — GREEN (honest) |
| Man tinkamos galimybės | `/opportunities` | jobs for me | real readiness; opportunities list empty until matching RPC live | R/HP | yes | keep but **hide list until matching live** — YELLOW |
| Kandidatai | `/candidates` | candidate drafts | real private drafts (unregistered, not verified) | R | yes | secondary — GREEN |
| Dokumentai | `/documents` | my documents | feature-flag OFF → honest "Ruošiama" roadmap note | R (flagged) | yes | keep hidden until enabled — GREEN |
| Talent (preview) | `/talent` | a talent feed | **hardcoded "Sample ·" data**, disabled CTAs | S | **no** | **admin/owner-only or hide** — RED |
| Visual OS (preview) | `/visual-os` (+ `/agency`) | a dashboard | "VISUAL PLAN · NOT A FEATURE PATH", sample data | S | **no** | **admin/owner-only or hide** — RED |
| Design playground | `/design` (+ `/text-first`) | — | design/spec surface | S/internal | **no** | **admin/owner-only or hide** — RED |
| Administravimas | `/dashboard/admin/*` (15 sub-routes) | — | real internal control room; `requireSuperadmin`; admin-context banner | R | admin-only | keep internal — GREEN |
| Onboarding | `/onboarding` | first-run | onboarding flow | R | yes | keep — GREEN |

**Admin sub-routes (internal only, behind `requireSuperadmin`):** agent-os, billing, candidate-pool, company-verification, language-feedback, league, market, matching, need-structuring, project-truth, readiness, support, telemetry, users/[id]. No admin language was found leaking into normal-user UI; the admin tab/badge render only for admins.

---

## 5. User journey map

**A. Improve my profile** — Start: `/dashboard` (Mano erdvė) → `IdentityActions` "Profilis & CV" → `/profile`. *Confusing:* profile vs journal vs cv are separate doors; no single "Mano profilis / CV" tab. *Dead-end:* none. *Duplicate path:* player-card → journal. *Missing:* one primary home. *Simplify:* one primary "Mano profilis / CV" tab grouping profile + cv + evidence.

**B. Record work / skills** — Start: `/dashboard` → "Darbo žurnalas" card → `/journal` → add entry. *Confusing:* journal not in primary nav; "Darbo ar veiklos įrašas" (feature label) vs "Darbo žurnalas" (tab idea) wording. *Dead-end:* honest "no context" if no engagement. *Simplify:* promote Darbo žurnalas to a primary tab.

**C. Be visible on the map** — Start: `/dashboard` → Žemėlapis → `/market-map`. *Confusing:* what makes me appear is implicit (availability/consent/location); future layers say "Ruošiama". *Dead-end:* none. *Simplify:* one short "what puts me on the map" line linking to profile/availability.

**D. Company understands what it can do** — Start: signup → `/dashboard` (company role) → next action + demand intake; deeper at `/company` and `/start`. *Confusing:* company vs agency vs buyer vs start vs visual-os/agency(sample); marketplace vs map vs scouting. *Dead-end:* none in real spaces. *Simplify:* one "Įmonės erdvė" space hub; hide the sample agency card from users.

**E. Message / contact someone** — Start: `/communication` (Žinutės). *Confusing:* contact is permission-gated and counterpart shows "details not shown yet" (correct now); also `/inbox` and `/instructions` look message-like. *Dead-end:* no "start conversation" composer yet (read-only v1) — honest but can feel incomplete. *Simplify:* group inbox(review)+instructions under clearly different labels; keep Žinutės for person-to-person.

**F. Admin/owner manages platform** — Start: admin badge → `/dashboard/admin` (control room) → 15 internal tools. *Confusing:* none for an admin; well-gated. *Simplify:* also move talent/visual-os/design previews under this admin umbrella so they stop being user-reachable.

---

## 6. Redundancy / complexity audit

| Item | Where it appears | Why confusing / redundant | Keep / merge / hide / rename / delete | Priority | Impl. risk |
|---|---|---|---|---|---|
| Identity split (profile/journal/cv/player-card/evidence) | dashboard cards + direct URLs | 4–5 doors for "my skills/CV" | **Merge** under one "Mano profilis / CV" primary tab; cv+evidence as sub-actions; keep player-card redirect | P0 | Low (nav/labels only) |
| Journal not primary | IdentityActions card | core action buried | **Promote** Darbo žurnalas to primary tab | P0 | Low |
| `/talent` sample feed | reachable by any user | sample data can read as real | **Hide / admin-only** | P0 | Low |
| `/visual-os` + `/visual-os/agency` | reachable by any user | "not a feature path", sample data | **Hide / admin-only** | P0 | Low |
| `/design` (+ text-first) | reachable by any user | internal design surface | **Hide / admin-only** | P1 | Low |
| Discovery doors (marketplace/opportunities/candidates/talent/search/scouting/map) | various | several point at one idea; map-first not finished | **Merge** into map (primary) + scouting (the real search); hide talent | P1 | Low–Med |
| Message-like trio (communication/inbox/instructions) | various | all read as messages/notifications | **Rename/group**: Žinutės (person), Peržiūra (manager review), Nurodymai (instructions) | P1 | Low |
| `/search` honest placeholder | discovery | duplicates scouting’s purpose | **Merge** its two CTAs into scouting entry | P2 | Low |
| `/opportunities` empty list until matching | worker discovery | shows readiness but no real opportunities yet | **Keep readiness, hide list** until matching RPC live | P1 | Low |
| account tab key `account_roles` vs label "Nustatymai" | nav config | internal/label mismatch | **Rename** key to `settings` (cosmetic) | P2 | Low |
| Company role spaces (company/agency/buyer/start) | role spaces | several space routes | **Group** under one space hub; keep `/start` as entry | P2 | Med |
| Public preview forms (worker-intake/company-need/match-preview) | public | three "preview" forms, save nothing | **Rename/consolidate** to one clear preview + signup | P2 | Low |
| Footer "Created by" credit | public footer | brand credit in public UI | **Confirm/keep-or-remove** per no-external-brand rule | P1 | Low |

---

## 7. Simplified target structure (proposal)

Adopt the owner's six-item hypothesis as the **only** primary navigation:

| Primary tab | Route | What belongs under it |
|---|---|---|
| **Mano erdvė** | `/dashboard` | role-aware home, next action, pending nudges (bookings, reviews) |
| **Žemėlapis** | `/market-map` | signal-only map; future layers stay "Ruošiama"; the one discovery surface |
| **Žinutės** | `/communication` | person-to-person messages (permission-gated) |
| **Darbo žurnalas** | `/journal` | work records → feeds CV; manager confirmation states |
| **Mano profilis / CV** | `/profile` | profile + skills; sub-actions: printable CV (`/cv`), evidence report (`/reports/evidence`); player-card stays the visual lead (redirect) |
| **Nustatymai** | `/account` | email, appearance, language, roles/spaces, sign-out |

- **Demote to secondary (inside a space / context menu, not a global tab):** bookings, candidates, opportunities (readiness only), instructions, inbox-review, projects, scouting, documents, start, company/agency/buyer spaces.
- **Should disappear from anything a normal user sees:** `/talent`, `/visual-os`, `/visual-os/agency`, `/design` → admin/owner-only.
- **Hidden until real data/model exists:** opportunities **list** (until matching live), documents (already flag-gated), any "Ruošiama" map layer.
- **Admin-only:** `/dashboard/admin/*` (already) + the preview surfaces above.

---

## 8. GREEN / YELLOW / RED summary

**GREEN (clear, connected, keep visible):** Mano erdvė, Žemėlapis, Žinutės, Darbo žurnalas, Profilis, CV, Reports/evidence, Bookings, Nustatymai, Company/Agency/Buyer spaces, Projects, Scouting, Candidates, Start, Onboarding, the public marketing surface, Admin (as internal). player-card & marketplace redirects.

**YELLOW (useful but confusing / needs simplification):** journal & profile/CV placement (buried, not primary); identity surface overlap; message-like trio naming (communication/inbox/instructions); discovery door sprawl; `/search` vs scouting; `/opportunities` empty list; public preview-form trio; "nine countries" & "explainable fit" copy; footer "Created by" credit; `account_roles` key vs Nustatymai label.

**RED (should not be a normal-user feature yet):** `/talent` (sample), `/visual-os` + `/visual-os/agency` (sample, "not a feature path"), `/design` (internal). All are honestly labelled but **user-reachable** → move behind admin/owner gating. (No fake-data-presented-as-real was found; the RED here is about *visibility*, not dishonesty.)

---

## 9. Final recommendation

### Top 10 simplification actions
1. Make primary nav exactly the six target items (add **Darbo žurnalas** and **Mano profilis / CV** as tabs).
2. Consolidate identity: one "Mano profilis / CV" home; CV + evidence as sub-actions; keep player-card redirect.
3. Gate `/talent`, `/visual-os`, `/visual-os/agency`, `/design` to admin/owner-only.
4. Finish map-first: make Žemėlapis the single discovery tab; fold `/search` CTAs into scouting; keep marketplace redirect.
5. Hide the `/opportunities` **list** until matching is live; keep the readiness panel.
6. Relabel/group the message-like trio so Žinutės ≠ manager review ≠ instructions.
7. Move bookings/candidates/projects/scouting/instructions/inbox into clearly secondary placement (space or context menu), not primary.
8. Tidy public preview funnel: one clear "preview, nothing saved → create account" path instead of three parallel forms.
9. Resolve copy flags: "nine countries", "explainable fit direction", footer "Created by" credit.
10. Cosmetic: rename `account_roles` → `settings`; align feature labels with tab labels (e.g. "Darbo žurnalas").

### Top 5 to hide or demote
1. `/talent` (admin-only). 2. `/visual-os` + `/visual-os/agency` (admin-only). 3. `/design` (admin-only). 4. `/opportunities` list (until matching). 5. Documents (keep flag-off until enabled).

### Top 5 to rename
1. `account_roles` → `settings`. 2. `/inbox` → a clear "Peržiūra" (manager review) label. 3. `marketplace_hub` feature label "Prekyvietė" → avoid clashing with the hidden two-sided "marketplace". 4. Align `journal_text_first` label "Darbo ar veiklos įrašas" → "Darbo žurnalas". 5. `/search` → "Paieška pagal poreikį" (point at scouting).

### Top 5 that must remain
1. Mano erdvė (`/dashboard`). 2. Žemėlapis (`/market-map`, signal-only). 3. Darbo žurnalas (`/journal`). 4. Mano profilis / CV (`/profile` + `/cv`). 5. Žinutės (`/communication`) + Nustatymai (`/account`).

### Recommended next implementation sprint (after owner visual review)
**"Primary IA + visibility gating v1"** — UI/nav-only, no schema/RLS:
- Promote Darbo žurnalas and Mano profilis / CV to primary tabs; reduce nav to the six.
- Gate talent/visual-os/design behind admin/owner.
- Group the message-like trio and the secondary surfaces; hide the opportunities list until matching.
- Resolve the copy flags.
This is low-risk (labels, nav config, route gating) and directly enacts §7. Deeper items (matching, contact-permission, counterpart identity, company-location, marketplace offers, billing) stay owner-gated and out of this sprint.

---

## Validation & guarantees
- **No product behavior changed.** This audit adds only this document.
- **No schema/RLS/contact-permission/migration/Supabase/env/DNS/billing/payment/auth-core changes.** No production DB query was run.
- **No fake data introduced; no redesign; no new features; no merge; no deploy.**
- Branch: `audit/visible-product-structure-v1`. Reviewed on `main` post-latest-merge.
