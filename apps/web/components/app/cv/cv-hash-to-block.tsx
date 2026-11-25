"use client";

import { useEffect } from "react";

/**
 * An older link to a CV section (`/cv#cv-work-history`, a bookmark, a
 * notification, a chat answer) carries only the section's anchor. Since the
 * CV is split into blocks (decision 0034), that section can sit in a block
 * that is not the one on screen. When the anchor's section is inside a hidden
 * block, open that block — same address plus `tab` — and keep the anchor, so
 * the link still lands on what it named. Nothing renders.
 */
export function CvHashToBlock({ active }: { readonly active: string }) {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const block = target?.closest<HTMLElement>("[data-cv-block]")?.dataset.cvBlock;
      if (!block || block === active) return;
      const url = new URL(window.location.href);
      url.searchParams.set("tab", block);
      window.location.replace(url.toString());
    };
    open();
    // An in-page anchor clicked after load ("#cv-proof" inside Experience)
    // changes only the hash: follow it into the block that holds it.
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [active]);
  return null;
}
