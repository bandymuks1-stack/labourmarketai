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
 */
export function DetailsHashOpener({ targetId }: { targetId: string }) {
  useEffect(() => {
    const applyHash = () => {
      if (window.location.hash !== `#${targetId}`) return;
      const el = document.getElementById(targetId);
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true;
        requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [targetId]);
  return null;
}
