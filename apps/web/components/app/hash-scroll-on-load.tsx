"use client";

import { useEffect } from "react";

/**
 * Scrolls `id` into view once that element actually exists. Retries across
 * frames (bounded — ~1s at 60fps; an id naming nothing is a dead link, not a
 * reason to keep a callback alive for the life of the page). Returns the
 * cleanup.
 */
function scrollWhenPresent(
  id: string,
  options: ScrollIntoViewOptions,
  onlyIfOffscreen: boolean,
): () => void {
  let raf = 0;
  let frames = 0;
  const attempt = () => {
    const el = document.getElementById(id);
    if (el) {
      if (onlyIfOffscreen) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.bottom <= window.innerHeight) return;
      }
      el.scrollIntoView(options);
      return;
    }
    if (frames++ < 60) raf = requestAnimationFrame(attempt);
  };
  attempt();
  return () => cancelAnimationFrame(raf);
}

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
    let cancel = () => {};

    const scrollToHash = () => {
      const hash = window.location.hash;
      if (hash.length < 2) return;
      cancel();
      cancel = scrollWhenPresent(decodeURIComponent(hash.slice(1)), { block: "start" }, false);
    };

    // Only when the browser has NOT already positioned the page itself.
    if (window.scrollY === 0) scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      cancel();
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);
  return null;
}

/**
 * Brings the RESULT of a just-submitted form to where the person is.
 *
 * Render it next to an outcome notice, keyed by something that changes on
 * every server render (the page passes a per-request nonce), so each
 * submission remounts it and it runs again — even when two submissions in a
 * row land on the byte-identical `?outcome=…#section` URL.
 *
 * Unlike `HashScrollOnLoad` it does not defer to the page's current scroll
 * position: after a server-action redirect the App Router may leave the page
 * at the top, which is exactly the failure this exists for. Measured on
 * `/dashboard/company/planning` at 390px (UX review 2026-10-24): after
 * "Suplanuoti darbą" the page sat at y=0 while the confirmation and the new
 * rota entry were ~3,100px below. It does nothing when the notice is already
 * on screen, so it never yanks a page the person is reading.
 */
export function RevealOnMount({ targetId }: { readonly targetId: string }) {
  useEffect(() => scrollWhenPresent(targetId, { block: "center" }, true), [targetId]);
  return null;
}
