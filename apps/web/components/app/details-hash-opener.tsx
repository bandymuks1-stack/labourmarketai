"use client";

import { useEffect } from "react";

/**
 * Opens a server-rendered `<details id=…>` when the URL hash targets it.
 *
 * Browsers scroll to a hash target but never auto-open a collapsed
 * `<details>`, so deep links like /dashboard/profile#capabilities landed on a
 * thin closed summary bar (root-cause audit PR4 — six senders link that
 * anchor). Mount this next to the disclosure; it opens it on initial
 * navigation and on later in-page hash changes, then re-scrolls so the
 * now-expanded section is positioned correctly.
 *
 * The hash may name the disclosure itself OR any element inside it. The
 * nested case matters as soon as a disclosure wraps sections that already had
 * their own deep links (`#cv-availability`, `#cv-languages`): a link to a
 * section is a link to the thing the reader wants to see, and a closed bar is
 * not that thing.
 */
export function DetailsHashOpener({ targetId }: { targetId: string }) {
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) return;
      const el = document.getElementById(targetId);
      if (!(el instanceof HTMLDetailsElement)) return;
      // The hash may target the disclosure ITSELF or a section INSIDE it. The
      // second case is not a nicety: `#cv-availability` is a readiness-step
      // deep link from the profile hub, and it now lives inside the CV-details
      // disclosure — without this it would land on a closed summary bar, the
      // exact defect this component exists to prevent.
      const target =
        hash === `#${targetId}`
          ? el
          : document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target || (target !== el && !el.contains(target))) return;
      if (!el.open) el.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [targetId]);
  return null;
}
