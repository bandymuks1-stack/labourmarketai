# Post-merge production mobile smoke — PR #30

**Status: PENDING**

This checklist is for the OWNER. It verifies the text-first profile / Work
Journal / account-roles changes shipped by PR #30 on a real authenticated
worker in Chrome mobile mode against the production app.

Update the status block at the bottom only after you actually performed each
check against the production URL — do not pre-fill.

## What was shipped

- PR: https://github.com/bandymuks1-stack/labourmarketai/pull/30
- Squash-merge on `main`: `59d4d76`
- Merged: 2026-05-23 06:29 UTC

Shipped scope:

- text-first / CV-first profile + skills flow;
- text-first Work Journal composer;
- account / roles honesty (non-worker roles tagged `RUOŠIAMA`);
- MobileSheet portal fix (notification sheet anchored to viewport, not the
  blurred header band);
- rule-based parser modules under `apps/web/lib/structuring/` — NOT AI;
- mobile evidence captures under `docs/evidence/text-first-mobile/`.

## How to run the smoke

1. Wait for Vercel to mark the deploy of commit `59d4d76` as Ready.
2. Open Chrome on desktop, hit `F12` → Toggle device toolbar (Ctrl+Shift+M) →
   pick **iPhone 13** (390×844). Switch language to `lt` if it didn't stick.
3. Open `https://app.labourmarket.ai/lt` and log in as a worker
   (Google OAuth with your owner email is fine — the account already has the
   worker role from the earlier evidence capture pass).
4. Walk through each section below. Tick the box only when the real
   production page matches the expectation.

## Routes to check

```
https://app.labourmarket.ai/lt/dashboard/profile
https://app.labourmarket.ai/lt/dashboard/journal
https://app.labourmarket.ai/lt/dashboard/account
```

## Checks

### Profile / Skills — `/lt/dashboard/profile`

- [ ] First block on screen is **"Papasakokite, ką mokate"** with a free-text
  textarea (NOT the chip picker).
- [ ] Below it, a **"Įkelti arba įklijuoti CV"** panel is visible (upload +
  paste options).
- [ ] **Manual chip picker is secondary** — accessible ONLY by tapping the
  small "Pridėti rankiniu būdu" link inside the text-first flow. It is not
  the first visible widget on the page.
- [ ] After tapping "Pasiūlykite struktūrą" with sample text, suggestions
  render in `Sistema rado` cards. **Suggestions are not saved facts** until
  the user taps `Patvirtinti` on each and then `Įtraukti patvirtintus
  pasiūlymus`.

### Work Journal — `/lt/dashboard/journal`

- [ ] **First field is the textarea labelled "Ką šiandien dirbote?"**, with
  placeholder starting with `Pvz.: Dirbau 8 valandas…`.
- [ ] Object / quantity / unit / direction / skill pickers are NOT a
  first-required action — they appear only inside the suggestion review
  after submit.
- [ ] Primary CTA **"Pasiūlykite struktūrą"** is fully visible above the
  bottom nav. No clipping.
- [ ] After submit, the suggestion list appears and each item exposes
  `Patvirtinti` / `Pataisyti` / `Neįtraukti`. Save uses **"Patvirtinti
  įrašą"** — that button is visible above the bottom nav too.

### Account / Roles — `/lt/dashboard/account`

- [ ] Worker space message is clear (paragraph starting with **"Šiuo metu
  aktyvi jūsų darbuotojo erdvė…"**).
- [ ] Inactive roles (Įmonė / Agentūra / Pirkėjas) display a **`RUOŠIAMA`**
  badge next to them; only Darbuotojas has the live "● Aktyvus" indicator.
- [ ] There is no CTA promising full role management for the inactive roles.

### Notification sheet (any `/dashboard/*` page)

- [ ] Tap the **🔔 bell** icon in the header.
- [ ] A **sheet slides up from the bottom** of the viewport.
- [ ] Behind the sheet, the dashboard hero is dimmed but visible — NOT
  hidden by the sheet covering the top of the screen.
- [ ] Tapping the dimmed backdrop OR the X button closes the sheet.

### Bottom nav + CTA clearance

- [ ] On any `/dashboard/*` page scroll to the very bottom.
- [ ] The bottom tab bar (Apžvalga / Profilis / Žurnalas / Mano paskyra)
  does NOT cover the last CTA or form input.
- [ ] No horizontal scroll. No clipped buttons. No double "Pagrindinis"
  labels in CV preview chips.

## Status block

Update only after the check is actually performed. Until then keep it as
PENDING.

```
Smoke status:  PENDING
Date:          —
Performed by:  —
Production deploy SHA:  59d4d76
Result:        —
```

## If something diverges

Open a new branch off `main`:

```bash
git checkout main && git pull origin main
git checkout -b fix/cc/text-first-mobile-postdeploy
```

Patch the offending file, validate (`pnpm -F web typecheck && pnpm -F web
lint && pnpm -F web test && pnpm -F web build`), open a PR. Do not edit the
status block above unless the smoke actually passed end-to-end.
