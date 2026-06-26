# Action-first product logic — v1

**Goal:** turn the visible product into the action-first structure the owner wanted from the start — primary navigation based on **actions**, not data categories; understandable to a 5-year-old and a 100-year-old; arrive, do the action in seconds, leave. Low-risk slice: navigation, route visibility, labels, grouping, redirects, gating. **No backend features, no schema/RLS/contact-permission, no fake data, no redesign, no merge/deploy.**

Source docs: `visible-product-structure-audit-v1.md`, `message-counterpart-trust-hotfix-p0-audit.md`, `production-trust-bugs-p0-audit.md`.

---

## A. Primary navigation — before / after

The primary nav is derived from `feature-availability.ts` (`safeToShowInPrimaryNav`) + `navigation.ts` (`TAB_META`). It auto-renders in `DashboardTabs` (desktop) and `BottomNav` (mobile).

**Before (data/utility-led, 4 tabs):**
| Mano erdvė | Žemėlapis | Žinutės | Nustatymai | (+Admin) |
|---|---|---|---|---|
| /dashboard | /market-map | /communication | /account | /admin |

**After (action-first, 4 tabs):**
| Mano erdvė | Žemėlapis | Darbo žurnalas | Žinutės | (+Admin) |
|---|---|---|---|---|
| /dashboard | /market-map | /journal | /communication | /admin |

- **Promoted:** **Darbo žurnalas** (`/dashboard/journal`) — recording work is a core action that feeds the profile/CV/player-card.
- **Demoted:** **Nustatymai / account** (`/dashboard/account`) — settings is a utility, not an action; it now lives in the **avatar account menu** (already linked there), not the global nav.
- Admin stays permission-gated (desktop tabs + avatar menu; never on the mobile bottom bar).

This makes every primary door a thing you **do**: *see my space · see the market · record work · talk to people.*

---

## B. Mano erdvė as the control room — before / after

`/dashboard` (worker view) was **rewritten** into a simple action-first control room — this is product logic / IA, not visual-WOW.

**Before (a wall of loosely related cards — 7 sections):**
1. `CurrentSpaceHeader` (context) · 2. `IdentityActions` 3-link strip (profile / find work / readiness) · 3. `TodayScreen` (today + confirmed work) · 4. `WorkCard` (status + next action) · 5. `WorkerInvitationsCard` · 6. pending-bookings card · 7. `DashboardFirstUsePanel`.

**After (action-first control room — the few things that matter):**
1. `CurrentSpaceHeader` — **who I am here** (person/company context chip).
2. `WorkCard` — **main status + the ONE next action** (what's clear / what's missing / why it helps). Real data.
3. **`MyZone`** (new) — the control room itself:
   - **Readiness status:** one honest line — "Jūsų informacija dar nepilna" (incomplete) or "Jūsų profilis paruoštas" (ready), derived from the real profession+entry state.
   - **"Ką galite padaryti dabar"** — the fast actions: **Įrašyti darbą** (`/journal`) · **Papildyti profilį** (`/profile`) · **Būti matomam žemėlapyje** (`/market-map`) · **Patikrinti žinutes** (`/communication`) · **Įmonės veiksmai** (`/company`, **only** when a real company exists).
   - **"Kas ką gerina"** — one short, honest explanation: journal → skills/profile/CV; profile/CV → visibility; map = where you're visible; messages = trusted contact only.
4. `WorkerInvitationsCard` (real, conditional) · 5. pending-bookings card (real, only when pending > 0).

**Removed from the worker home (de-cluttered):** the loose `IdentityActions` strip (replaced by the clearer labelled MyZone), `TodayScreen` (confirmed-work view now lives in **Darbo žurnalas**), and `DashboardFirstUsePanel` (first-use guidance is now the MyZone readiness status + fast actions — no duplicate panel). The components are kept in the codebase (not deleted); the company/agency/customer overview keeps its focused `IdentityActions` + next-action structure.

A user now arrives, sees in one glance who they are, whether their info is complete, and the next useful action, and can do it in seconds; staying longer means adding more accurate info, not fighting the UI.

---

## C. Profile / CV / player-card unification

The owner rule — *do not make "Mano profilis" and "Mano erdvė" two equal primary destinations; profile / CV / player-card / evidence / skills belong inside Mano erdvė* — is enforced:
- **None** of `profile`, `cv`, `player-card` is a primary tab. `player-card` already redirects into `/journal`; `cv` and `reports/evidence` are secondary detail/print pages; `profile` is reached from Mano erdvė's identity actions and the account page.
- The single identity story: **record work in Darbo žurnalas → it improves your profile / CV / player-card.** Journal is the action; profile/CV/player-card are the result, under Mano erdvė.
- Guard `action-first-ia` freezes that profile/cv/player-card are never separate competing primary tabs.

---

## D. Map vs marketplace cleanup

- **Žemėlapis (`/market-map`) is the single primary market surface.** Confirmed.
- **Marketplace does not compete.** `marketplace_hub` is `safeToShowInPrimaryNav: false`; `/dashboard/marketplace` **redirects** to `/dashboard/market-map`; the full two-sided `marketplace` feature stays `hidden`. Future commercial layers (offers / shop / rentals) remain **disabled legend filters** on the map, never fake active features. No offers/billing built.

---

## E. Messages / inbox / instructions clarity

- **Žinutės (`/communication`) is the only primary communication door.** Confirmed.
- `/inbox` (manager journal-review) and `/instructions` (work-instruction channel) are **not** primary tabs and are not competing message entries. Guard `action-first-ia` asserts none of them is a primary href.
- The restricted-counterpart copy from #506 is untouched ("Pašnekovo duomenys dar nerodomi" / "Recipient details are not shown yet"). **No fake contact buttons, no fake counterpart identity.** Contact-permission / real identity remain owner-gated (not touched here).

---

## F. Preview / sample / internal route gating

| Route | Before | After |
|---|---|---|
| `/dashboard/talent` (sample feed) | any logged-in user | **admin/owner-only** (`requireSuperadmin` → non-admins redirect to dashboard) |
| `/dashboard/visual-os` (visual plan, sample) | any logged-in user | **admin/owner-only** |
| `/dashboard/visual-os/agency` (sample) | any logged-in user | **admin/owner-only** |
| `/design`, `/design/text-first` | already env-gated (`notFound` in prod) | unchanged — already hidden |

None of these were ever in nav (guard `preview-surfaces-unlinked` already enforced that); they were reachable by **direct URL**. Now normal users can no longer open them at all. No code deleted — useful code is preserved behind the admin gate.

---

## G. Company / personal / admin context

One product, clear active contexts — unchanged structurally and intentionally so:
- **Person** (Asmuo) vs **Company** (Įmonė) base identities via the existing role switcher; agency/customer fold into Company.
- Company actions live in the single compact commercial channel under Mano erdvė (`IdentityActions` company group) + the real company/agency/buyer spaces — not scattered new hubs.
- **Admin** is owner/admin-only, never dominates normal nav, and (per #503 + this slice) carries no admin/internal language into normal-user paths. The sample "visual-os/agency" company card is now admin-gated so it can't read as a real company feature.

---

## H. Copy simplification

| Key | Before | After |
|---|---|---|
| `auth.dashboard.tabs.journal` (LT) | "Mano CV" | **"Darbo žurnalas"** |
| `auth.dashboard.tabs.journal` (EN) | "My CV" | **"Work journal"** |
| `auth.dashboard.tabs.journal` (RU) | "Моё CV" | **"Рабочий журнал"** |

Short, human, action-led. (Only the served locales lt/en/ru carry this surface; the other 8 locale files are not routable and were not touched.) No preview/sample/internal/module words in any primary tab label (guard-enforced).

---

## I. Guards / tests

- **New:** `lib/guards/action-first-ia.test.ts` — primary nav = the four action doors; profile/cv/player-card/account/marketplace/inbox/instructions/talent/visual-os are NOT primary; preview surfaces call `requireSuperadmin`; journal label is human "Darbo žurnalas"; no admin/internal/preview/module words and no raw keys in the four primary tab labels.
- **New:** `lib/guards/my-zone-control-room.test.ts` — the worker home is the MyZone control room (status + fast actions + what-improves-what); the old clutter (TodayScreen / FirstUsePanel) is not re-stacked; the five fast actions point at the real routes; company action is conditional; only ONE profile door (no player-card/cv/evidence/talent/visual-os duplicates); no admin/preview/module wording; MyZone copy present + human in lt/en/ru with no raw keys.
- **Updated to the action-first contract:** `compact-nav-marketplace-ia`, `no-duplicate-top-level-entries`, `product-readiness` (TAB_META set + first-use guidance), `worker-nav-human-labels`, `cv-friendly-copy` (tab no longer must say "CV"; page H1 still does; no-"evidence" protection kept), `dashboard-active-role-overview` (worker = MyZone, company = IdentityActions), `today-screen-honesty` (not stacked on home), `dashboard-next-action` (no separate first-use panel).
- **Unchanged & still green:** `preview-surfaces-unlinked`, `command-center` + `identity-action-workspace` (company branch keeps IdentityActions), the map/legend honesty guards, booking-visibility guard.

---

## GREEN / YELLOW / RED

- **GREEN (shipped here):** action-first 4-door primary nav; Darbo žurnalas promoted; account demoted to avatar menu; talent/visual-os/visual-os-agency admin-gated; journal label humanised; map-first & single-messages-door confirmed and guarded; **Mano erdvė rewritten into the action-first control room** (readiness status + fast actions + what-improves-what; worker-home clutter removed).
- **YELLOW (follow-up, not in this low-risk slice):** grouping the secondary surfaces (bookings/candidates/projects/scouting/instructions/inbox/opportunities/documents) into clearly-secondary placement; hiding the `/opportunities` empty list until matching is live; applying the same control-room clarity pass to the company/agency overview; the public preview-form trio.
- **RED (owner-gated, untouched):** contact-permission schema/RLS, counterpart-identity bridge, marketplace offers/billing, company-location schema, matching engine, visual-WOW redesign. A real primary **"Paslaugos / Užsakymai"** tab is **not** added — bookings are not a real-enough standalone surface yet; bookings stay visible only where real pending data exists (home card on pending). Documented RED/future.

---

## Final recommendation
Ship this nav/visibility slice, then (after owner visual review) do the Mano erdvė control-room rewrite + secondary-surface grouping as the next sprint. Keep all RED items owner-gated.

## Validation & guarantees
- typecheck ✅ · lint ✅ · build ✅ · full vitest ✅ (5472 passed). Risky-path scan: no DB/schema/migration/RLS/Supabase/env/DNS/billing/payment/auth-core changes.
- No new backend, no fake data, no fake services/bookings/messages/participants/permissions, no redesign. No external brand names. **Not merged, not deployed.**
