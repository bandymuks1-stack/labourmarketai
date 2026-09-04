"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { isResultKind, type ResultKind } from "@/lib/conversation/result-registry";
import { canonicalInteractionToken } from "@/lib/trust/experience-interaction-token";
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
/** The one uuid shape check the depth params share (`project`, `demand`). */
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  /**
   * W6 slice 3D — the `experiences` result's depth: which INTERACTION the
   * person is describing, as a validated `kind:uuid` token.
   *
   * Same idea as `geo`/`project` above: depth belongs in the query string so
   * refresh and Back work without a modal or a second screen. The token is
   * validated here (`parseInteractionToken`), so a hand-typed value never
   * reaches a loader as a half-understood interaction — and even a
   * well-formed one is only a REQUEST: the server re-derives participation,
   * completion, the subject and duplicate state before any form appears.
   */
  interactionToken: string | null;
  /**
   * W8 — the `candidates` result's depth: WHICH DEMAND the employer is hiring
   * for, as a validated uuid.
   *
   * Same rule as `project` above, and it is validated here for the same
   * reason: a hand-typed value must never reach a loader as a half-understood
   * demand. And like every other token in this hook, being well-formed buys
   * nothing — `runScouting` re-derives the company context and re-verifies
   * ownership of the row before any candidate is ranked.
   */
  demandId: string | null;
  /** Show a result — replaces the query, never pushes a new page. */
  openResult: (kind: ResultKind) => void;
  /** Drill into one demand's candidates. Pushes, so Back returns to the list. */
  selectDemand: (requestId: string) => void;
  /** W11 — open the PROJECT result at one project, in ONE push. Distinct from
   *  `selectProject`, which drills inside the market result and assumes a
   *  geography is already set. */
  openProjectResult: (projectId: string) => void;
  /** Step back up to the demand list. Replaces. */
  clearDemand: () => void;
  /** Drill into one interaction to describe it. Pushes, so Back returns to
   *  the list of experiences. */
  selectInteraction: (token: string) => void;
  /** Step back up out of the submit depth. Replaces. */
  clearInteraction: () => void;
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

  // W6 slice 3D — the experiences result's depth. Validated to canonical form
  // here, so an invented token is simply not depth at all.
  const rawInteraction = readParam("interaction");
  const interactionToken = useMemo(
    () => canonicalInteractionToken(rawInteraction),
    [rawInteraction],
  );

  const rawProject = readParam("project");
  const projectId = useMemo(() => {
    // TWO results carry a project depth, and they reach it differently.
    //
    // `market` drills map → place → project, so a project there is only
    // meaningful UNDER a geography: a `?project=` with no `?geo=` would be a
    // depth with no parent, and the drill-down would have nothing to step back
    // to. That guard stays exactly as it was.
    //
    // W11's `project` result addresses a project DIRECTLY — it is the whole
    // subject, not a leaf of a map — so it needs no geography. Same param, same
    // validation, because it is the same fact: which project.
    if (!geography && result !== "project") return null;
    return typeof rawProject === "string" && UUID_RX.test(rawProject)
      ? rawProject
      : null;
  }, [rawProject, geography, result]);

  // W8 — the candidates result's depth. Unlike `project` it has no parent
  // token to depend on: a demand is addressable on its own, so the only gate
  // is the shape. Anything else is simply not depth at all, and the panel
  // renders the demand list.
  const rawDemand = readParam("demand");
  const demandId = useMemo(
    () => (typeof rawDemand === "string" && UUID_RX.test(rawDemand) ? rawDemand : null),
    [rawDemand],
  );

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
    interactionToken,
    demandId,
    // Opening a result from scratch clears any stale depth: a market result
    // that reopened straight into last week's project would be showing an
    // answer nobody asked for — and an experiences result that reopened onto
    // last week's interaction would be inviting a description nobody asked
    // for, which is worse.
    // …and a candidates result that reopened onto last month's closed demand
    // would be answering a question nobody asked, for the same reason.
    openResult: useCallback(
      (kind: ResultKind) =>
        write(
          { result: kind, geo: null, project: null, interaction: null, demand: null },
          "replace",
        ),
      [write],
    ),
    // Going deeper pushes — the same rule as a place, a project or an
    // interaction. ONE write, for the same reason `selectInteraction` uses one:
    // two calls would both read the not-yet-updated query string.
    selectDemand: useCallback(
      (requestId: string) =>
        write(
          {
            result: "candidates",
            geo: null,
            project: null,
            interaction: null,
            demand: requestId,
          },
          "push",
        ),
      [write],
    ),
    clearDemand: useCallback(() => write({ demand: null }, "replace"), [write]),
    // ONE write, for the same reason `selectDemand` uses one: two calls would
    // both read the not-yet-updated query string and the second would clobber
    // the first, opening the panel at the wrong depth.
    // Re-opening the SAME project after a write (an assignment just made) must
    // show the state the write produced, not the panel's cached answer — the
    // prod walk 2026-09-04 read "Priskirta projektui." beside "Priskirta 0".
    // A fresh `pr` token makes the address differ, so the detail re-reads.
    openProjectResult: useCallback(
      (projectId: string) =>
        write(
          {
            result: "project",
            geo: null,
            interaction: null,
            demand: null,
            project: projectId,
            pr: Date.now().toString(36),
          },
          "push",
        ),
      [write],
    ),
    // Going DEEPER pushes, like selecting a place or a project: opening the
    // form for one interaction is a step the person expects Back to undo.
    //
    // ONE write, not `openResult` followed by a second call: both would read
    // the same not-yet-updated query string, so the second would clobber the
    // first and the result would open at the wrong depth. The address is
    // assembled once and pushed once.
    selectInteraction: useCallback(
      (token: string) =>
        write(
          { result: "experiences", geo: null, project: null, interaction: token },
          "push",
        ),
      [write],
    ),
    clearInteraction: useCallback(
      () => write({ interaction: null }, "replace"),
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
      () =>
        write(
          { result: null, geo: null, project: null, interaction: null, demand: null },
          "replace",
        ),
      [write],
    ),
  };
}
