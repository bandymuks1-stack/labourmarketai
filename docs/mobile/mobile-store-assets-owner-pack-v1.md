# Mobile store assets — owner pack v1

Status: docs-only owner package (2026-07-06). Continues
`mobile-app-readiness-v1.md` (PWA baseline, PR #644) and
`mobile-store-readiness-v2.md` (quality-train PR J). Nothing in this
document submits anything to any store, adds a native wrapper, or changes
product code. It is the single practical checklist the owner works from
when store submission starts.

Honesty spine applies throughout: real product states only, evidence
tiers stay `self-declared / journal-supported / manager-confirmed`
(never "AI-verified"), no invented counters, no "instant" claims, no
guarantees.

---

## 1. Icons — what exists vs what is missing

### Exists in the repo today (verified)

| Asset | Path | Notes |
|---|---|---|
| Brand SVG icon | `apps/web/public/app-icon.svg` | 32×32 viewBox, ascending-bars mark on its own `#0B0D17` plate, gradient `#3E8BFF → #8B5CF6`. Declared in manifest as `purpose: any` AND `purpose: maskable`, `sizes: any`. Guard-pinned. |
| App-route icon | `apps/web/app/icon.svg` | Next.js auto-favicon route. |
| Favicon | `apps/web/app/favicon.ico` | Declared in manifest at 48×48. |
| Manifest | `apps/web/app/manifest.ts` | name / short_name / id / start_url / scope / display=standalone / orientation=portrait / categories / theme+background `#06070D`. Guarded by `apps/web/lib/guards/pwa-baseline.test.ts`. |

### Missing — must be generated from owner-approved source art

All rasters come from ONE ≥1024×1024 px master (either owner-supplied
source art, or owner approves mechanical export of `app-icon.svg` as-is).

| # | Asset | Exact spec | Where it goes | Store requirement |
|---|---|---|---|---|
| 1 | `icon-192.png` | 192×192 PNG, mark on `#0B0D17` plate | `apps/web/public/` + manifest `icons` entry (`purpose: any`) | Play / older Android launchers |
| 2 | `icon-512.png` | 512×512 PNG, same source | `apps/web/public/` + manifest entry (`purpose: any`) | Play (splash screen source) |
| 3 | `icon-maskable-192.png` | 192×192 PNG, see §2 | `apps/web/public/` + manifest entry (`purpose: maskable`) | Android adaptive icons |
| 4 | `icon-maskable-512.png` | 512×512 PNG, see §2 | `apps/web/public/` + manifest entry (`purpose: maskable`) | Android adaptive icons (hi-res) |
| 5 | `apple-touch-icon.png` | 180×180 PNG, **opaque — no transparency**, plate color to all four corners (iOS does its own rounding) | `apps/web/public/` + `<link rel="apple-touch-icon">` in `app/[locale]/layout.tsx` | iOS add-to-home-screen |
| 6 | Play Store hi-res icon | 512×512 **32-bit PNG with alpha**, ≤1 MB | Uploaded in Play Console only (not in repo) | Play (required listing field) |
| 7 | Feature graphic | 1024×500 PNG/JPG, no text near edges, brand mark + product name | Uploaded in Play Console only | Play (required listing field) |

Follow-up PR shape when assets exist: assets + manifest entries +
apple-touch-icon link + `pwa-baseline.test.ts` guard update in one PR
(readiness v2 step 2).

## 2. Maskable icon requirements (exact)

- Canvas: full square, background plate (`#0B0D17`) bleeds edge-to-edge —
  Android crops the outer region into circles/squircles/rounded squares.
- Safe zone: the brand mark must fit entirely inside a centered circle of
  **80% of canvas width** (radius = 40% of width; e.g. 154 px diameter on
  a 192 px canvas). Nothing legible outside that circle.
- No transparency in the bleed area — transparent corners produce black
  or white artifacts on some launchers.
- Verify before shipping with https://maskable.app/editor (drag the PNG
  in, check every mask shape).
- The current `app-icon.svg` already follows this geometry (own plate,
  centered mark), so a mechanical export is expected to pass.

## 3. Screenshots — list by device and locale

Rule (inherited, non-negotiable): screenshots show REAL product screens
with real states. A real empty state is fine. **No fake data, no mock
counters, no staged numbers.**

### Locales

Store listing locales for v1: **LT (primary), EN, RU**. The app itself
ships 12 locales (da, de, en, et, fi, lt, lv, nl, no, pl, ru, sv) — more
listing locales can be added later, but LT/EN/RU covers the launch
market. Each listing locale needs its own screenshot set (same flow,
app switched to that locale via `/{locale}/...`).

### Device matrix

| Device class | Resolution | Count | Needed for |
|---|---|---|---|
| Android phone (portrait) | 1080×1920 or taller (e.g. 1080×2340); PNG/JPG, ≤8 MB each | 4–6 per locale | Play listing (min 2, recommended 4+) |
| 7" tablet | ~1200×1920 | optional, 2–4 | Play tablet listing quality |
| 10" tablet | ~1600×2560 | optional, 2–4 | Play tablet listing quality |

Total minimum: **12 phone screenshots** (4 × LT/EN/RU). Tablets optional
for v1.

(iOS is deferred — see §6. If/when a native iOS app exists: 6.9" 1320×2868
and 6.5" 1284×2778 sets per locale.)

### Capture method

Real product against the production build, mobile viewport (e.g. Chrome
DevTools 390×844 or a real device), logged into a **real demo-account
state approved by the owner** — or honest empty states on a fresh
account. Strip any personal data of real users. No emulator chrome, no
device frames required (Play accepts raw screens).

## 4. Suggested screenshot flow sequence

Order sells the product story: journal → evidence → CV → work. One
screen per screenshot, portrait, app in the listing's locale.

| # | Screen | Route | What it must show honestly |
|---|---|---|---|
| 1 | Dashboard | `/{locale}/dashboard` | Worker home: bottom nav, real modules, real (or empty) state |
| 2 | Work journal | `/{locale}/dashboard/journal` | Journal entries / composer — the core differentiator (hash-chained entries) |
| 3 | Skills & evidence | `/{locale}/dashboard/profile` (skills section) | Evidence tiers exactly as in product: self-declared / journal-supported / manager-confirmed |
| 4 | Verified CV | `/{locale}/dashboard/cv` (or `/{locale}/cv`) | CV print-export view built from journal evidence |
| 5 | Opportunities | `/{locale}/dashboard/opportunities` | Real opportunities list from verified companies (or honest empty state) |
| 6 (optional) | Bookings or messaging | `/{locale}/dashboard/bookings` or `/{locale}/dashboard/inbox` | Scheduling / in-app communication |

Optional text overlays on screenshots (Play allows captioned frames):
keep to one short claim per frame, owner-approved wording, same honesty
rules as descriptions (§5). Safer v1: no overlays, raw screens.

## 5. Play Store listing drafts (owner wording approval REQUIRED)

Nothing below is final until the owner edits/approves. Character limits
are hard Play Console limits.

### Title (≤30 chars)

`LabourMarket.ai`

### Short description (≤80 chars)

- EN: `Work journal, worker profiles and labour-market tools for construction.`
- LT: `Darbo žurnalas, darbuotojų profiliai ir darbo rinkos įrankiai statyboms.`
- RU: `Рабочий журнал, профили работников и инструменты рынка труда для строительства.` *(79 chars — verify in console; trim to «Рабочий журнал и профили работников для строительной отрасли.» if the counter disagrees)*

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

LT and RU full descriptions: translate the approved EN version
(european-market-copy-localization pass — adapted, not literal), owner
reviews the LT text personally.

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
| Data safety form | Declare: account data (email), profile data, user content (journal entries, CV, messages, uploads). Collected, not sold. Owner reviews against the live privacy policy before submitting |

## 6. Apple App Store metadata draft (DEFERRED — prepared only)

Decision unchanged (readiness v1 §4 / v2): **no native wrapper now**;
iOS ships as add-to-home-screen. This section exists so that if the
owner ever green-lights iOS, the metadata is ready. Do not act on it
otherwise.

| Field | Draft |
|---|---|
| App name (≤30) | `LabourMarket.ai` |
| Subtitle (≤30) | EN: `Construction work journal` / LT: `Statybų darbo žurnalas` |
| Promotional text (≤170) | `Log your work, build evidence-backed skills, and export a CV that proves what you have done.` |
| Keywords (≤100 chars) | `construction,work journal,worker,CV,skills,labour,jobs,crew,site,builder` |
| Description | Reuse approved Play full description (§5) |
| Primary category | Business |
| Secondary category | Productivity |
| Age rating | 17+ (unrestricted web content / user communication) — confirm via Apple questionnaire |
| Privacy nutrition labels | Same data set as Play data-safety form (§5) |
| Support URL | REQUIRED by Apple — see §7 (owner decision blocks this) |
| Marketing URL (optional) | `https://labourmarket.ai` |
| Sign-in demo account for review | Apple requires working credentials for a review account — owner must create one |

Additional iOS-only cost if ever pursued: Apple Developer Program
($99/yr, owner-held), real native shell (Capacitor) with non-trivial
maintenance, and thin-wrapper rejection risk (v1 §4).

## 7. Privacy / support URL requirements

| URL | Status | Store need |
|---|---|---|
| Privacy policy `https://labourmarket.ai/lt/legal/privacy` | LIVE (`apps/web/app/[locale]/(marketing)/legal/privacy/page.tsx`; also en/ru locales) | Play: required field. Apple: required. Owner should verify content is current before submission |
| Terms `https://labourmarket.ai/lt/legal/terms` | LIVE | Recommended in listing / required by Apple EULA field if custom terms used |
| Support contact | **DOES NOT EXIST as a public page — owner decision pending** (public marketing surface, owner-gated per readiness v2) | Play: support email is required (page optional). Apple: support URL is required (email is not enough) |

Owner options for support: (a) publish a support email only
(fastest — satisfies Play), (b) add a public `/[locale]/support` page
(needed anyway if Apple ever happens). Option (b) is a marketing-surface
change → its own owner-approved PR.

## 8. TWA — exact next commands (when owner green-lights Play)

Preconditions in order (readiness v2 §TWA — none are done yet):

1. PNG icon PR merged (§1 items 1–5).
2. Service-worker PR merged (Play quality bar; policy already decided:
   cache static assets + honest offline fallback, NEVER cache authed
   HTML; SW absence is guard-enforced until that PR).
3. Play developer account created ($25 one-time, owner-held secret).

Then, on the owner's machine (requires JDK + Android SDK; Bubblewrap
installs them on first run):

```bash
# one-time install
npm i -g @bubblewrap/cli

# initialize the wrapper from the live manifest
bubblewrap init --manifest https://labourmarket.ai/manifest.webmanifest
#   applicationId suggestion: ai.labourmarket.app
#   host: labourmarket.ai
#   signing key: CREATE NEW during init — the keystore + passwords are
#   owner-held secrets; never commit them

# build the signed AAB + APK
bubblewrap build
#   outputs: app-release-bundle.aab (upload this to Play) + a test APK

# print the SHA-256 signing fingerprint for assetlinks.json
bubblewrap fingerprint list
```

Then a small repo PR: create
`apps/web/public/.well-known/assetlinks.json`:

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

(cannot be created earlier — the fingerprint only exists after the
signing key does). Verify with
`https://developers.google.com/digital-asset-links/tools/generator`,
then upload the `.aab` to the Play **internal testing** track, install
on a real device, confirm the URL bar is hidden (assetlinks verified),
owner approves → promote to production.

## 9. What the owner must provide — explicit checklist

Nothing below can be produced from inside the repo. Until these exist,
store submission is `BLOCKED_EXTERNAL_INPUT_REQUIRED`.

- [ ] **Icon source art** ≥1024×1024 px — OR one-line approval:
      "generate all rasters from `app-icon.svg` as-is".
- [ ] **Approve/edit Play metadata** — title, short descriptions
      (LT/EN/RU) and the EN full description in §5; LT/RU full
      translations reviewed by owner.
- [ ] **Support contact decision** — support email only, or approve a
      public support page (Apple would require the page).
- [ ] **Screenshot approval** — approve the flow in §4 and the account
      state (real demo account or honest empty states) used for capture;
      review the 12 final images before upload.
- [ ] **Feature graphic sign-off** — 1024×500 banner (§1 item 7).
- [ ] **Play developer account** — create it, pay the $25 fee, hold the
      credentials (never enters the repo).
- [ ] **TWA signing key** — created during `bubblewrap init`, owner-held
      secret; provide only the SHA-256 fingerprint back for the
      assetlinks PR.
- [ ] **Data-safety / content-rating answers** — confirm the
      declarations in §5 against the live privacy policy.
- [ ] *(only if iOS ever)* Apple Developer Program membership + review
      demo account + support URL.

### What is safe to build WITHOUT the owner (for sequencing)

- Service-worker PR (policy already decided — readiness v1 §5 / v2 §TWA
  step 3).
- PNG icon PR mechanics (the moment the source art / approval above
  lands).
- assetlinks.json PR (the moment the fingerprint lands).

---

*This pack is docs-only. No assets were generated, no store accounts
touched, no marketing pages changed, no product code modified.*
