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

`/dashboard` is unchanged structurally in this slice (it is already action-led: `CurrentSpaceHeader` + `IdentityActions` (profile / find work / readiness) + `WorkCard` (one next action) + invitations + pending-bookings card, all on real data, no card wall). What changed is the **frame around it**: Darbo žurnalas is now a primary door (so recording work no longer needs to be hunted for), and profile/CV are positioned as part of Mano erdvė rather than competing tabs. A deeper "what can I do now / what's missing / how visible am I" rewrite of the home page is **not** in this low-risk slice (it borders on visual-WOW) and is flagged as the recommended next step.

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
- **Updated to the action-first contract:** `compact-nav-marketplace-ia`, `no-duplicate-top-level-entries`, `product-readiness` (TAB_META set), `worker-nav-human-labels`, `cv-friendly-copy` (tab no longer must say "CV"; page H1 still does; no-"evidence" protection kept).
- **Unchanged & still green:** `preview-surfaces-unlinked` (previews stay out of nav), the map/legend honesty guards, booking-visibility guard.

---

## GREEN / YELLOW / RED

- **GREEN (shipped here):** action-first 4-door primary nav; Darbo žurnalas promoted; account demoted to avatar menu; talent/visual-os/visual-os-agency admin-gated; journal label humanised; map-first & single-messages-door confirmed and guarded.
- **YELLOW (follow-up, not in this low-risk slice):** a deeper Mano erdvė "what can I do now / what's missing / how visible am I" home rewrite; grouping the secondary surfaces (bookings/candidates/projects/scouting/instructions/inbox/opportunities/documents) into clearly-secondary placement; hiding the `/opportunities` empty list until matching is live; the public preview-form trio.
- **RED (owner-gated, untouched):** contact-permission schema/RLS, counterpart-identity bridge, marketplace offers/billing, company-location schema, matching engine, visual-WOW redesign. A real primary **"Paslaugos / Užsakymai"** tab is **not** added — bookings are not a real-enough standalone surface yet; bookings stay visible only where real pending data exists (home card on pending). Documented RED/future.

---

## Final recommendation
Ship this nav/visibility slice, then (after owner visual review) do the Mano erdvė control-room rewrite + secondary-surface grouping as the next sprint. Keep all RED items owner-gated.

## Validation & guarantees
- typecheck ✅ · lint ✅ · build ✅ · full vitest ✅ (5472 passed). Risky-path scan: no DB/schema/migration/RLS/Supabase/env/DNS/billing/payment/auth-core changes.
- No new backend, no fake data, no fake services/bookings/messages/participants/permissions, no redesign. No external brand names. **Not merged, not deployed.**
