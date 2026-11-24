import type { ReactNode } from "react";

/**
 * Root layout — a pass-through.
 *
 * Every product route lives under `app/[locale]`, whose layout owns the
 * `<html>` / `<body>` document (fonts, theme, providers). This file exists so
 * that Next can render `app/not-found.tsx` for paths the locale tree never
 * sees: requests with a file extension (`/foo.xml`, `/foo.json`, `/x.txt`)
 * skip the i18n middleware by its matcher and, without a root layout, fell
 * through to `global-error` as a 500 (P2-1, 2026-09-03). It renders nothing
 * of its own — the locale layout still produces exactly one document.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
