"use client";

import { useEffect, useState, type ReactNode } from "react";
import { preferAppHostHref } from "@/lib/domain/canonical";

/**
 * Auth call-to-action link (login / signup) for the PUBLIC marketing nav.
 *
 * Renders an SSR-safe, locale-prefixed RELATIVE href by default (works with no
 * JS, on the app host, and in local dev). On the client it upgrades the href to
 * the canonical app origin ONLY when the page is served on a marketing host
 * (apex / www / vercel alias), so the OAuth round-trip starts and finishes on
 * the same app origin — keeping the PKCE `code_verifier` cookie valid. See
 * `preferAppHostHref`. Plain <a> (not the SPA Link) because crossing to the app
 * host is a full navigation and login is an auth boundary anyway.
 */
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
  const [href, setHref] = useState(relPath);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHref(preferAppHostHref(window.location.host, relPath));
  }, [relPath]);

  return (
    <a href={href} className={className} data-testid="auth-cta-link">
      {children}
    </a>
  );
}
