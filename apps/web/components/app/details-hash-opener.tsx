"use client";

import { useEffect } from "react";

/**
 * WHICH ELEMENT a URL hash asks one disclosure to reveal — or null when the
 * hash is not this disclosure's business. Pure, so the decision the opener
 * makes can be proven against a page's real nesting without a browser
 * (`lib/guards/profile-summary-first.test.ts`).
 *
 * The hash may name the disclosure ITSELF or ANY element inside it; a hash
 * naming an element OUTSIDE it answers null (the negative control — a
 * disclosure must never open for a link that is aimed somewhere else).
 */
export function disclosureHashTarget<T>(
  hash: string,
  targetId: string,
  disclosure: T,
  byId: (id: string) => T | null,
  contains: (outer: T, inner: T) => boolean,
): T | null {
  if (!hash || hash.length < 2) return null;
  const target =
    hash === `#${targetId}` ? disclosure : byId(decodeURIComponent(hash.slice(1)));
  if (!target || (target !== disclosure && !contains(disclosure, target))) return null;
  return target;
}

/**
 * Opens a server-rendered `<details id=…>` when the URL hash targets it.
 *
 * Browsers scroll to a hash target but never auto-open a collapsed
 * `<details>`, so deep links like /dashboard/profile#capabilities landed on a
 * thin closed summary bar (root-cause audit PR4 — six senders link that
 * anchor). Mount this next to the disclosure; it opens it on initial
 * navigation, on later in-page hash changes and on every tap of a same-page
 * link aimed at it (including the same link tapped again after the person
 * closed the bar), then re-scrolls so the now-expanded section is positioned
 * correctly.
 *
 * The hash may name the disclosure itself OR any element inside it. The
 * nested case matters as soon as a disclosure wraps sections that already had
 * their own deep links (`#cv-availability`, `#cv-languages`): a link to a
 * section is a link to the thing the reader wants to see, and a closed bar is
 * not that thing.
 */
export function DetailsHashOpener({ targetId }: { targetId: string }) {
  useEffect(() => {
    const applyHash = (hash: string = window.location.hash) => {
      if (!hash || hash.length < 2) return;
      const el = document.getElementById(targetId);
      if (!(el instanceof HTMLDetailsElement)) return;
      // The hash may target the disclosure ITSELF or a section INSIDE it. The
      // second case is not a nicety: `#cv-availability` is a readiness-step
      // deep link from the profile hub, and it now lives inside the CV-details
      // disclosure — without this it would land on a closed summary bar, the
      // exact defect this component exists to prevent. (The first case is
      // `hash === \`#${targetId}\``, decided in `disclosureHashTarget`.)
      const target = disclosureHashTarget<HTMLElement>(
        hash,
        targetId,
        el,
        (id) => document.getElementById(id),
        (outer, inner) => outer.contains(inner),
      );
      if (!target) return;
      if (!el.open) el.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };
    applyHash();
    const onHashChange = () => applyHash();
    // THE SAME LINK, TAPPED AGAIN. `hashchange` fires only when the hash
    // CHANGES — a person who opened `#capabilities`, closed the bar and taps
    // the same link again changes nothing, and a Next `<Link>` hash
    // navigation goes through `history.pushState`, which never fires it at
    // all. Either way the bar would stay shut. The tap itself is the signal:
    // a plain left-click on a same-page link reads THAT link's hash, not the
    // (possibly unchanged) URL. `defaultPrevented` is not checked — the
    // client router prevents the default to navigate itself, and that is
    // exactly the tap this has to answer. A modified click (new tab/window)
    // and a link aimed at another page or frame are left alone.
    const onLinkClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || !link.hash) return;
      if (link.target && link.target !== "_self") return;
      if (link.origin !== window.location.origin || link.pathname !== window.location.pathname) return;
      applyHash(link.hash);
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onLinkClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onLinkClick);
    };
  }, [targetId]);
  return null;
}
