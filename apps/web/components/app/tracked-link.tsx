"use client";

import Link from "next/link";
import { type ComponentProps, type MouseEvent } from "react";
import { trackFunnel } from "@/lib/telemetry/task";
import type {
  FunnelEventName,
  FunnelMetadata,
} from "@/lib/telemetry/funnel-events";

/**
 * A `next/link` that fires an activation-funnel "clicked" event (P0-A) on
 * click, then behaves exactly like a normal Link. Fire-and-forget — the
 * navigation is never blocked or delayed by telemetry. The caller keeps
 * full control of `href` (and its typed-route cast), `className`, children,
 * etc.; only `event`/`eventMetadata` are added.
 */
type LinkProps = ComponentProps<typeof Link>;

export function TrackedLink({
  event,
  eventMetadata,
  onClick,
  ...rest
}: LinkProps & { event: FunnelEventName; eventMetadata?: FunnelMetadata }) {
  return (
    <Link
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        trackFunnel(event, eventMetadata);
        onClick?.(e);
      }}
    />
  );
}
