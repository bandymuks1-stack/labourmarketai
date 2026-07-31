/**
 * THE PROJECT RESULT, as pure shaping — no `server-only`, no supabase, no
 * React.
 *
 * The filtering rule below IS the correctness claim of Goal 3: "these projects,
 * and only these, create the demand under the marker you clicked". A claim that
 * can only be checked by standing up a database and a browser is a claim that
 * will quietly rot, so it lives here, where a unit test can hold it.
 *
 * `project-results.ts` is the thin half: it opens an authenticated client,
 * reads, and hands the rows to `groupIntoProjects`. Splitting it that way also
 * means the shaping cannot accidentally acquire a second read path.
 */
import {
  projectMatchesGeography,
  type GeographySelection,
} from "./geography-selection";

/** Why a project appeared, as a CODE plus its values — never generated prose.
 *
 *  The explanation has to be deterministic and checkable. A code rendered with
 *  the row's own values can be traced back to the filter that produced it; a
 *  sentence written at read time cannot, and is where invented "commercial
 *  attractiveness" or "success probability" would eventually appear. */
export type MatchReason =
  /** The project's city folds to the selected city. */
  | { readonly code: "city_exact"; readonly city: string; readonly country: string }
  /** The project is in the country and its city could NOT be resolved — it is
   *  part of the approximate aggregate the dashed marker represents. */
  | { readonly code: "country_unresolved"; readonly country: string };

/** A field the row does not carry. Rendered as an explicit gap, never as a
 *  zero, a dash or an invented default. */
export type MissingField =
  | "city"
  | "startDate"
  | "endDate"
  | "roleTitle"
  | "requiredSkills"
  | "headcount"
  | "organization";

/** The fields whose presence or absence is worth stating on a project. */
export const COMPLETENESS_FIELDS: readonly MissingField[] = [
  "city",
  "startDate",
  "endDate",
  "roleTitle",
  "requiredSkills",
  "headcount",
  "organization",
];

/** One project, with the demand behind it summed across its open needs. */
export interface ProjectResultRow {
  readonly projectId: string;
  readonly title: string | null;
  /** Company display name, falling back to the legal name. Null when the
   *  company row is not readable — stated, never guessed. */
  readonly organization: string | null;
  readonly country: string;
  /** RAW city text from the row. Null when the project has none. */
  readonly city: string | null;
  /** How precisely THIS project's place is known — the same contract the map
   *  markers use, so a dashed marker and an "approximate" row agree. */
  readonly precision: "city" | "country";
  /** Distinct role titles across the project's open needs. */
  readonly roles: readonly string[];
  /** Skill ids required across the project's open needs (uuid → `skills.id`). */
  readonly requiredSkillIds: readonly string[];
  /** Sum of `headcount_needed` across the open needs. */
  readonly openHeadcount: number;
  /** `projects.status` verbatim — 'live' etc. Not re-labelled. */
  readonly projectStatus: string | null;
  /** Earliest start across the project and its open needs. */
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** How many open needs were summed — the traceable unit behind the number. */
  readonly openDemandCount: number;
  readonly matchReason: MatchReason;
  readonly missing: readonly MissingField[];
}

/** The single demand-source statement, shown verbatim in the UI so the person
 *  can see which rows the answer came from. */
export const DEMAND_SOURCE = "job_demands(status=open) → projects" as const;

export type ProjectResultsState = "ok" | "empty" | "unsupported_precision" | "error";

export interface ProjectResults {
  readonly state: ProjectResultsState;
  readonly geography: GeographySelection;
  readonly geographyLabel: string;
  readonly rows: readonly ProjectResultRow[];
  /** Present only for `error` — a short code, never a driver message (which
   *  can carry schema or connection detail). */
  readonly errorCode?: string;
}

/** The join shape as read from `job_demands`. */
export interface DemandJoinRow {
  readonly id: string;
  readonly role_title: string | null;
  readonly headcount_needed: number | null;
  readonly required_skills: string[] | null;
  readonly start_date: string | null;
  readonly project_id: string | null;
  readonly projects: {
    readonly id: string;
    readonly title: string | null;
    readonly country: string | null;
    readonly city: string | null;
    readonly status: string | null;
    readonly start_date: string | null;
    readonly end_date: string | null;
    readonly company_id: string | null;
    readonly companies: {
      readonly display_name: string | null;
      readonly legal_name: string | null;
    } | null;
  } | null;
}

/**
 * Fold the demand rows into one row per project, keeping only the projects the
 * selection actually covers.
 *
 * `cityResolves` is injected rather than imported so this module stays free of
 * the coordinate table — and so a test can pin the country/unresolved branch
 * without depending on which cities happen to be in that table today.
 */
export function groupIntoProjects(
  demands: readonly DemandJoinRow[],
  geography: GeographySelection,
  cityResolves: (country: string, city: string) => boolean,
): ProjectResultRow[] {
  type Acc = {
    project: NonNullable<DemandJoinRow["projects"]>;
    roles: Set<string>;
    skills: Set<string>;
    headcount: number;
    demandCount: number;
    earliestStart: string | null;
    anyHeadcountStated: boolean;
    anyRoleStated: boolean;
    anySkillsStated: boolean;
  };
  const byProject = new Map<string, Acc>();

  for (const demand of demands) {
    const project = demand.projects;
    if (!project || !project.country) continue;
    if (!projectMatchesGeography(project, geography, cityResolves)) continue;

    const acc: Acc = byProject.get(project.id) ?? {
      project,
      roles: new Set<string>(),
      skills: new Set<string>(),
      headcount: 0,
      demandCount: 0,
      earliestStart: null,
      anyHeadcountStated: false,
      anyRoleStated: false,
      anySkillsStated: false,
    };

    const role = demand.role_title?.trim();
    if (role) {
      acc.roles.add(role);
      acc.anyRoleStated = true;
    }
    for (const s of demand.required_skills ?? []) {
      if (typeof s === "string" && s.trim() !== "") {
        acc.skills.add(s);
        acc.anySkillsStated = true;
      }
    }
    // A null headcount is NOT counted as 1. The market map sums a missing
    // headcount as one person because a marker needs a magnitude; a project row
    // is read as a commitment, so an unstated number stays unstated and shows
    // up in `missing` instead of inflating the total.
    if (typeof demand.headcount_needed === "number") {
      acc.headcount += demand.headcount_needed;
      acc.anyHeadcountStated = true;
    }
    acc.demandCount += 1;
    acc.earliestStart = earlier(acc.earliestStart, demand.start_date);

    byProject.set(project.id, acc);
  }

  const out: ProjectResultRow[] = [];
  for (const acc of byProject.values()) {
    const p = acc.project;
    const country = (p.country ?? "").toUpperCase();
    const cityText = p.city?.trim() ?? "";
    const resolved = cityText !== "" && cityResolves(country, cityText);
    const precision: "city" | "country" = resolved ? "city" : "country";

    const startDate = earlier(p.start_date, acc.earliestStart);
    const organization =
      p.companies?.display_name?.trim() || p.companies?.legal_name?.trim() || null;

    const missing: MissingField[] = [];
    if (cityText === "") missing.push("city");
    if (!startDate) missing.push("startDate");
    if (!p.end_date) missing.push("endDate");
    if (!acc.anyRoleStated) missing.push("roleTitle");
    if (!acc.anySkillsStated) missing.push("requiredSkills");
    if (!acc.anyHeadcountStated) missing.push("headcount");
    if (!organization) missing.push("organization");

    out.push({
      projectId: p.id,
      title: p.title,
      organization,
      country,
      city: cityText === "" ? null : cityText,
      precision,
      roles: [...acc.roles].sort(),
      requiredSkillIds: [...acc.skills].sort(),
      openHeadcount: acc.headcount,
      projectStatus: p.status,
      startDate,
      endDate: p.end_date,
      openDemandCount: acc.demandCount,
      matchReason:
        geography.precision === "city"
          ? { code: "city_exact", city: geography.city ?? "", country }
          : { code: "country_unresolved", country },
      missing,
    });
  }

  // Most demand first, then a stable tiebreak so the order never flickers
  // between reads (an unstable list reads as data changing when it has not).
  out.sort(
    (a, b) =>
      b.openHeadcount - a.openHeadcount ||
      (a.title ?? "").localeCompare(b.title ?? "") ||
      a.projectId.localeCompare(b.projectId),
  );
  return out;
}

/** ISO date strings compare lexicographically; null loses. */
export function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

// ── the evaluation ─────────────────────────────────────────────────────────

/** One open need, shown individually in the evaluation: a project asking for
 *  6 welders in May and 2 in July is not the same as "8 people", and the
 *  evaluation is exactly where that difference has to survive. */
export interface EvaluationDemand {
  readonly demandId: string;
  readonly roleTitle: string | null;
  readonly headcount: number | null;
  readonly startDate: string | null;
  readonly skillSlugs: readonly string[];
}

export interface ProjectEvaluation {
  readonly state: "ok" | "not_found" | "error" | "unsupported_precision";
  readonly geography: GeographySelection;
  readonly geographyLabel: string;
  readonly row?: ProjectResultRow;
  readonly demands: readonly EvaluationDemand[];
  /** Slugs for `requiredSkillIds`, resolved through `skills`. An id with no
   *  readable row is DROPPED rather than rendered as a raw uuid. */
  readonly skillSlugs: readonly string[];
  /** Ids that could not be resolved to a slug — counted, so a shortfall is
   *  visible rather than silently shrinking the skill list. */
  readonly unresolvedSkillCount: number;
  readonly errorCode?: string;
}

// ── the continuation to people (W4.5) ──────────────────────────────────────

/**
 * The structured context a "find matching people" step would receive.
 *
 * It is built HERE, from the evaluation that is on screen, rather than
 * assembled inside a button — so what the continuation carries is exactly what
 * the person was looking at, and it can be asserted in a test.
 *
 * There is deliberately NO people query behind it yet. People matching is the
 * next goal; a list invented to make this control look functional would be the
 * fabricated result this platform bans. The control therefore carries real
 * context into an explicitly not-yet-delivered state.
 */
export interface PeopleContinuationContext {
  readonly projectId: string;
  readonly roles: readonly string[];
  readonly skillSlugs: readonly string[];
  readonly geography: GeographySelection;
  readonly requestedHeadcount: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** The active organization, or null for the person's own space. */
  readonly workspace: string | null;
}

export function buildPeopleContinuation(
  evaluation: ProjectEvaluation,
  workspace: string | null,
): PeopleContinuationContext | null {
  const row = evaluation.row;
  if (evaluation.state !== "ok" || !row) return null;
  return {
    projectId: row.projectId,
    roles: row.roles,
    skillSlugs: evaluation.skillSlugs,
    geography: evaluation.geography,
    requestedHeadcount: row.openHeadcount,
    startDate: row.startDate,
    endDate: row.endDate,
    workspace,
  };
}
