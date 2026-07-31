"use server";

import "server-only";

import {
  loadProjectEvaluation,
  loadProjectResults,
  type ProjectEvaluation,
  type ProjectResults,
} from "./project-results";
import { parseGeography } from "./geography-selection";

/**
 * The project result's server entrypoints, for the client ResultPanel.
 *
 * Thin on purpose — the same shape as `market-result-actions.ts`: they parse
 * the untrusted token, delegate, and return. All authorization is RLS on the
 * underlying rows.
 *
 * THE TOKEN IS PARSED HERE, NOT ON THE CLIENT. A server action's arguments are
 * a public entrypoint, so the `?geo=` string is re-validated on this side even
 * though the panel already validated it. A token that does not parse yields an
 * explicit refusal rather than a query built from a half-understood place.
 */

export async function loadProjectResultsAction(geoToken: string): Promise<ProjectResults> {
  const geography = parseGeography(geoToken);
  if (!geography) {
    return {
      state: "error",
      // A token that does not parse has no place to report. `ZZ` is not a
      // selection anyone can act on; the state is what the caller reads.
      geography: { countryCode: "ZZ", precision: "country" },
      geographyLabel: "",
      rows: [],
      errorCode: "invalid_geography_token",
    };
  }
  return loadProjectResults({ geography, status: "open" });
}

export async function loadProjectEvaluationAction(
  geoToken: string,
  projectId: string,
): Promise<ProjectEvaluation> {
  const geography = parseGeography(geoToken);
  if (!geography) {
    return {
      state: "error",
      geography: { countryCode: "ZZ", precision: "country" },
      geographyLabel: "",
      demands: [],
      skillSlugs: [],
      unresolvedSkillCount: 0,
      errorCode: "invalid_geography_token",
    };
  }
  return loadProjectEvaluation({ geography, projectId });
}
