import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolveCity } from "@/lib/location/city-coordinates";
import { geographyLabel, type GeographySelection } from "./geography-selection";
import {
  groupIntoProjects,
  type DemandJoinRow,
  type EvaluationDemand,
  type ProjectEvaluation,
  type ProjectResults,
} from "./project-results-model";

/**
 * THE PROJECT RESULT — which projects create the demand under the marker.
 *
 * ONE loader for both depths of Goal 3 (the list and the evaluation). They read
 * the SAME rows through the SAME filter, because two readers would eventually
 * disagree and the person would be told a project matched in the list and did
 * not in the detail.
 *
 * SAME TABLES AS THE MARKET RESULT, ON PURPOSE. `market-result.ts` aggregates
 * open `job_demands` joined to the `projects` that carry their geography; this
 * reads the identical join and applies `projectMatchesGeography`, which mirrors
 * that aggregation exactly. So the headcount under the marker and the headcount
 * in the list are the same number by construction, not by coincidence. No new
 * table, no migration, no second project model.
 *
 * RLS AUTHORIZES. This runs as the signed-in user. For a worker that means
 * `projects.status = 'live'` and `job_demands.status = 'open' AND visibility =
 * 'public'` — the browse policies from `0001_initial_schema.sql`. Nothing here
 * widens that: no service-role client, no RPC, no `security definer` bypass. A
 * project the person may not read simply does not come back.
 *
 * ERROR IS NOT EMPTY. A failed query returns `state: "error"`, never an empty
 * list and never a fixture row. "There are no projects here" is a claim about
 * the market; "we could not read the market" is a claim about us, and showing
 * the first when the second is true is the silent fallback this command bans.
 *
 * THE SHAPING LIVES IN `project-results-model.ts` — pure, and unit-tested
 * there. This half only reads.
 */

export type {
  DemandJoinRow,
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
  /** Only 'open' demand is meaningful for a market answer, and it is the only
   *  status a non-owning user may read. Kept explicit so the contract is
   *  visible at the call site. */
  readonly status?: "open";
}

const SELECT =
  "id, role_title, headcount_needed, required_skills, start_date, project_id, " +
  "projects(id, title, country, city, status, start_date, end_date, company_id, " +
  "companies(display_name, legal_name))";

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_demands")
    .select(SELECT)
    .eq("status", input.status ?? "open")
    .limit(500);

  if (error || !data) {
    // Never a driver message: it can carry schema and connection detail. The
    // caller renders a stated failure, not this string.
    return {
      state: "error",
      geography,
      geographyLabel: label,
      rows: [],
      errorCode: error ? "project_query_failed" : "project_query_empty_response",
    };
  }

  const rows = groupIntoProjects(
    data as unknown as DemandJoinRow[],
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
  // The id comes from the URL. A non-uuid never reaches the database.
  if (!UUID.test(projectId)) return { ...base, state: "not_found" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_demands")
    .select(SELECT)
    .eq("status", "open")
    .eq("project_id", projectId)
    .limit(200);

  if (error || !data) {
    return {
      ...base,
      state: "error",
      errorCode: error
        ? "project_evaluation_query_failed"
        : "project_evaluation_empty_response",
    };
  }

  const demandRows = data as unknown as DemandJoinRow[];
  // The SAME grouping and the SAME geography filter as the list. A project that
  // is not in the selected place must not open from a hand-typed URL either.
  const rows = groupIntoProjects(demandRows, geography, cityResolves);
  const row = rows.find((r) => r.projectId === projectId);
  if (!row) return { ...base, state: "not_found" };

  const skillIds = row.requiredSkillIds;
  let slugById = new Map<string, string>();
  if (skillIds.length > 0) {
    const { data: skills, error: skillErr } = await supabase
      .from("skills")
      .select("id, slug")
      .in("id", [...skillIds]);
    if (!skillErr) {
      for (const s of (skills ?? []) as { id: string; slug: string | null }[]) {
        if (s.slug) slugById.set(s.id, s.slug);
      }
    } else {
      // The project is real and readable; only its skill LABELS failed. Losing
      // the whole evaluation over that would be worse than showing it with the
      // shortfall counted below.
      slugById = new Map();
    }
  }

  const slugs = [
    ...new Set(skillIds.map((id) => slugById.get(id)).filter(isString)),
  ].sort();

  const demands: EvaluationDemand[] = demandRows.map((d) => ({
    demandId: d.id,
    roleTitle: d.role_title?.trim() || null,
    headcount: typeof d.headcount_needed === "number" ? d.headcount_needed : null,
    startDate: d.start_date,
    skillSlugs: [
      ...new Set((d.required_skills ?? []).map((id) => slugById.get(id)).filter(isString)),
    ].sort(),
  }));

  return {
    ...base,
    state: "ok",
    row,
    demands,
    skillSlugs: slugs,
    unresolvedSkillCount: skillIds.length - slugs.length,
  };
}

function isString(v: string | undefined): v is string {
  return typeof v === "string";
}
