import Link from "next/link";

import "./globals.css";

/**
 * Root 404 — the truthful answer for a path outside the locale tree.
 *
 * Reached only by requests the i18n middleware never rewrites (its matcher
 * skips anything with a dot: `/foo.xml`, `/foo.json`, `/anything.txt`).
 * Before this file existed those requests had no not-found boundary under a
 * root layout and surfaced as a 500 from `global-error` (P2-1, 2026-09-03) —
 * a soft error crawlers logged against the apex. Locale-prefixed unknown
 * paths keep landing on the localized `app/[locale]/not-found.tsx`.
 *
 * Outside `next-intl`, so the copy is static in the two launch languages.
 * Tokens only (design-tokens guard): same classes as the localized sibling.
 */
export default function RootNotFound() {
  return (
    <html lang="en" data-theme="light">
      <body className="bg-ink-900 font-sans text-text-primary antialiased">
        <main
          className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
          data-testid="branded-not-found-root"
        >
          <p className="font-mono text-xs uppercase tracking-label text-text-muted">404</p>
          <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
            This address does not exist
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-text-secondary">
            Šio adreso nėra. Nothing was found at this path — it may have moved or never existed.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            data-testid="not-found-root-home-cta"
          >
            Go to labourmarket.ai
          </Link>
        </main>
      </body>
    </html>
  );
}
