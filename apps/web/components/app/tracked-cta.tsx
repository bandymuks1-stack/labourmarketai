"use client";

import { type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { trackFunnel } from "@/lib/telemetry/task";
import { getFirstTouchAttribution } from "@/lib/telemetry/attribution";
import { useActivationSignupHref } from "@/components/app/use-activation-signup-href";

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
  href,
  ...rest
}: LocaleLinkProps & {
  ctaId: string;
  audience?: string;
  children: ReactNode;
}) {
  // A visit that arrived through the inbound-worker campaign gets the
  // activation signup URL (campaign + next-step carried in the URL itself);
  // every other CTA and visit keeps its own href unchanged.
  const resolvedHref = useActivationSignupHref(href);
  return (
    <Link
      {...rest}
      href={resolvedHref as typeof href}
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
