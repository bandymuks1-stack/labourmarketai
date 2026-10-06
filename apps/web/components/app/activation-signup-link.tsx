"use client";

import { type ComponentProps } from "react";

import { useActivationSignupHref } from "@/components/app/use-activation-signup-href";
import { Link } from "@/lib/i18n/navigation";

/**
 * A plain locale-aware signup `Link` that, for a visit that arrived through
 * the inbound-worker campaign, points at the activation signup URL
 * (`useActivationSignupHref`). No telemetry of its own — it exists so a
 * server-component CTA (the closing CTA band) can carry the campaign without
 * becoming a tracked CTA.
 */
export function ActivationSignupLink({
  href,
  ...rest
}: ComponentProps<typeof Link>) {
  const resolved = useActivationSignupHref(href);
  return <Link {...rest} href={resolved as typeof href} />;
}
