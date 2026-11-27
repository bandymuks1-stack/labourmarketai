"use client";

/**
 * The public header's Sign in / Sign up (`site-nav.tsx`). On the worker
 * intake they carry the profile builder as `next`, like the intake's own
 * links, so sign-up from the header binds what was typed there and returns to
 * the builder (`lib/marketing/worker-profile-door.ts`). Everywhere else the
 * link is exactly `relPath`. Rendered through the one AuthCtaLink.
 */
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { headerAuthPathFor } from "@/lib/marketing/worker-profile-door";

export function HeaderAuthCtaLink({
  relPath,
  className,
  children,
}: {
  /** Locale-prefixed internal path, e.g. "/lt/auth/login". */
  relPath: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <AuthCtaLink relPath={headerAuthPathFor(relPath, pathname)} className={className}>
      {children}
    </AuthCtaLink>
  );
}
