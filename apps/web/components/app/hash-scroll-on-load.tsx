"use client";

import { useEffect } from "react";

/**
 * Scrolls to the URL's hash target once that target actually exists.
 *
 * A browser scrolls to a hash on load, but only if the element is in the
 * document at that moment. On a streamed App Router page it often is not, and
 * a server action that finishes with `redirect("…?x=y#section")` gives the
 * browser no load event to act on at all — so the hash is simply ignored and
 * the reader is left at the top of the page.
 *
 * Measured on `/dashboard/documents` (2026-08-28): the training save action
 * redirects to `?trn=…#training`, and four seconds after that navigation
 * `window.scrollY` was still 0 with `#training` at y=1577. The link was dead;
 * it only looked alive while the section happened to sit above the fold.
 *
 * This retries across frames until the element appears (bounded — it gives up
 * rather than spinning), and re-runs on `hashchange` so a redirect back to the
 * same route still lands. It never fights a scroll the browser already made.
 */
export function HashScrollOnLoad() {
  useEffect(() => {
    let raf = 0;

    const scrollToHash = () => {
      const hash = window.location.hash;
      if (hash.length < 2) return;
      const id = decodeURIComponent(hash.slice(1));
      let frames = 0;
      const attempt = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ block: "start" });
          return;
        }
        // ~1s at 60fps. A hash naming nothing is a dead link, not a reason to
        // keep a callback alive for the life of the page.
        if (frames++ < 60) raf = requestAnimationFrame(attempt);
      };
      attempt();
    };

    // Only when the browser has NOT already positioned the page itself.
    if (window.scrollY === 0) scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);
  return null;
}
