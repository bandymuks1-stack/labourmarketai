/**
 * Auth call-to-action link (login / signup) for the PUBLIC marketing nav.
 *
 * Single-domain policy (2026-07-19): the whole product — marketing,
 * auth, callback, dashboard — lives on https://labourmarket.ai, so an
 * auth CTA is a plain RELATIVE link. The OAuth PKCE round-trip starts
 * and finishes on the same (current) origin, so there is no cross-host
 * cookie seam and no host upgrade is needed. The former host-upgrade
 * helper that pinned CTAs to the app subdomain is intentionally gone —
 * do not reintroduce it (see lib/guards/single-domain-origin.test.ts).
 *
 * Plain <a> (not the SPA Link): login is an auth boundary and a full
 * navigation keeps the auth pages outside the marketing SPA state.
 */
import type { ReactNode } from "react";

export function AuthCtaLink({
  /** Locale-prefixed internal path, e.g. "/lt/auth/login". */
  relPath,
  className,
  children,
}: {
  relPath: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={relPath} className={className} data-testid="auth-cta-link">
      {children}
    </a>
  );
}
