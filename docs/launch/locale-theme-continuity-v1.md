# Locale & theme continuity contract v1 (core-network area D)

## Rule

Changing language changes ONLY the locale. It never changes the theme,
the page, the query string, the hash, or the selected context.

## What was actually broken (audit findings)

1. **Confirmed defect:** the shared `LocaleSwitcher`
   (`components/marketing/locale-switcher.tsx`, used in the public nav,
   footer and dashboard header) built its links from `usePathname()`
   alone — every language change dropped `?query` and `#hash`
   (`?next=` return paths, journal `?editing`, activity filters, the new
   calendar `?view/?date`, invite tokens in `?next`).
2. **Theme was NOT locale-keyed** and locale switching did NOT flash:
   storage is the single shared `localStorage["theme"]` key; a locale
   switch is a soft client navigation that preserves the imperative
   `data-theme` attribute.
3. The only real flash path was the 404 `<html>` remount, which stripped
   `data-theme` and re-applied it only post-paint (`ThemeReapply`).

## Fixes

- The switcher reads `window.location.search + window.location.hash`
  when its menu opens and appends it to every locale link — route,
  query, hash, invite `?next`, calendar view/date and conversation deep
  links all survive. (Client-only read — no `useSearchParams` Suspense
  requirement on statically rendered pages.)
- The branded 404 gets the same synchronous pre-paint theme script the
  `[locale]` layout uses; `ThemeReapply` stays as the client-remount
  belt.
- Stale "root layout" comments corrected (the bootstrap lives in
  `app/[locale]/layout.tsx`; the app has no root layout).

## Theme model (unchanged, now guarded)

- Single shared `"theme"` localStorage key — never locale-derived.
- Pre-paint bootstrap in the `[locale]` layout `<head>` applies the saved
  choice before first paint on every full document load.
- Design default is dark (`:root`); a system-preference fallback is
  deliberately NOT implemented — the product's default appearance is a
  design decision, and the requirement permits (not mandates) system
  preference when the user hasn't chosen. Documented here as the
  intentional interpretation.

## Proof

`apps/web/lib/guards/locale-theme-continuity.test.ts` pins: query+hash
carriage in the switcher, soft-navigation locale links, no theme
reads/writes in the switcher, the shared non-locale-keyed theme key in
every theme writer, and the pre-paint bootstrap in both the layout and
the 404.
