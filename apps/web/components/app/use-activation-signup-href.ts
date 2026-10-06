"use client";

import { useEffect, useState } from "react";

import { buildActivationSignupHref } from "@/lib/auth/worker-activation";

/**
 * The signup `href` for THIS visit.
 *
 * Server-rendered markup (and the first client render) always carry the plain
 * `/auth/signup`, so hydration never mismatches and a visitor without the
 * campaign sees no change at all. After mount, a visit that arrived with a
 * valid inbound-worker campaign (`utm_source=nonstop` + `utm_content=
 * ns-inbound-<12 hex>`) gets the activation signup URL instead: the campaign
 * travels in the URL, so it survives a different browser or device, a cleared
 * `localStorage`, and an earlier organic first touch.
 *
 * Only the exact `/auth/signup` is rewritten; a CTA that already chose its own
 * destination (`?next=…`) is left alone.
 */
export function useActivationSignupHref<T>(href: T): T | string {
  const [override, setOverride] = useState<string | null>(null);
  useEffect(() => {
    if (href !== "/auth/signup") return;
    try {
      setOverride(buildActivationSignupHref(window.location.search));
    } catch {
      setOverride(null);
    }
  }, [href]);
  return override ?? href;
}
