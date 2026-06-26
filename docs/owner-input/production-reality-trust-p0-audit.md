# Production reality / trust — P0 audit

**Sprint:** `production-reality-trust-p0` · branch `fix/production-reality-trust-p0`
**Trigger:** owner mobile review after the action-first IA (#508) went live.
**Nature:** production trust/reality, not cosmetics. Four findings, fixed within
hard limits (no DB/schema/migration/RLS/Supabase/env/DNS/billing/auth-core
change; no production DB mutation; no fake skills/approvals/markers/cards).

Each issue below: what the owner saw → the real data flow → why it happened →
the fix shipped here → GREEN/YELLOW/RED.

---

## Issue 1 — Login/auth branding shows a backend host, not the product name

**Owner saw:** during Google sign-in (account chooser / consent screen) a
backend/project host appears instead of "Labour Market AI". Only the product
name should be visible — no backend project URL, infra host, internal project
id, or raw service name.

**Data flow / source.** The visible "to continue to X" name on the Google
consent screen and the host on the account chooser are produced by **external
provider configuration**, not the app code:
- **Google Cloud → OAuth consent screen → App name** controls the product name
  shown to the user. It is set in the Google Cloud console.
- **Supabase project domain** (`<project-ref>.supabase.co`) is the OAuth
  redirect host Google echoes. It is the Supabase project ref, set in the
  Supabase dashboard; removable from the visible flow only via a **custom auth
  domain** (e.g. `auth.labourmarket.ai`).

The app code's own callback host is already correct
(`components/app/google-button.tsx` builds `${origin}/${locale}/auth/callback`
→ `app.labourmarket.ai` in prod), and the brand constant is already a human
name (`lib/seo/metadata.ts` → `BRAND_NAME = "LabourMarket.ai"`), used by the
auth header (`app/[locale]/auth/layout.tsx`). **No user-facing app copy leaks
the backend host.**

**Why it happens.** Purely external/provider config. The project ref appears as
a hardcoded default in `lib/env.ts` and `.env.example`, and on the admin-only
`dashboard/admin/project-truth` page — none of which is the login screen the
owner saw, and `env.ts` is auth-infra (out of scope under the hard limits).

**Code-vs-provider configurability:**

| Surface | Controls the login name? | Fixable in code? | Class |
|---|---|---|---|
| Google OAuth consent **App name** | YES (consent screen) | No — Google Cloud console | **RED external-config** |
| Supabase project domain on redirect | YES (account chooser host) | No — Supabase custom auth domain | **RED external-config** |
| App brand constant / auth header | product name in app chrome | already correct | GREEN |
| App callback host | redirect target | already correct | GREEN |

**Owner actions required (RED external-config — only the owner can do these):**
1. **Google Cloud Console → APIs & Services → OAuth consent screen** → set
   *App name* to **"Labour Market AI"** (+ support/developer contact email).
2. **Supabase dashboard → Authentication → set a custom auth domain**
   (e.g. `auth.labourmarket.ai`) so the redirect host is the product domain, not
   `<project-ref>.supabase.co`.

**Shipped here (code):** a guard — `lib/guards/public-brand-name.test.ts` —
freezes that the brand constant stays a human product name and that **no
auth-facing surface** (auth layout, login page, login form, google button) ever
uses a `*.supabase.co` host as a visible name. This prevents a future
regression from leaking the backend host into the login chrome. `env.ts` /
provider settings were intentionally **not** touched (auth-infra, hard limit).

**Class: RED external-config (owner action) + GREEN guard.**

---

## Issue 2 — Old journal entries still show wrong (construction) skills

**Owner saw:** the entry "Dirbau su svetainės dizainu 9 h" (website design)
still shows construction skills (Brėžinių skaitymas, Durų ir langų montavimas,
Grindų dangos, Klojinių stalystė, Medinių karkasų statyba, Nuotekų sistemų
montavimas, Santechnikos darbai, Vėdinimo sistemos).

**Data flow / source.** Per-entry chips on the journal list
(`app/[locale]/dashboard/journal/page.tsx` → `JournalEntryRow` →
`JournalEntrySkillLinks`) come from **three** real signals, classified live at
render by `lib/journal/entry-skill-source.ts`:
- `journal_entry_skills` rows — durable links persisted when the entry was
  saved (this is where the 8 construction skills live);
- `worker_skills.verified` — confirmed skills;
- the **current** recognizer (`extractJournalSuggestions(original_text)`) run on
  the entry text at render time.

A linked skill that is **not** confirmed and **not** recognized from the current
text — but is in the recognizer's vocabulary — is classified
`stale_needs_review`.

**Why it happens.** The construction links were written into
`journal_entry_skills` by an **older biased recognizer** when the entry was
saved. The #505 fix corrected *new* extraction only; the old persisted rows
remain. The classifier already (correctly) re-evaluates them as
`stale_needs_review` against the current recognizer — so they were **not** shown
as clean evidence — **but** the UI still rendered all eight as amber chips in a
"Reikia peržiūrėti" bucket. To the owner that still reads as "this web-design
entry has construction skills". There is no provenance column on
`journal_entry_skills` and migrations/backfill are out of scope, so the source
stays computed, not stored.

**Fix shipped (UI-only, no DB mutation).** In
`components/app/journal-entry-skill-links.tsx` the stale review bucket is now
**collapsed by default**: it shows only an honest one-line summary
(`"{count} anksčiau susietų įgūdžių nebeatitinka šio įrašo teksto. Jie nerodomi
kaip šio įrašo įgūdžiai."`) plus *Show / Review again / Unlink*. The unrelated
construction chips are **no longer rendered as the entry's skills** unless the
worker explicitly expands them, and the worker can still unlink them (real
clean-up). The links persist in the DB untouched (no production mutation; any
true data cleanup/backfill would be a separate RED, owner-gated migration).

**Class: GREEN (UI-only honesty fix).** Backfill of stale rows = RED follow-up
(owner-gated), noted but not done.

---

## Issue 3 — Company leader can't approve, but approve/reject buttons still show

**Owner saw:** reviewing "Kasiau žemes su ekskavatoriumi 10h", the card shows
approve/reject actions **and** "Neturite teisės peržiūrėti šio įrašo" —
contradictory.

**Data flow / permission path.** Two checks at different layers disagree:
- The inbox lists an entry when `reviewable_journal_entry_ids()` returns it —
  gated by `manages_organization(org)` (a boolean: caller has an active
  manager/owner/external_manager engagement in the org) + `journal_review_enabled`
  + no existing confirmation.
- The **action** (`reviewJournalEntry` / `confirmEntrySkills` →
  `review_journal_entry` RPC) re-checks `manages_organization()` **and then**
  separately requires an active reviewer engagement row (`v_eng`); on failure it
  returns `not_authorized` / `no_reviewer_engagement` / `review_not_enabled`.

**Why both render.** In `components/app/journal-inbox-entry.tsx` the action
buttons render whenever `!done && mode === "idle"`. A failed action sets
`reviewState.ok = false` (so `done` stays false) and surfaces the denial
message — but the buttons, keyed only off `!done`, **stay visible**. Result:
"Approve" sitting next to "Neturite teisės".

The backend genuinely supports company-leader approval when the leader has the
correct active engagement (`relationship_slug in manager/owner/external_manager`,
`status='active'`). The mismatch is between the **list** check and the
**stricter action** check; reconciling that fully is a backend change
(`reviewable_journal_entry_ids` would need the same engagement gate) = **RED**,
owner-gated, and **not** done here.

**Fix shipped (UI-only, no backend/RLS change).** A permission denial is now
**terminal** for the card: `permissionBlocked` is derived from the real denial
codes (`not_authorized` / `no_reviewer_engagement` / `review_not_enabled`), and
every action surface is gated on `canAct = !done && !permissionBlocked`. When
the server refuses, the approve/reject/confirm forms are hidden and only the one
honest reason remains. No fake approval; no contradictory state.

**Class: YELLOW.** UI contradiction removed (GREEN-safe). The deeper
reconciliation — making the inbox list only entries the reviewer can truly act
on (align `reviewable_journal_entry_ids` with the action's engagement check) —
is a **RED** RPC change, owner-gated, documented here as the follow-up.

---

## Issue 4 — Market map / player-card marker too weak

**Owner saw:** the map (`/dashboard/market-map`, Žemėlapis) doesn't show a clear
player-card-type marker and feels too small, especially on mobile.

**Data flow / source.** `market-map/page.tsx` already fetches the user's real
identity (`profiles.full_name`, avatar), availability (`getOwnAvailability` →
`workers.availability_status`) and capabilities (`getOwnCapabilities` →
`worker_skills`, with a confirmed/suggested/self-declared tally). It builds a
`mapIdentity` and renders the own marker via `identityPinHtml()` in
`market-map-live.tsx` — previously a 40px avatar + name + one "Jūs" pill. All
real, RLS-scoped, owner-only; no cross-user data.

**Why it felt weak.** The marker showed only avatar + name; the rich real
signals already on the page (availability, confirmed-skill count) weren't on the
marker, and the avatar/map were small on mobile.

**Fix shipped (real data only).** `MapIdentity` extended with optional real
fields — `professionLabel`, `availabilityLabel`, `verifiedSkillsCount`. The pin
now renders as a proper mini player card:
- avatar enlarged 40px → **52px**; name in bolder type;
- **availability** pill — only when `availability_status` is really set (omitted
  when `unknown`);
- **verified-skills** badge with the gold trust accent — shown **only** when the
  real confirmed count (`worker_skills.verified`) is > 0, never fabricated; the
  marker ring goes gold only then;
- map container taller on mobile (`h-[58vh] min-h-[20rem]` → `h-[66vh]
  min-h-[24rem]`, `md:h-[32rem]`).

No fake coordinates, demand, markers, or player cards; the existing map honesty
guards (no fake markers, no external API, owner-scoped only, no banned copy) are
respected. Deeper market depth (other players on the map, real demand layer) was
already documented as a RED follow-up and is untouched.

**Class: GREEN (real-data marker + mobile sizing).** Multi-player / demand map
layers = RED follow-up (owner-gated), not done here.

---

## Summary

| Issue | Root cause | Fix here | Class |
|---|---|---|---|
| 1 Login branding | Google OAuth consent app name + Supabase project domain (external) | guard + documented owner actions | RED ext-config + GREEN guard |
| 2 Stale skills | old recognizer wrote `journal_entry_skills`; UI rendered stale chips | collapse stale bucket behind honest summary (UI-only) | GREEN (backfill = RED follow-up) |
| 3 Approval contradiction | list check vs stricter action check disagree; buttons keyed off `!done` only | hide actions on permission denial (UI-only) | YELLOW (RPC align = RED follow-up) |
| 4 Weak map marker | rich real signals not on the marker; small on mobile | player-card pin from real data + mobile sizing | GREEN (multi-player map = RED follow-up) |

**RED follow-ups (owner-gated, NOT done):** stale `journal_entry_skills`
cleanup/backfill migration; aligning `reviewable_journal_entry_ids` with the
action's engagement check; multi-player / demand map layers; the two external
provider settings in Issue 1.

**Validation:** typecheck / lint / build / full vitest green; risky-path scan
clean (no DB/schema/migration/RLS/Supabase/env/DNS/billing/auth-core change, no
production DB mutation, no fake data). One focused DRAFT PR, held for owner.
