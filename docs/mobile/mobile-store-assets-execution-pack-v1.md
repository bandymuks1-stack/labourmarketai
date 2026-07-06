# Mobile store assets — execution pack v1

Status: docs-only production runbook (2026-07-06). This pack converts the
owner pack (`mobile-store-assets-owner-pack-v1.md`, merged as #660) into a
step-by-step execution sequence: exactly what to produce, in what order,
with what tool, and **who** performs each step — `OWNER` (only the owner
can do it) or `AGENT` (an autonomous PR can do it once its preconditions
are met).

## Owner decisions locked 2026-07-06

The owner reviewed this pack and locked the following direction. Every
step below is aligned to these decisions; where the original draft
disagreed it has been corrected in place.

1. **PWA-first.** The installable PWA is the product's mobile form. No
   native rewrite.
2. **Android TWA first.** The first store presence is the Trusted Web
   Activity path on Google Play (§7).
3. **Capacitor / iOS later — explicitly DEFERRED, not never.** iOS ships
   as add-to-home-screen for now; the Capacitor/native-shell route is
   revisited only on explicit commercial need. §6 metadata stays
   prepared-only.
4. **No service worker until the offline strategy is approved.** The
   earlier draft treated the service-worker PR as immediately
   AGENT-executable ("policy already decided"). That is superseded: the
   SW PR is **owner-gated on offline-strategy approval**. Until the owner
   approves the offline strategy, SW absence stays guard-enforced
   (`apps/web/lib/guards/pwa-baseline.test.ts`) and no SW PR may open.
5. **No fake screenshots or staged assets.** Real product screens with
   real states only (honest empty states are fine) — §3 rule is
   owner-confirmed, non-negotiable.
6. **No store submission yet.** Everything here is preparation. Actual
   Play Console upload/submission happens only after the OWNER checklist
   in §8 is complete and the owner performs the upload steps personally.

Nothing in this document generates assets, adds a native wrapper, touches
landing/public marketing pages, changes product code, or submits anything
to any store. It is the runbook those follow-up PRs will execute.

Honesty spine applies throughout: real product states only, evidence tiers
stay `self-declared / journal-supported / manager-confirmed` (never
"AI-verified"), no invented counters, no "instant" claims, no guarantees.

---

## 0. Execution order at a glance

| Step | What | Who | Blocked by |
|---|---|---|---|
| 1 | Icon source approval | OWNER | nothing — one-line decision |
| 2 | PNG icon export + manifest wiring PR | AGENT | step 1 |
| 3 | Maskable verification (maskable.app) | AGENT (evidence) + OWNER (approval) | step 2 |
| 4 | Offline-strategy approval | OWNER | nothing — decision gate for step 5 |
| 5 | Service-worker PR (Play quality bar) | AGENT | step 4 (**owner-gated** — no SW until offline strategy approved) |
| 6 | Screenshot capture (LT minimum set first) | AGENT captures, OWNER approves flow + reviews images | step 2 recommended; real account state approved by owner |
| 7 | Play metadata final wording | OWNER | nothing — drafts below are ready |
| 8 | Support contact decision | OWNER | nothing |
| 9 | Play developer account ($25) | OWNER | steps 1–8 |
| 10 | Bubblewrap init/build + signing key | OWNER (key is owner-held) | steps 2, 5, 9 |
| 11 | `assetlinks.json` PR | AGENT | step 10 (fingerprint) |
| 12 | Internal-testing upload → production | OWNER | steps 10–11 |

Steps 1, 4 and 7–8 can start **today** in parallel — all four are owner
decisions, no agent work is unblocked before step 1 or step 4 lands.
Capacitor/iOS remains DEFERRED throughout (§6) — deferred, not never.

---

## 1. Icon production — exact table

### Source state (verified in repo)

- `apps/web/public/app-icon.svg` — 32×32 viewBox, ascending-bars mark on
  its own `#0B0D17` plate with `rx="7"` rounded corners, gradient
  `#3E8BFF → #8B5CF6`. Guard-pinned by
  `apps/web/lib/guards/pwa-baseline.test.ts`.
- `apps/web/app/icon.svg` — Next.js auto-favicon route.
- `apps/web/app/favicon.ico` — declared in manifest at 48×48.
- `apps/web/app/manifest.ts` — currently declares only the SVG
  (`purpose: any` + `purpose: maskable`) and favicon.ico. **No PNG icons
  exist anywhere in the repo yet.**
- **No `<link rel="apple-touch-icon">` exists yet** (verified: no match in
  `apps/web/app`).

### Production-critical geometry facts (measured, not assumed)

1. **Safe zone: PASSES.** The maskable safe circle is 80% of canvas width
   (radius 12.8 px on the 32 px viewBox, centered at 16,16). The farthest
   bar corners — (24,7), (24,25), (8,25) — sit at 12.04 px from center.
   The mark fits entirely inside the safe circle; a mechanical export is
   geometrically valid for `purpose: maskable`.
2. **Corner transparency: MUST BE FLATTENED.** The plate rect has
   `rx="7"`, so the four canvas corners outside the rounded rectangle are
   **transparent**. That is fine for `purpose: any` icons, but maskable
   icons and the apple-touch-icon must have the plate color bleeding
   edge-to-edge with zero transparency. Every maskable/apple export below
   therefore composites the SVG over a full-square `#0B0D17` background.

### Export table — file → size → purpose → how

All rasters come from `app-icon.svg` once the owner gives the one-line
approval ("generate all rasters from `app-icon.svg` as-is") or supplies
≥1024×1024 replacement source art.

| # | File | Size | Purpose | Flatten to full-square `#0B0D17`? | Destination |
|---|---|---|---|---|---|
| 1 | `icon-192.png` | 192×192 | manifest `purpose: any` | No (keep rounded-corner transparency) | `apps/web/public/` |
| 2 | `icon-512.png` | 512×512 | manifest `purpose: any`; Play splash source | No | `apps/web/public/` |
| 3 | `icon-maskable-192.png` | 192×192 | manifest `purpose: maskable` | **Yes** | `apps/web/public/` |
| 4 | `icon-maskable-512.png` | 512×512 | manifest `purpose: maskable` | **Yes** | `apps/web/public/` |
| 5 | `apple-touch-icon.png` | 180×180 | iOS add-to-home-screen | **Yes** (opaque, no alpha at all — iOS rounds it itself) | `apps/web/public/` + `<link rel="apple-touch-icon">` |
| 6 | Play hi-res icon | 512×512, 32-bit PNG **with alpha**, ≤1 MB | Play Console listing field | No (item 2 output can be reused if it meets the alpha requirement) | Play Console upload only — NOT committed |
| 7 | Feature graphic | 1024×500 PNG/JPG | Play Console listing field | design task, not a mechanical export | Play Console upload only — NOT committed; OWNER sign-off required |

### Exact export commands (AGENT-runnable)

Neither `sharp` nor `resvg` is currently a repo dependency (verified).
The icon PR adds `sharp` as a **devDependency of `apps/web` only** and a
one-shot script `apps/web/scripts/export-store-icons.mjs`, so the export
is reproducible and review-able instead of a hand-made binary drop:

```js
// apps/web/scripts/export-store-icons.mjs  (added by the icon PR)
// Run: node apps/web/scripts/export-store-icons.mjs
import sharp from "sharp";

const SRC = "apps/web/public/app-icon.svg";
const OUT = "apps/web/public";
const PLATE = "#0B0D17";
// density scales the 32px viewBox up so rasterization is sharp at target size
const render = (size) =>
  sharp(SRC, { density: (72 * size) / 32 }).resize(size, size);

// purpose:any — keep the rounded-corner transparency
await render(192).png().toFile(`${OUT}/icon-192.png`);
await render(512).png().toFile(`${OUT}/icon-512.png`);

// purpose:maskable — plate bleeds edge-to-edge, no transparent corners
await render(192).flatten({ background: PLATE }).png().toFile(`${OUT}/icon-maskable-192.png`);
await render(512).flatten({ background: PLATE }).png().toFile(`${OUT}/icon-maskable-512.png`);

// apple-touch-icon — fully opaque (removeAlpha), iOS applies its own mask
await render(180).flatten({ background: PLATE }).removeAlpha().png().toFile(`${OUT}/apple-touch-icon.png`);
```

Icon PR contents (one PR, readiness v2 step 2):

1. The 5 PNGs above in `apps/web/public/`.
2. `apps/web/app/manifest.ts` — add the four manifest `icons` entries
   (192/512 × any/maskable) alongside the existing SVG entries.
3. `apps/web/app/[locale]/layout.tsx` — add the `apple-touch-icon` link
   (via Next metadata `icons.apple`).
4. `apps/web/lib/guards/pwa-baseline.test.ts` — extend the guard to pin
   the new files' existence + manifest entries.
5. The export script + `sharp` devDependency, so regeneration is one
   command.

## 2. Maskable requirement summary + verification

- Full-square canvas; plate color (`#0B0D17`) to all four edges; **no
  transparency anywhere in the bleed area** (transparent corners render
  as black/white artifacts on some launchers).
- Brand mark entirely inside the centered 80%-width safe circle
  (radius 40% of width — 153.6 px diameter on a 192 px canvas). Current
  mark: verified inside (max corner distance 12.04/12.8 units, §1).
- Verification (step 3 of the run order):
  1. AGENT: after export, attach both maskable PNGs to the icon PR and
     note pixel-corner opacity check (corner pixel must equal `#0B0D17`,
     alpha 255).
  2. OWNER (or agent with browser evidence): drag each maskable PNG into
     <https://maskable.app/editor> and check every mask shape (circle,
     squircle, rounded square, minimum). Nothing legible may be cropped.

## 3. Screenshots — device × locale matrix

Rule (non-negotiable): screenshots show REAL product screens with real
states. A real empty state is fine. No fake data, no mock counters, no
staged numbers, no personal data of real users.

### Minimum viable set FIRST (ship-blocking set)

| Priority | Set | Count | Spec |
|---|---|---|---|
| P0 | LT phone (portrait) | 4 | 1080×1920 or taller (1080×2340 fine); PNG/JPG ≤8 MB each |
| P0 | EN phone | 4 | same |
| P0 | RU phone | 4 | same |
| P1 | 5th–6th shot per locale (bookings/inbox) | +2 per locale | same |
| P2 | 7" tablet (~1200×1920) | 2–4, EN only first | Play tablet listing quality |
| P2 | 10" tablet (~1600×2560) | 2–4, EN only first | Play tablet listing quality |

P0 total: **12 phone screenshots** (4 × LT/EN/RU). Play minimum is 2;
4 per locale is the recommended floor. Listing locales for v1: LT
(primary), EN, RU — the app itself ships 12 locales, more listing locales
can be added later.

Capture method: production build, mobile viewport (Chrome DevTools
390×844 or a real device; export at ≥1080 wide), app switched to the
listing locale via `/{locale}/...`, logged into a **real demo-account
state approved by the owner** — or honest empty states on a fresh
account. No emulator chrome; device frames not required. The repo already
has Playwright (`apps/web` devDependency) — an agent can script the
capture run, but the **account state and final images are OWNER-approved
before upload**.

### Flow sequence — real screens in story order

All routes verified to exist in `apps/web/app/[locale]/`. One screen per
shot, portrait, in the listing's locale.

| # | Screen | Route (verified) | Real state required — per-shot notes |
|---|---|---|---|
| 1 | Dashboard | `/{locale}/dashboard` | Worker home with bottom nav and real modules. Fresh-account empty state is acceptable and honest; no seeded fake counters. |
| 2 | Work journal | `/{locale}/dashboard/journal` | The core differentiator (hash-chained entries). Needs at least a few REAL journal entries written by the demo account itself — an empty journal undersells shot 3's evidence claim. Entries must be plausible real work text, written/approved by owner. |
| 3 | Skills & evidence | `/{locale}/dashboard/profile` (skills section) | Evidence tiers exactly as the product renders them: self-declared / journal-supported / manager-confirmed. Whatever tier badges appear must be genuinely earned by the demo account's real journal/confirmation state — never dressed up. |
| 4 | CV / player card | `/{locale}/cv` (print-export view) or `/{locale}/dashboard/player-card` | Built from the SAME demo account's journal evidence as shots 2–3, so the story is internally consistent. Pick whichever renders stronger; do not show both with different data. |
| 5 | Opportunities | `/{locale}/dashboard/opportunities` | Real opportunities from verified companies if any exist in production; otherwise the honest empty state. Never seed fake listings. |
| 6 (P1) | Bookings or inbox | `/{locale}/dashboard/bookings` or `/{locale}/dashboard/inbox` | Scheduling / in-app communication. Same rule: real or honestly empty. |

Text overlays: safer v1 is **no overlays, raw screens**. If overlays are
ever used: one short claim per frame, owner-approved wording, same
honesty rules as §4 copy.

## 4. Play Store metadata — production draft (owner wording approval REQUIRED)

Carried over from the owner pack; character limits re-verified by
counting (2026-07-06). Nothing is final until the owner edits/approves.

### Title (≤30 chars)

`LabourMarket.ai` (15 chars — OK)

### Short description (≤80 chars — all three verified under limit)

| Locale | Draft | Count |
|---|---|---|
| EN | `Work journal, worker profiles and labour-market tools for construction.` | 71 — OK |
| LT | `Darbo žurnalas, darbuotojų profiliai ir darbo rinkos įrankiai statyboms.` | 72 — OK |
| RU | `Рабочий журнал, профили работников и инструменты рынка труда для строительства.` | 79 — OK (fallback if a console counter disagrees: `Рабочий журнал и профили работников для строительной отрасли.` — 61) |

### Full description (≤4000 chars) — EN draft

> **LabourMarket.ai — a work journal that becomes your professional record.**
>
> LabourMarket.ai is built for construction workers, crews and the
> companies that hire them.
>
> **Work journal.** Log what you actually did on site. Entries are
> hash-chained, so your record is tamper-evident and yours.
>
> **Skills with honest evidence.** Every skill on your profile carries
> its evidence level: self-declared, journal-supported, or confirmed by
> a manager who was there. We never label anything "verified" unless a
> person confirmed it.
>
> **A CV built from evidence.** Export a print-ready CV assembled from
> your journal and confirmed skills — not from empty claims.
>
> **Opportunities from verified companies.** Browse real work
> opportunities posted by companies on the platform, and manage bookings
> and messages in one place.
>
> **For companies.** Post opportunities, review worker profiles with
> their evidence trail, confirm skills you have witnessed, and manage
> your crew's records.
>
> The app is free to install. An internet connection is required.

LT and RU full descriptions: adapted translation of the approved EN
version (european-market-copy-localization pass — adapted, not literal);
owner reviews the LT text personally.

Forbidden in ALL store copy (honesty spine): user counters, "instant",
"guaranteed", "AI-verified", any metric not measured in production.

### Listing settings

| Field | Value |
|---|---|
| Category | Business |
| Tags | business, productivity (matches manifest `categories`) |
| Contains ads | No |
| In-app purchases | No (billing inactive) |
| Content rating questionnaire | Everyone; no user-generated public content visible without account; communication features exist (in-app messaging) — answer truthfully, this may raise the rating |
| Target audience | 18+ (work platform) |
| Data safety form | Declare: account data (email), profile data, user content (journal entries, CV, messages, uploads). Collected, not sold. OWNER reviews against the live privacy policy before submitting |

## 5. Privacy / support URL requirements — current status

| URL | Status (verified) | Store need |
|---|---|---|
| Privacy `https://labourmarket.ai/{locale}/legal/privacy` | LIVE (`apps/web/app/[locale]/(marketing)/legal/privacy/page.tsx`) | Play: required field. Apple: required. OWNER verifies content currency before submission |
| Terms `https://labourmarket.ai/{locale}/legal/terms` | LIVE | Recommended in listing; Apple EULA field if custom terms used |
| Support contact | **PENDING OWNER DECISION** — no public support page exists | Play: support **email** required (page optional). Apple: support **URL** required (email not enough) |

Owner options for support: (a) publish a support email only — fastest,
satisfies Play; (b) approve a public `/{locale}/support` page — needed
anyway if Apple ever happens. Option (b) is a public marketing surface →
its own owner-approved PR; NOT part of any autonomous slice.

## 6. Apple App Store metadata (DEFERRED — prepared only)

Owner-locked 2026-07-06 (decision lock item 3): **Capacitor/iOS comes
later — explicitly deferred, not never.** For now there is no native
wrapper; iOS ships as add-to-home-screen. Metadata below exists only so
nothing has to be invented when the owner green-lights the Capacitor/iOS
phase. **Do not act on it until then.**

| Field | Draft |
|---|---|
| App name (≤30) | `LabourMarket.ai` |
| Subtitle (≤30) | EN: `Construction work journal` / LT: `Statybų darbo žurnalas` |
| Promotional text (≤170) | `Log your work, build evidence-backed skills, and export a CV that proves what you have done.` |
| Keywords (≤100 chars) | `construction,work journal,worker,CV,skills,labour,jobs,crew,site,builder` |
| Description | Reuse approved Play full description (§4) |
| Categories | Primary Business, secondary Productivity |
| Age rating | 17+ (unrestricted web content / user communication) — confirm via Apple questionnaire |
| Privacy nutrition labels | Same data set as the Play data-safety form (§4) |
| Support URL | REQUIRED by Apple — blocked on §5 owner decision (option b) |
| Marketing URL (optional) | `https://labourmarket.ai` |
| Review demo account | Apple requires working credentials — OWNER must create one |

iOS-only extra cost if ever pursued: Apple Developer Program ($99/yr,
owner-held), a real native shell (Capacitor) with maintenance cost, and
thin-wrapper rejection risk.

## 7. TWA path — next commands with preconditions in order

Preconditions (must be true, in this order — none are done yet):

1. **Icon PR merged** (§1 items 1–5 + manifest/layout/guard wiring).
2. **Offline strategy approved by OWNER, then service-worker PR merged**
   — Play quality bar. The candidate policy (readiness v1 §5: cache
   static assets + honest offline fallback page, NEVER cache authed HTML)
   is a proposal, **not yet owner-approved** (decision lock 2026-07-06,
   item 4). SW absence stays guard-enforced until the owner approves the
   offline strategy; only then does the SW PR become AGENT-executable.
3. **Play developer account created** — $25 one-time, OWNER-held secret.

Then, on the OWNER's machine (needs JDK + Android SDK; Bubblewrap offers
to install both on first run):

```bash
# one-time install
npm i -g @bubblewrap/cli

# initialize the wrapper from the live manifest
bubblewrap init --manifest https://labourmarket.ai/manifest.webmanifest
#   applicationId suggestion: ai.labourmarket.app
#   host: labourmarket.ai
#   signing key: CREATE NEW during init — keystore + passwords are
#   OWNER-held secrets; never committed, never pasted into a session

# build the signed AAB + APK
bubblewrap build
#   outputs: app-release-bundle.aab (upload to Play) + a test APK

# print the SHA-256 signing fingerprint for assetlinks.json
bubblewrap fingerprint list
```

Owner hands back ONLY the SHA-256 fingerprint. Then the AGENT opens the
assetlinks PR — create `apps/web/public/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ai.labourmarket.app",
    "sha256_cert_fingerprints": ["<FINGERPRINT-FROM-ABOVE>"]
  }
}]
```

(cannot be created earlier — the fingerprint only exists after the signing
key does). Verify with the Google Digital Asset Links generator
(`https://developers.google.com/digital-asset-links/tools/generator`),
then: upload the `.aab` to the Play **internal testing** track → install
on a real device → confirm the URL bar is hidden (assetlinks verified) →
OWNER approves → promote to production.

## 8. Who does what — the split

### OWNER-only (cannot be produced from inside the repo)

Until these exist, store submission is `BLOCKED_EXTERNAL_INPUT_REQUIRED`:

- [ ] **Icon source decision (final icon source art)** — supply
      ≥1024×1024 source art OR one-line approval: "generate all rasters
      from `app-icon.svg` as-is". (§1)
- [ ] **Maskable icon approval** — eyeball both maskable PNGs in
      <https://maskable.app/editor> across every mask shape and approve.
      (§2 / run-order step 3)
- [ ] **Offline-strategy approval** — approve (or amend) the readiness
      v1 §5 cache policy before any service-worker PR opens. (decision
      lock item 4; run-order step 4)
- [ ] **Real screenshots — flow approval + image review** — approve the
      §3 flow + the demo-account state used for capture; review all 12
      final images before upload.
- [ ] **Play metadata approval** — title, LT/EN/RU short descriptions, EN
      full description; LT/RU full translations personally reviewed. (§4)
- [ ] **Support email / contact decision** — email only, or approve a
      public support page. (§5)
- [ ] **Feature graphic sign-off** — 1024×500 banner (§1 item 7).
- [ ] **Store account access — Play developer account** — create, pay
      $25, hold credentials (never enters the repo). (§7)
- [ ] **TWA signing key** — created during `bubblewrap init`; owner-held;
      only the SHA-256 fingerprint comes back. (§7)
- [ ] **Data-safety / content-rating answers** — confirm §4 declarations
      against the live privacy policy.
- [ ] *(only if Capacitor/iOS is ever green-lit — deferred, not never)*
      Apple Developer Program + review demo account + support URL.

### AGENT-executable (each is one autonomous PR, in this order)

1. **PNG icon PR** — blocked only on the owner's icon-source decision;
   contents fixed in §1 (5 PNGs + export script + manifest + apple-touch
   link + guard update).
2. **Service-worker PR** — **owner-gated**: blocked on the owner's
   offline-strategy approval (decision lock item 4). The readiness v1 §5
   policy is the candidate proposal, not pre-approval. Do NOT open this
   PR before the gate clears.
3. **Screenshot capture run** — Playwright-scripted against production,
   owner-approved account state; output goes to owner review, not to the
   repo.
4. **assetlinks.json PR** — blocked on the owner's fingerprint. (§7)

---

*This pack is docs-only. No assets were generated, no dependencies added,
no store accounts touched, no marketing pages changed, no product code
modified.*
