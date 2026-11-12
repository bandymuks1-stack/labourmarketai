"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * The page's query string, read WITHOUT `useSearchParams()` (speed P0,
 * 2026-11-12).
 *
 * `useSearchParams()` on a prerendered page makes Next leave the whole
 * component out of the server HTML. The login form read four optional
 * parameters that way, so the page arrived with no form at all: the form
 * appeared only after every script had loaded and run (6.9 s in the mobile
 * lab), and pushed the consent banner down when it did (layout shift 0.154).
 *
 * Here the server render and the first client render see an EMPTY query, so
 * the form is in the HTML and hydration matches it; React then re-renders
 * with the real query before the person can act. The parameters only add to
 * the form (a notice, a return path), so the empty first render is the plain
 * form, never a wrong one.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

const readClient = (): string => window.location.search;
const readServer = (): string => "";

export function useUrlQuery(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, readClient, readServer);
  return useMemo(() => new URLSearchParams(search), [search]);
}
