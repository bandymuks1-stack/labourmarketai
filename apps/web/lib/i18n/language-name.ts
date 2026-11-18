/**
 * A LANGUAGE'S NAME, IN THE READER'S OWN LANGUAGE.
 *
 * Pure, no React, no `"use client"` — which is the whole reason this file
 * exists. It used to live in `components/app/vacancy-translate-control.tsx`, a
 * `"use client"` module, and three SERVER surfaces imported it from there:
 * `/jobs`, `/jobs/[id]` and the landing's open-jobs band.
 *
 * That worked only because those routes render dynamically. The moment a
 * STATICALLY PRERENDERED page called it, `next build` failed with "Attempted to
 * call displayLanguageName() from the server but displayLanguageName is on the
 * client" — caught while prerendering `/lt`. A client module's exports are
 * client references on the server, so a pure helper may not sit in one.
 *
 * Typecheck did NOT catch that, and neither did the unit suite: the boundary is
 * a bundler rule, not a type. Only the build saw it.
 *
 * `Intl.DisplayNames` is the product's existing idiom for this, and the
 * fallback is the code itself — never a guess and never an empty string.
 */
export function displayLanguageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
