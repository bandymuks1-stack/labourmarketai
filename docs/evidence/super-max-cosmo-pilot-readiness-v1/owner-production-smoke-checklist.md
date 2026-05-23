# Owner production smoke checklist — Pilot Readiness v1

**Status: PENDING — owner action only**

This is the consolidated checklist the owner runs against the live
production deploy after this sprint's PR merges. It is **not** auto-
runnable from an agent sandbox (auth required, real Supabase session
required, no test credentials in this environment).

Companion to the older `docs/evidence/post-merge-production-smoke-pr30.md`
(still PENDING). Both checklists must be performed by the owner; flip
the status block below only after a real walk-through, not before.

## Scope

This pass covers everything shipped from PR #30 through PR #38 plus
this sprint (`feat/cc/super-max-cosmo-pilot-readiness-v1`):

- text-first profile / skills / journal flow (PR #30)
- product readiness guardrails (PR #31)
- repo cleanup (PR #33)
- first working beta variant acceleration (PR #34)
- adaptive human-centered OS foundation (PR #35)
- neutral shared dashboard + feature-availability wiring (PR #36)
- catalogue-driven primary nav (PR #37)
- role catalogue driven dashboard surfaces (PR #38)
- this sprint's pilot-readiness clarity + owner smoke consolidation

## How to run

1. Wait for Vercel to mark the deploy of the latest `main` commit as
   Ready (`/lt` returns 200; signup / login pages render).
2. Open Chrome on desktop → DevTools (F12) → Toggle device toolbar
   (Ctrl+Shift+M) → pick **iPhone 13** (390 × 844). Confirm locale `lt`.
3. Sign in as the founder. The Google OAuth path is fastest because the
   founder account already has the worker role from earlier captures.
4. Walk through each row below in order. Tick the box only when the
   real production page matches the expectation. Do not pre-tick.
5. When (and only when) every row is green, update the status block at
   the bottom of this file in a follow-up PR. **Do not flip status here
   while items remain unchecked.**

## Routes

```
https://app.labourmarket.ai/lt
https://app.labourmarket.ai/lt/auth/login
https://app.labourmarket.ai/lt/auth/signup
https://app.labourmarket.ai/lt/dashboard
https://app.labourmarket.ai/lt/dashboard/profile
https://app.labourmarket.ai/lt/dashboard/journal
https://app.labourmarket.ai/lt/dashboard/account
```

## Mobile checks (iPhone 13, 390 px)

### Session + chrome

- [ ] Login / session state is unambiguous — the header chrome shows
  the active role chip and the bell icon; no "loading…" flash that
  stays longer than ~1s.
- [ ] No horizontal overflow on any of the seven routes above.
- [ ] Bottom nav (Apžvalga / Profilis / Žurnalas / Mano paskyra) is
  always reachable and never covers a primary CTA.

### `/lt/dashboard`

- [ ] First-use panel reads "Pradėkite nuo savęs" with a 5-step list.
- [ ] Role catalogue grid below shows **Darbuotojas → AKTYVU** with a
  navigating link, and **Įmonė / Agentūra / Pirkėjas → RUOŠIAMA** with
  the reason line and **no** navigating button.
- [ ] No `freelancer / team_lead / service_provider` row visible.
- [ ] No copy implies the worker is locked into one role. The
  non-locking intro paragraph above the grid is visible.
- [ ] No matching / scoring / AI / verified / guaranteed claim
  anywhere.

### `/lt/dashboard/profile`

- [ ] First visible block is the **text-first composer**
  ("Papasakokite, ką mokate") with the universal placeholder
  (customer support / bike repair / led a team / built websites /
  furniture / documents).
- [ ] CV input panel below it (upload OR paste).
- [ ] The manual chip picker is the small secondary "Pridėti rankiniu
  būdu" link inside the flow — not the first surface.
- [ ] Submitting a paragraph leads to suggestion cards with explicit
  `Patvirtinti` / `Pataisyti` / `Neįtraukti` actions. The rule-based
  notice is visible and honest.
- [ ] After applying confirmed suggestions, the trail says **Confirmed
  by you · Added to your profile · Needs external confirmation later**.
  Never "Verified" / "Patvirtinta iš išorės" — that status stays
  preparing until PR #18 ships.

### `/lt/dashboard/journal`

- [ ] First labelled field is **"Ką šiandien dirbote?"** with the
  universal placeholder.
- [ ] The new "Security backbone is preparing" honest note is visible
  somewhere on the page (or its translated equivalent — see
  `messages/{lt,en}/journal.json` `pilotBackboneNote`). The note
  explains that entries are private until manager confirmation ships
  with PR #18 / issue #32.
- [ ] Submitting a paragraph leads to `Sistema rado` cards with the
  explicit "Tai pasiūlymai…" intro line.
- [ ] After save, the success card ("Įrašas išsaugotas") stays on the
  form until the next submit.
- [ ] Save works against a real engagement context (no engagement →
  honest empty state, not a broken page).

### `/lt/dashboard/account`

- [ ] Active worker space message ("Šiuo metu aktyvi jūsų darbuotojo
  erdvė…") visible at the top of the roles section.
- [ ] User's own roles list reads the catalogue: worker → AKTYVUS,
  others → `RUOŠIAMA`. No "Manage company" CTA. No "Switch to agency"
  CTA that promises management it cannot deliver today.
- [ ] Locale switcher visible on mobile.
- [ ] Logout works.

### Notification + role switcher (any route)

- [ ] Bell icon opens a **bottom sheet** that slides up from the
  bottom (NOT a top-anchored popover). Hero is dimmed but visible
  behind it. ESC / tap-out / X all close it.
- [ ] Role switcher dropdown carries the non-locking intro paragraph
  inside the menu and tags every non-worker row with `RUOŠIAMA`.

## Desktop checks (≥ 1024 px)

- [ ] Dashboard does not look like a wall of cards — the first-use
  panel, journey rail, two canonical cards, role catalogue grid, and
  feature availability grid lay out in a clear top-to-bottom order.
- [ ] Role grid + feature grid keep one consistent column structure
  (2-up on tablet, 3-up on desktop) — no orphan card.
- [ ] Profile / Journal / Account each guide the user to the next
  visible action in under 10 seconds of looking at the screen.

## Fail criteria — STOP immediately if any of these are true

- [ ] FAIL — any non-worker role renders an "active" chip OR a
  navigating link to a stub page.
- [ ] FAIL — any pricing / checkout / subscription surface appears
  (this PR family explicitly does not ship those).
- [ ] FAIL — any "AI verified", "AI matched", "automatic approval",
  "guaranteed match", "score", "rating" or similar claim appears in
  user-facing copy.
- [ ] FAIL — mobile horizontal overflow on any page.
- [ ] FAIL — bottom nav covers a CTA the worker needs to tap.
- [ ] FAIL — the owner cannot understand what to do next within 10
  seconds of opening the dashboard.

If any FAIL row is true, **do not flip the status block**. Open a
small fix PR off main, walk through this checklist again on the next
deploy.

## What this checklist intentionally does NOT cover

- PR #18 migration / journal security hardening. Tracked at
  [issue #32](https://github.com/bandymuks1-stack/labourmarketai/issues/32).
  Until PR #18 lands, the journal works via direct-insert with the
  `closed` visibility scope; external confirmation is still preparing.
- Production database health. Out of agent scope. Use the Supabase
  dashboard for that.
- Vercel / DNS / env / secrets / Supabase project settings. Not
  touched this sprint.
- Billing / payment / pricing / checkout. Not in this PR family.

## Status block

Update only after a real owner walk-through, not before.

```
Smoke status:    PENDING
Date:            —
Performed by:    —
Production deploy SHA:  —
Result:          —
```

Companion checklist for PR #30 specifically:
`docs/evidence/post-merge-production-smoke-pr30.md` — also still
PENDING.
