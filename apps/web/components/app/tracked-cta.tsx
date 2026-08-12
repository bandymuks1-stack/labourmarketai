"use client";

import { type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { trackFunnel } from "@/lib/telemetry/task";
import { getFirstTouchAttribution } from "@/lib/telemetry/attribution";

/**
 * A locale-aware `Link` (from `@/lib/i18n/navigation`) that fires the public
 * `cta_clicked` funnel event on click (Pre-Advertising Launch Readiness v1).
 *
 * Marketing pages are server components using the locale-aware `Link`, so a
 * plain `TrackedLink` (which wraps `next/link`) would lose locale prefixing.
 * This wrapper keeps locale routing intact while attaching the click signal
 * and first-touch campaign attribution — fire-and-forget, never blocks nav.
 */
type LocaleLinkProps = ComponentProps<typeof Link>;

export function TrackedCta({
  ctaId,
  audience,
  onClick,
  children,
  ...rest
}: LocaleLinkProps & {
  ctaId: string;
  audience?: string;
  children: ReactNode;
}) {
  return (
    <Link
      {...rest}
      // The funnel id, in the DOM. `ctaId` already names this CTA for
      // telemetry; exposing it makes the same CTA addressable to a browser
      // test without inventing a parallel testid vocabulary or matching on
      // translated label text.
      data-cta-id={ctaId}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        trackFunnel(FUNNEL_EVENTS.ctaClicked, {
          cta_id: ctaId,
          ...(audience ? { audience } : {}),
          ...getFirstTouchAttribution(),
        });
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
