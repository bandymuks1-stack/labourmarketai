# Mobile app store readiness v2 — assets, metadata drafts, decisions

Status: quality-train PR J (2026-07-06). Continues PR #644's PWA baseline
(`mobile-app-readiness-v1.md`). Nothing is submitted to any store; no
native wrapper is added; no service worker exists (still intentional —
offline needs its own cache-policy PR).

## Current verified state

- Manifest (`apps/web/app/manifest.ts`): name, short_name, description,
  id, start_url, scope, display=standalone, orientation, theme/background
  (#06070D), NEW in v2: `categories: ["business","productivity"]`.
- Icons: real brand SVG (`public/app-icon.svg`, own background plate,
  maskable-safe) + favicon.ico. No demo SVGs (guard-pinned).
- Apple: `appleWebApp` metadata + `viewport-fit=cover` (safe areas).
- Installable today on Android (Chrome/Edge/Samsung) and iOS
  (add-to-home-screen). NOT offline-capable — stated, not hidden.
- Public URLs stores need: privacy `/{locale}/legal/privacy`, terms
  `/{locale}/legal/terms` — live. Public support page does NOT exist
  (owner decision; it is a public marketing surface).

## Asset checklist (owner supplies source art; generation is mechanical)

| Asset | Spec | Store need |
|---|---|---|
| App icon PNG 192×192 | from ≥1024px source, brand mark on #0B0D17 plate | Play (required) |
| App icon PNG 512×512 | same source | Play (required; splash) |
| Maskable PNG 192×192 | mark inside 80% safe circle, plate to edges | Play adaptive icons |
| Apple touch icon 180×180 PNG | opaque, no transparency | iOS home screen (`<link rel="apple-touch-icon">`) |
| Screenshots ×3–5 | 1080×1920+ real product screens (dashboard, journal, opportunities, CV) — no fake data, no mock counters | Play listing + manifest `screenshots` |
| Feature graphic 1024×500 | Play listing banner | Play (required) |

Rule inherited from the honesty spine: screenshots show REAL product
states (a real empty state is fine); never staged fake numbers.

## Play Store metadata DRAFT (owner wording approval required)

- Title (≤30): `LabourMarket.ai`
- Short description (≤80, EN): `Work journal, worker profiles and
  labour-market tools for construction.`
- Short description (LT): `Darbo žurnalas, darbuotojų profiliai ir darbo
  rinkos įrankiai statyboms.`
- Full description: assemble from real product modules ONLY — work
  journal (hash-chained entries), skills with evidence tiers (self-
  declared / journal-supported / manager-confirmed — never "AI-verified"),
  verified CV print export, opportunities from verified companies,
  bookings, in-app messaging. NO counters, NO "instant", NO guarantees.
- Category: Business. Contains ads: no. In-app purchases: no (billing
  inactive).
- Privacy policy URL: `https://labourmarket.ai/lt/legal/privacy`
- Support contact: **owner decision** (email or a new public support
  page — public marketing surface, owner-gated).

## iOS App Store: DEFERRED (decision unchanged from v1 §4)

Add-to-home-screen ships today. Capacitor/native wrapper stays NOT
recommended: Apple rejects thin wrappers, real maintenance cost, no
commercial case yet. Revisit only on explicit commercial need.

## TWA (Android / Play) — the path when the owner is ready

1. Owner supplies icon source art + screenshots (checklist above).
2. PNG icon PR (assets + manifest entries + apple-touch-icon link + guard
   updates).
3. Service-worker PR — REQUIRED by Play quality bar. Policy already
   decided in v1: cache static assets + honest offline fallback page,
   NEVER cache authed HTML. Until then SW absence stays guard-enforced.
4. Play developer account + signing key (owner-held secrets).
5. `/.well-known/assetlinks.json` (needs the signing fingerprint — cannot
   be created before step 4).
6. Bubblewrap wrapper build → internal testing track → owner approves →
   production listing.

## Owner action list (smallest form)

1. Provide ≥1024px icon source art (or approve generating from
   app-icon.svg as-is).
2. Approve/edit the Play metadata draft above.
3. Decide the support contact (email vs public page).
4. When ready for Play: create the developer account (owner-only secret).

## Guards

`lib/guards/pwa-baseline.test.ts` extended: `categories` pinned; existing
pins stay (required fields, real icon files, NO service worker until the
offline-policy PR, demo SVGs stay deleted).
