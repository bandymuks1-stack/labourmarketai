"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * WHICH TAB a URL hash belongs to — or null when the hash names nothing this
 * page splits into tabs, or the reader is already on that tab. Pure, so the
 * decision can be pinned without a browser.
 */
export function tabForHash(
  hash: string,
  tabByAnchor: Readonly<Record<string, string>>,
  current: string,
): string | null {
  if (!hash || hash.length < 2) return null;
  const tab = tabByAnchor[decodeURIComponent(hash.slice(1))];
  if (!tab || tab === current) return null;
  return tab;
}

/**
 * Keeps `#anchor` deep links alive on a page split into `?tab=` blocks
 * (decision 0034). A link written before the split — `/dashboard/profile#capabilities`
 * — names a section that now renders only on its own tab. On load, and on
 * every in-page hash change, this moves the reader to that tab with the same
 * query and the same hash, so the section's own opener and scroll still run.
 */
export function HashTabRedirect({
  tabByAnchor,
  current,
  param = "tab",
}: {
  tabByAnchor: Readonly<Record<string, string>>;
  current: string;
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash;
      const tab = tabForHash(hash, tabByAnchor, current);
      if (!tab) return;
      const query = new URLSearchParams(window.location.search);
      query.set(param, tab);
      router.replace(`${pathname}?${query.toString()}${hash}`);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [router, pathname, tabByAnchor, current, param]);
  return null;
}
