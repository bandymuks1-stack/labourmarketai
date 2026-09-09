import "server-only";

import { loadCanonicalDemand } from "@/lib/demand/canonical-demand";
import { dedupeCanonicalDemand } from "@/lib/demand/canonical-demand-model";
import { resolveCity } from "@/lib/location/city-coordinates";
import { geographyLabel, type GeographySelection } from "./geography-selection";
import {
  groupIntoDemandUnits,
  type EvaluationDemand,
  type ProjectEvaluation,
  type ProjectResults,
} from "./project-results-model";

/**
 * THE MARKET DRILLDOWN — which demand creates the intensity under the marker.
 *
 * ONE loader for both depths (the list and the evaluation). They read the SAME
 * rows through the SAME filter, because two readers would eventually disagree
 * and the person would be told a unit matched in the list and did not in the
 * detail.
 *
 * THE DEFECT THIS CLOSES (2026-09-05). This module used to read `job_demands`
 * directly. W10 slice 4 moved the MARKER (`market-result.ts`) onto the ONE
 * canonical demand read and consolidation slice 1 (2026-08-17) then deleted the
 * dead `job_demands` leg from that read — but the drilldown behind the marker
 * was never migrated with it. `job_demands` has held 0 rows in production for
 * its whole life and nothing a customer touches writes it, so every marker the
 * canonical read produced from real `customer_requests` demand opened onto an
 * empty list, and depth 2 — the evaluation, and the continuation to people —
 * was unreachable for every real user. The header of this file even claimed the
 * two surfaces read the identical rows, which had silently stopped being true.
 *
 * SAME ROWS AS THE MARKER, NOW LITERALLY. Both call `loadCanonicalDemand()`,
 * both dedupe first, and both apply the same geography rule
 * (`projectMatchesGeography`, which `market-result.ts` aggregates by). The
 * intensity under the marker and the units in this list are the same rows by
 * construction. No new table, no migration, no second demand model.
 *
 * AUTHORIZATION IS INHERITED, NEVER WIDENED. The canonical read composes only
 * paths the caller already has: the worker-gated SECURITY DEFINER RPC
 * `list_open_demand_for_workers` (closed column whitelist) and the caller's OWN
 * `customer_requests` under `customer_requests_select` (`profile_id =
 * auth.uid()`, with the employer-workspace gate). There is no service-role
 * client here, no RPC of our own and no `security definer` bypass. Tenant
 * isolation is exactly the tables' isolation: organisation A cannot reach
 * organisation B's private need through this module for the same reason it
 * cannot reach it through the table.
 *
 * PROVENANCE SURVIVES. Every row carries `unitKind` and the canonical id of the
 * store it came from, so the depth-2 address is a real `customer_requests.id`
 * and never a synthesised key.
 *
 * ERROR IS NOT EMPTY. A failed read returns `state: "error"`, never an empty
 * list and never a fixture row. "There is no demand here" is a claim about the
 * market; "we could not read the market" is a claim about us, and showing the
 * first when the second is true is the silent fallback this platform bans.
 *
 * THE `job_demands → projects` SHAPE IS FROZEN, NOT FORGOTTEN. `groupIntoProjects`
 * and `DemandJoinRow` stay in `project-results-model.ts` as the vocabulary for
 * project-scoped demand — the same way `canonical-demand-model.ts` keeps its
 * `job_demand` source member. The day a source writes project-scoped needs, it
 * declares itself in the canonical read (its documented extension point) and
 * this loader shapes it without a second reader appearing here.
 *
 * THE SHAPING LIVES IN `project-results-model.ts` — pure, and unit-tested
 * there. This half only reads.
 */

export type {
  DemandJoinRow,
  DemandUnitKind,
  EvaluationDemand,
  MatchReason,
  MissingField,
  PeopleContinuationContext,
  ProjectEvaluation,
  ProjectResultRow,
  ProjectResults,
  ProjectResultsState,
} from "./project-results-model";
export {
  buildPeopleContinuation,
  COMPLETENESS_FIELDS,
  DEMAND_SOURCE,
} from "./project-results-model";

export interface LoadProjectResultsInput {
  readonly geography: GeographySelection;
  /** Kept for the call site's benefit: only OPEN demand is a market answer.
   *  The canonical read enforces it at the source (`status = 'submitted'` on
   *  `customer_requests`, and the worker RPC's own gate), so this loader has no
   *  status filter of its own to drift out of step with it. */
  readonly status?: "open";
}

/** The one place the coordinate table meets the filter. */
const cityResolves = (country: string, city: string) =>
  resolveCity(country, city) !== null;

export async function loadProjectResults(
  input: LoadProjectResultsInput,
): Promise<ProjectResults> {
  const geography = input.geography;
  const label = geographyLabel(geography);

  // The data has no subdivision column, so a region selection cannot be
  // answered at all. Saying so is different from saying "nothing here", and the
  // difference matters: one is a gap in us, the other a fact about the market.
  if (geography.precision === "region") {
    return {
      state: "unsupported_precision",
      geography,
      geographyLabel: label,
      rows: [],
    };
  }

  const canonical = await loadCanonicalDemand();
  if (canonical.state === "error") {
    // Never a driver message: it can carry schema and connection detail. The
    // caller renders a stated failure, not this string.
    return {
      state: "error",
      geography,
      geographyLabel: label,
      rows: [],
      errorCode: "project_query_failed",
    };
  }

  // Dedupe FIRST, exactly as the marker does, so one demand is one unit even
  // when two authorized branches returned it.
  const rows = groupIntoDemandUnits(
    dedupeCanonicalDemand(canonical.rows),
    geography,
    cityResolves,
  );

  return {
    state: rows.length === 0 ? "empty" : "ok",
    geography,
    geographyLabel: label,
    rows,
  };
}

export interface LoadProjectEvaluationInput {
  /** The unit's canonical id — see `ProjectResultRow.projectId`. */
  readonly projectId: string;
  readonly geography: GeographySelection;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadProjectEvaluation(
  input: LoadProjectEvaluationInput,
): Promise<ProjectEvaluation> {
  const { projectId, geography } = input;
  const base = {
    geography,
    geographyLabel: geographyLabel(geography),
    demands: [] as readonly EvaluationDemand[],
    skillSlugs: [] as readonly string[],
    unresolvedSkillCount: 0,
  };

  if (geography.precision === "region") {
    return { ...base, state: "unsupported_precision" };
  }
  // The id comes from the URL. A non-uuid never reaches a read.
  if (!UUID.test(projectId)) return { ...base, state: "not_found" };

  const canonical = await loadCanonicalDemand();
  if (canonical.state === "error") {
    return {
      ...base,
      state: "error",
      errorCode: "project_evaluation_query_failed",
    };
  }

  // The SAME rows, the SAME dedupe and the SAME geography filter as the list. A
  // unit that is not in the selected place must not open from a hand-typed URL
  // either, and one the caller may not read is simply not in the list.
  const rows = groupIntoDemandUnits(
    dedupeCanonicalDemand(canonical.rows),
    geography,
    cityResolves,
  );
  const row = rows.find((r) => r.projectId === projectId);
  if (!row) return { ...base, state: "not_found" };

  // A canonical need IS one need. The evaluation lists it as itself rather than
  // splitting it into sub-needs it does not have; a project unit with several
  // open needs would list each, which is why this stays a list of one and not a
  // collapsed summary.
  const demands: EvaluationDemand[] = [
    {
      demandId: row.projectId,
      roleTitle: row.roles[0] ?? null,
      // 0 here means "not stated" (it is in `row.missing`), and printing a 0
      // headcount as a number would be exactly the invented default the
      // canonical model refuses.
      headcount: row.missing.includes("headcount") ? null : row.openHeadcount,
      startDate: row.startDate,
      skillSlugs: [],
    },
  ];

  // The canonical contract carries no skill ids for a need, so there is nothing
  // to resolve and nothing unresolved. The absence is already declared in
  // `row.missing` as `requiredSkills`; a zero here is the honest count, not a
  // swallowed lookup failure.
  return {
    ...base,
    state: "ok",
    row,
    demands,
    skillSlugs: [],
    unresolvedSkillCount: 0,
  };
}
