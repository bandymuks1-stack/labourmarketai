"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { isResultKind, type ResultKind } from "@/lib/conversation/result-registry";
import {
  parseGeography,
  serializeGeography,
  type GeographySelection,
} from "@/lib/market-map/geography-selection";

/**
 * The `?result=` deep link — the workspace's result state, in the URL.
 *
 * WHY THE URL AND NOT WORLD STATE. `AI_OPERATOR_ACTIONS` in
 * `lib/product-gate/world-state.ts` is an OWNER LOCK with exactly six verbs
 * (`change_world_state`, `update_map`, `open_object`, `close_object`,
 * `show_information`, `return_to_conversation`). Adding an `open_result` verb
 * would edit that lock, which is an owner decision, not an implementation
 * detail — so this work does not touch it. See the delivery notes: promoting
 * results into the operator alphabet is listed as an open owner decision.
 *
 * The URL is the honest alternative and it buys something the lock would not:
 * a result survives reload and can be shared, which is what the blueprint's
 * deep-link requirement actually asked for.
 *
 * GOAL 3 ADDS THE DEPTH. The market result is no longer one screen but three —
 * market, the projects behind a place, one project's evaluation — and all three
 * are the SAME result at different depths, so they live in the SAME state:
 *
 *   ?result=market                                  the map
 *   ?result=market&geo=NL:city:Rotterdam            the projects there
 *   ?result=market&geo=NL:city:Rotterdam&project=…  that project, evaluated
 *
 * Depth in the query string is what makes refresh and back work without a
 * router, a modal or a second screen: every step is a real, restorable address.
 * `geo` is VALIDATED here (see `parseGeography`), so a hand-typed token can
 * never reach a loader as a half-understood place.
 *
 * NOT NAVIGATION. `replace` with `scroll: false` on the SAME route only edits
 * the query string — no page transition, no remount of the conversation. The
 * Context Panel itself stays completely free of routing (its guard forbids
 * `useRouter` / `<Link>`), which is why this hook lives out here in the
 * workspace layer and reaches the panel as plain props.
 *
 * ONE EXCEPTION, DELIBERATE: going DEEPER pushes. Selecting a place and then a
 * project are steps the person expects the browser Back button to undo, and
 * `replace` would make Back leave the workspace entirely. Closing or stepping
 * back up still replaces, so the history never fills with the same address.
 */
export function useResultParam(): {
  /** The valid result kind in the URL, or null. An unknown value is ignored. */
  result: ResultKind | null;
  /** The validated geography, or null. An invalid token is ignored entirely. */
  geography: GeographySelection | null;
  /** The raw `geo` token — what the server action is handed, re-validated
   *  there. Null whenever `geography` is null. */
  geoToken: string | null;
  /** The selected project id, or null. Only meaningful with a geography. */
  projectId: string | null;
  /** Show a result — replaces the query, never pushes a new page. */
  openResult: (kind: ResultKind) => void;
  /** Drill into a place. Pushes, so Back returns to the market. */
  selectGeography: (g: GeographySelection) => void;
  /** Drill into a project. Pushes, so Back returns to the project list. */
  selectProject: (projectId: string) => void;
  /** Step back up one depth — project → place → market. Replaces. */
  clearProject: () => void;
  clearGeography: () => void;
  /** Drop the result entirely — the conversation keeps its summary card. */
  closeResult: () => void;
} {
  const router = useRouter();
  const params = useSearchParams();

  /**
   * `useSearchParams()` alone is not sufficient here.
   *
   * In the App Router a client component reading it outside a <Suspense>
   * boundary renders once with EMPTY params — and this hook lives inside the
   * conversation, which is mounted deep in the dashboard tree. Observed
   * directly: `/lt/dashboard?result=market` mounted the panel in `work_context`
   * mode because the hook saw no `result`, so the result silently never opened.
   *
   * THE LIVE LOCATION IS THE SOURCE OF TRUTH ONCE MOUNTED, and `useSearchParams`
   * is one of the two things that tell us to re-read it. The other is
   * `popstate`, and leaving it out was a real defect found in the authenticated
   * browser: after a RELOAD at the project depth the hook is in the
   * empty-params state above, so `href` decides — and `href` was only refreshed
   * when the params object changed identity. Browser Back fires `popstate`
   * without necessarily doing that, so the URL said "project list" while the
   * panel still showed the evaluation. Back appeared to do nothing.
   *
   * Reading `window.location` is safe in both cases: the History API has
   * already updated it by the time `popstate` fires, and Next commits the URL
   * before the params object changes.
   */
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setHref(window.location.search);
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [params]);

  const readParam = useCallback(
    (key: string): string | null =>
      // `href === null` only on the first paint, before the effect has run —
      // there `params` is the best available answer. Afterwards the live
      // location wins outright, so the two can never disagree about depth.
      href !== null
        ? new URLSearchParams(href).get(key)
        : (params?.get(key) ?? null),
    [params, href],
  );

  // An invented or stale `?result=` value must never render. Validating here
  // means every consumer receives either a real kind or null.
  const raw = readParam("result");
  const result = useMemo<ResultKind | null>(
    () => (isResultKind(raw) ? raw : null),
    [raw],
  );

  const rawGeo = readParam("geo");
  const geography = useMemo(() => parseGeography(rawGeo), [rawGeo]);
  // Re-serialize rather than pass the raw token through: what the loader is
  // asked for is then exactly what was validated, in canonical form.
  const geoToken = useMemo(
    () => (geography ? serializeGeography(geography) : null),
    [geography],
  );

  const rawProject = readParam("project");
  const projectId = useMemo(() => {
    if (!geography) return null;
    return typeof rawProject === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawProject)
      ? rawProject
      : null;
  }, [rawProject, geography]);

  const write = useCallback(
    (patch: Record<string, string | null>, mode: "push" | "replace") => {
      const q = new URLSearchParams(params?.toString() ?? href ?? "");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) q.delete(key);
        else q.set(key, value);
      }
      const qs = q.toString();
      const url = qs ? `?${qs}` : "?";
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, href, router],
  );

  return {
    result,
    geography,
    geoToken,
    projectId,
    // Opening a result from scratch clears any stale depth: a market result
    // that reopened straight into last week's project would be showing an
    // answer nobody asked for.
    openResult: useCallback(
      (kind: ResultKind) =>
        write({ result: kind, geo: null, project: null }, "replace"),
      [write],
    ),
    selectGeography: useCallback(
      (g: GeographySelection) =>
        write({ geo: serializeGeography(g), project: null }, "push"),
      [write],
    ),
    selectProject: useCallback(
      (id: string) => write({ project: id }, "push"),
      [write],
    ),
    clearProject: useCallback(() => write({ project: null }, "replace"), [write]),
    clearGeography: useCallback(
      () => write({ geo: null, project: null }, "replace"),
      [write],
    ),
    closeResult: useCallback(
      () => write({ result: null, geo: null, project: null }, "replace"),
      [write],
    ),
  };
}
