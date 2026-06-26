"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Navigation pending indicator (production-trust-bugs-p0, issue E).
 *
 * Owner production finding: tapping a nav item sometimes "feels slow or like
 * nothing happened" because there was no feedback during the route transition.
 * This renders a small spinner ONLY while the parent `<Link>`'s navigation is
 * actually in flight (`useLinkStatus().pending`), so the feedback is honest —
 * it is never shown for an instant/cached transition. It must be rendered as a
 * descendant of a `next/link` `<Link>` (next-intl's `Link` wraps it), which all
 * dashboard nav items are.
 */
export function NavLinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      role="status"
      aria-label="Loading"
      data-testid="nav-link-pending"
      className={cn(
        "inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent align-middle",
        className,
      )}
    />
  );
}
