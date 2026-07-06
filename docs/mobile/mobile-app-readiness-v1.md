# LabourMarket.ai — Mobile app readiness v1 (audit PR9)

> Generated 2026-07-06. Source-grounded status of PWA / installable-app
> readiness, what this PR implements, and the recommended path to an
> Android/iOS presence. No store submission is started here. Landing/public
> marketing pages untouched.

## 1. Readiness status — before this PR

Verified against `origin/main` @ 1d105dc (matches audit §14):

| Area | Status before |
|---|---|
| Web app manifest | ❌ none |
| App icons | favicon.ico + app/icon.svg only; `public/` still carried create-next-app demo SVGs |
| theme-color / viewport metadata | ❌ none anywhere |
| Apple add-to-home-screen metadata | ❌ none |
| Service worker / offline | ❌ none (and none SHOULD ship yet — see §4) |
| Push / notifications | ❌ zero wiring — consistent with the missing notification spine (audit §3 R-adjacent) |
| Auth/session on mobile | ✅ standard Supabase SSR middleware — PWA-compatible as-is |
| Upload/camera flows | ✅ file inputs work in mobile browsers (avatar, CV import, journal composer, buyer attachments); no `capture=` hints yet |
| Map/geolocation | localStorage-only self pin; no special mobile blocker |
| Mobile UI baseline | ✅ bottom nav, 44px targets (PR8), safe-area insets already handled |

## 2. What this PR implements (safe baseline, no architecture change)

1. **`app/manifest.ts`** → served at `/manifest.webmanifest`, auto-linked on
   every page: name/short_name, `display: standalone`, `start_url: "/"`
   (locale middleware + auth flow work unchanged), ink-900 theme/background
   (`#06070D`), SVG icon (any + maskable) + favicon fallback.
2. **`public/app-icon.svg`** — the existing brand icon (ascending bars on its
   own background plate) published at a stable URL for the manifest.
3. **Viewport + theme metadata** in `app/[locale]/layout.tsx`:
   `viewport-fit=cover` (bottom nav already pads for safe-area),
   scheme-aware `theme-color` (dark `#06070D` / light `#F4F6FB`).
4. **Apple add-to-home-screen metadata** (`appleWebApp`: capable, title,
   black-translucent status bar).
5. **Cleanup**: removed the five create-next-app demo SVGs from `public/`.
6. **Guard**: `lib/guards/pwa-baseline.test.ts` pins all of the above.

Result: the product is now *installable* from Chrome/Edge/Samsung on Android
and via Safari add-to-home-screen on iOS, opening full-screen with brand
chrome. It is NOT offline-capable and makes no such claim.

## 3. Deliberately NOT implemented (and why)

- **Service worker / offline fallback** — no existing project pattern; a
  careless SW caching authenticated pages is a real correctness/security
  risk. Do it as its own PR with an explicit cache policy (static assets
  only, network-first for HTML, never cache `/dashboard`).
- **PNG icon set (192/512 + Apple touch icons)** — needs generated raster
  assets (no image tooling in the repo). SVG icons satisfy modern Chromium;
  older Android launchers and iOS home screens render better with PNGs.
  Small follow-up once assets are generated/approved by owner.
- **Push notifications** — requires the notification spine first (the
  product currently has no notification records at all — audit §3 #4).
  Building push before the product knows what a notification IS would be
  fake infrastructure.
- **`capture=` hints on photo inputs** — small UX win for journal photos;
  fold into the next journal-composer PR.

## 4. Path comparison: PWA/TWA vs Capacitor

| | Android PWA/TWA | Capacitor (Android + iOS) |
|---|---|---|
| Effort from here | LOW — this PR + SW + PNG icons + TWA wrapper (Bubblewrap), ~1–2 PRs | MEDIUM-HIGH — new native shells, build pipelines, signing, App Store review |
| iOS presence | Add-to-home-screen only (no App Store listing) | Real App Store listing |
| Push | Web Push (works on Android; iOS 16.4+ with limits) once the spine exists | Native push both platforms (still needs the spine) |
| Code sharing | 100% — the same Next.js app | ~100% web view + native glue to maintain |
| Store policy risk | Google Play accepts TWAs; content must meet quality bar | Apple rejects thin wrappers without native value — real risk today |
| Maintenance | Near zero extra | Two native projects, upgrades, signing keys |

## 5. Recommendation

**Stay PWA-first.** Sequence:

1. (done, this PR) Manifest + metadata + icons baseline.
2. Owner applies the pending notification-spine decisions (audit §17.4).
3. SW PR: static-asset caching + honest offline fallback page ("You're
   offline — LabourMarket needs a connection"), never caching authed HTML.
4. PNG icon set + install-prompt UX polish.
5. Android TWA via Bubblewrap → Google Play listing (low effort, real store
   presence).
6. Revisit Capacitor ONLY if an iOS App Store listing becomes commercially
   necessary — today it adds maintenance without user value beyond the
   listing itself.

## 6. Store checklist (for the future TWA step)

- [ ] PNG icons 192/512 + maskable + Apple touch icon
- [ ] Service worker + offline fallback (Play quality bar)
- [ ] Digital Asset Links (`assetlinks.json`) for TWA verification
- [ ] Privacy policy URL (exists — verify content current)
- [ ] Play developer account + signing key (owner-held secret — owner gate)
- [ ] Screenshots + store copy (owner voice; social-content drafts possible)
- [ ] Push (optional for v1) — needs notification spine

## 7. Blockers summary

| Blocker | Owner decision needed? |
|---|---|
| Notification spine (blocks push, bell, badges) | Yes — audit §17.4 |
| PNG/raster icon generation + approval | Yes — brand asset approval |
| Play developer account + signing | Yes — credentials (hard owner gate) |
| SW cache policy PR | No — safe to build next |
