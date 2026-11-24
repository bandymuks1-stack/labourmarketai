/**
 * Work breakdown — deterministic workforce-requirement derivation (Labour
 * Market OS P2). Turns ONE FutureWorkEntry into suggested requirement lines
 * using DICTIONARY/RULE derivation ONLY — no LLM, no IO, no randomness: the
 * same entry + catalogue always derives the same lines.
 *
 * Every derived line carries provenance (`source: "deterministic:<rule-id>"`),
 * a human-readable explanation, a confidence grade and status "suggested".
 * A machine NEVER confirms: the three pure human transitions below
 * (confirmRequirement / editRequirement / rejectRequirement) are the only
 * status changes, and confirm is the only path to status "confirmed".
 *
 * Rule catalogue (documented in
 * docs/product/workforce-requirements-contract-v1.md):
 *   crew-from-structured-demand  one crew line per entry: profession from
 *                                skills (reverse catalogue index) or title
 *                                tokens; headcount from stated team size
 *                                (else 1 + undetermined); hours from
 *                                hours_per_week × headcount × duration weeks;
 *                                skills/certificates/languages passed through
 *                                from the owner's own statements.
 *   supervisor-team-of-5         a crew of SUPERVISOR_TEAM_THRESHOLD (5) or
 *                                more people gets ONE suggested supervisor
 *                                line (site supervision skill set). Rationale:
 *                                the profession catalogue's foreman role
 *                                exists exactly for crews that need one
 *                                coordinating person; 5 is the smallest crew
 *                                the staffing model calls a brigade-scale
 *                                team. The line is a SUGGESTION — a human
 *                                confirms or rejects it like any other.
 *
 * Pure module: no server-only import, no DB client, no network.
 */
import {
  WORKFORCE_PLAN_VERSION,
  type FutureWorkEntry,
  type WorkforcePlanV1,
  type WorkforceRequirement,
} from "@/lib/workforce/future-work-model";

/** Crew size at (or above) which one supervisor line is suggested. */
export const SUPERVISOR_TEAM_THRESHOLD = 5;

/** Rule ids — the closed provenance vocabulary of this module. */
export const DERIVATION_RULE_IDS = [
  "crew-from-structured-demand",
  "supervisor-team-of-5",
] as const;
export type DerivationRuleId = (typeof DERIVATION_RULE_IDS)[number];

/** A derived requirement is a WorkforceRequirement whose status is always
 *  "suggested" and whose source is always "deterministic:<rule-id>". */
export type DerivedRequirement = WorkforceRequirement;

export interface WorkforceCatalog {
  /** Profession catalogue slugs (the professions table / static mirror). */
  readonly professions: readonly string[];
  /** profession slug → canonical skill slugs (profession_skills mirror —
   *  lib/taxonomy/profession-skills PROFESSION_SKILLS is the intended feed). */
  readonly professionSkills: Readonly<Record<string, readonly string[]>>;
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

/** Inclusive calendar-day count between two "YYYY-MM-DD" days (UTC math). */
function inclusiveDays(startDay: string, endDay: string): number {
  const start = new Date(`${startDay}T00:00:00Z`).getTime();
  const end = new Date(`${endDay}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Duration in whole weeks (rounded up), or null without a full date band. */
export function durationWeeks(entry: {
  readonly startDate: string | null;
  readonly endDate: string | null;
}): number | null {
  if (!entry.startDate || !entry.endDate) return null;
  const days = inclusiveDays(entry.startDate, entry.endDate);
  return days > 0 ? Math.ceil(days / 7) : null;
}

/**
 * Profession suggestion from the entry's stated skills: the catalogue
 * profession covering the MOST stated skills wins (ties break
 * alphabetically — deterministic). Null when no profession covers any
 * stated skill.
 */
export function professionFromSkills(
  requiredSkills: readonly string[],
  catalog: WorkforceCatalog,
): { slug: string; covered: number } | null {
  if (requiredSkills.length === 0) return null;
  const wanted = new Set(requiredSkills.map((s) => s.toLowerCase()));
  let best: { slug: string; covered: number } | null = null;
  for (const slug of [...catalog.professions].sort()) {
    const skills = catalog.professionSkills[slug] ?? [];
    let covered = 0;
    for (const s of skills) if (wanted.has(s.toLowerCase())) covered += 1;
    if (covered > 0 && (best === null || covered > best.covered)) {
      best = { slug, covered };
    }
  }
  return best;
}

/**
 * Profession suggestion from title tokens: a catalogue slug whose
 * underscore-separated tokens ALL appear in the normalized title matches
 * ("Elektrikai objekte" never matches; "site manager needed" matches
 * site_manager). First alphabetical match wins — deterministic, honest
 * about being a weak signal (confidence low downstream).
 */
export function professionFromTitle(
  title: string | null,
  catalog: WorkforceCatalog,
): string | null {
  if (!title) return null;
  const words = new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1),
  );
  for (const slug of [...catalog.professions].sort()) {
    const tokens = slug.toLowerCase().split("_");
    if (tokens.every((t) => words.has(t))) return slug;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Derivation                                                           */
/* ------------------------------------------------------------------ */

function crewRequirement(
  entry: FutureWorkEntry,
  catalog: WorkforceCatalog,
): DerivedRequirement {
  const undetermined: string[] = [];
  const explanationParts: string[] = [];

  // Headcount — the user's entered value is an authoritative fact and is
  // NEVER silently replaced by a derived number (owner principle:
  // constitution §1.2). Only when nothing was stated does the system offer
  // a placeholder, and that placeholder is carried as a labelled SYSTEM
  // SUGGESTION requiring human confirm/edit.
  let headcount = 1;
  let headcountStated = false;
  let userEnteredHeadcount: number | null = null;
  let systemSuggestedHeadcount: number | null = null;
  if (entry.teamSize !== null) {
    headcount = entry.teamSize;
    headcountStated = true;
    if (entry.teamSizeSource === "user_entered") {
      userEnteredHeadcount = entry.teamSize;
      explanationParts.push(
        `headcount ${headcount} — the number the owner entered (user-entered fact, kept authoritative)`,
      );
    } else {
      explanationParts.push(
        `headcount ${headcount} from the stated team size on the demand payload`,
      );
    }
  } else {
    systemSuggestedHeadcount = 1;
    undetermined.push("headcount");
    explanationParts.push(
      "headcount 1 is a SYSTEM SUGGESTION — no team size stated; confirm or edit before relying on it",
    );
  }

  // Profession — skills dictionary first, title tokens second.
  let professionSlug: string | null = null;
  const fromSkills = professionFromSkills(entry.requiredSkills, catalog);
  if (fromSkills) {
    professionSlug = fromSkills.slug;
    explanationParts.push(
      `profession "${fromSkills.slug}" covers ${fromSkills.covered} of ${entry.requiredSkills.length} stated skills`,
    );
  } else {
    const fromTitle = professionFromTitle(entry.title, catalog);
    if (fromTitle) {
      professionSlug = fromTitle;
      explanationParts.push(`profession "${fromTitle}" matched from the title text`);
    } else {
      undetermined.push("profession");
      explanationParts.push("profession undetermined — human must pick one");
    }
  }

  // Skills — the owner's own statements first; otherwise the catalogue
  // skills the suggested profession implies (clearly labelled as implied).
  let skills: readonly string[] = entry.requiredSkills;
  if (skills.length === 0 && professionSlug) {
    skills = catalog.professionSkills[professionSlug] ?? [];
    if (skills.length > 0) {
      explanationParts.push(
        `skills implied by profession "${professionSlug}" (catalogue mapping)`,
      );
    }
  }
  if (skills.length === 0) undetermined.push("skills");

  // Hours — only from real stated numbers; a missing piece degrades honestly.
  const weeks = durationWeeks(entry);
  let totalHours: number | null = null;
  if (entry.hoursPerWeek !== null && weeks !== null) {
    totalHours = entry.hoursPerWeek * headcount * weeks;
    explanationParts.push(
      `${totalHours}h = ${entry.hoursPerWeek}h/week x ${headcount} people x ${weeks} weeks`,
    );
  } else {
    undetermined.push("hours");
  }
  if (entry.startDate === null) undetermined.push("startDate");

  // Confidence of the whole line: high only when headcount was stated AND
  // the profession came from the skills dictionary; medium when one of the
  // two held; low otherwise.
  const strongSignals = (headcountStated ? 1 : 0) + (fromSkills ? 1 : 0);
  const confidence =
    strongSignals === 2 ? "high" : strongSignals === 1 ? "medium" : "low";

  return {
    id: `${entry.id}#crew#${professionSlug ?? "unknown"}`,
    entryId: entry.id,
    kind: "crew",
    professionSlug,
    roleTitle: entry.title,
    headcount,
    userEnteredHeadcount,
    systemSuggestedHeadcount,
    hoursPerWeek: entry.hoursPerWeek,
    totalHours,
    skills,
    certificates: entry.requiredCertificates,
    languages: entry.requiredLanguages,
    teamShape: entry.teamShape,
    equipmentNeeded: false,
    partnerNeeded: entry.partnerSupplyExpected,
    undeterminedFields: undetermined,
    source: "deterministic:crew-from-structured-demand",
    explanation: explanationParts.join("; "),
    confidence,
    status: "suggested",
  };
}

function supervisorRequirement(
  entry: FutureWorkEntry,
  crew: DerivedRequirement,
  catalog: WorkforceCatalog,
): DerivedRequirement | null {
  if (crew.headcount < SUPERVISOR_TEAM_THRESHOLD) return null;
  // The catalogue's coordinating profession, when present.
  const supervisorProfession = catalog.professions.includes("foreman")
    ? "foreman"
    : null;
  return {
    id: `${entry.id}#supervisor`,
    entryId: entry.id,
    kind: "supervisor",
    professionSlug: supervisorProfession,
    roleTitle: null,
    headcount: 1,
    userEnteredHeadcount: null,
    systemSuggestedHeadcount: 1,
    hoursPerWeek: entry.hoursPerWeek,
    totalHours: null,
    skills: supervisorProfession
      ? catalog.professionSkills[supervisorProfession] ?? []
      : [],
    certificates: [],
    languages: [],
    teamShape: null,
    equipmentNeeded: false,
    partnerNeeded: false,
    undeterminedFields: [],
    source: "deterministic:supervisor-team-of-5",
    explanation: `crew of ${crew.headcount} >= ${SUPERVISOR_TEAM_THRESHOLD} — one supervisor suggested (documented team-of-${SUPERVISOR_TEAM_THRESHOLD} rule)`,
    confidence: "high",
    status: "suggested",
  };
}

/**
 * Derive the suggested workforce requirements of ONE future work entry.
 * Deterministic and pure; every line is status "suggested" — human
 * confirmation is a separate, explicit transition.
 */
export function deriveWorkforceRequirements(
  entry: FutureWorkEntry,
  catalog: WorkforceCatalog,
): readonly DerivedRequirement[] {
  const crew = crewRequirement(entry, catalog);
  const supervisor = supervisorRequirement(entry, crew, catalog);
  return supervisor ? [crew, supervisor] : [crew];
}

/** A fresh plan wrapping derived (suggested) requirements. */
export function planFromDerived(
  requirements: readonly DerivedRequirement[],
): WorkforcePlanV1 {
  return { version: WORKFORCE_PLAN_VERSION, requirements };
}

/* ------------------------------------------------------------------ */
/* Human confirmation transitions (pure — the ONLY status changes)      */
/* ------------------------------------------------------------------ */

/** Fields a human may edit on a requirement line. */
export type WorkforceRequirementPatch = Partial<
  Pick<
    WorkforceRequirement,
    | "professionSlug"
    | "roleTitle"
    | "headcount"
    | "hoursPerWeek"
    | "totalHours"
    | "skills"
    | "certificates"
    | "languages"
    | "teamShape"
    | "equipmentNeeded"
    | "partnerNeeded"
  >
>;

function replaceRequirement(
  plan: WorkforcePlanV1,
  requirementId: string,
  map: (r: WorkforceRequirement) => WorkforceRequirement,
): { plan: WorkforcePlanV1; changed: boolean } {
  let changed = false;
  const requirements = plan.requirements.map((r) => {
    if (r.id !== requirementId) return r;
    const next = map(r);
    if (next !== r) changed = true;
    return next;
  });
  return { plan: changed ? { ...plan, requirements } : plan, changed };
}

/**
 * A HUMAN confirms one requirement line. The only path to status
 * "confirmed" in the whole workforce layer (guard-pinned). Rejected lines
 * cannot be confirmed (reject is final until re-derivation); unknown ids
 * return the plan unchanged.
 */
export function confirmRequirement(
  plan: WorkforcePlanV1,
  requirementId: string,
  confirmedBy: string,
  atIso: string,
): WorkforcePlanV1 {
  const { plan: next, changed } = replaceRequirement(plan, requirementId, (r) =>
    r.status === "suggested" || r.status === "edited"
      ? { ...r, status: "confirmed" }
      : r,
  );
  if (!changed) return plan;
  return { ...next, confirmedAtIso: atIso, confirmedBy };
}

/**
 * A HUMAN edits one requirement line — status becomes "edited" (an edit is
 * a human statement, but NOT a confirmation: confirm stays explicit). A
 * confirmed line drops back to "edited" when changed (the edit invalidates
 * the earlier confirmation); rejected lines are not editable.
 */
export function editRequirement(
  plan: WorkforcePlanV1,
  requirementId: string,
  patch: WorkforceRequirementPatch,
): WorkforcePlanV1 {
  const { plan: next } = replaceRequirement(plan, requirementId, (r) => {
    if (r.status === "rejected") return r;
    // An edited headcount is a HUMAN statement: it becomes the
    // user-entered value and clears any competing system suggestion —
    // the system's number never survives a human's explicit choice.
    const headcountEdited =
      typeof patch.headcount === "number" && patch.headcount !== r.headcount;
    return {
      ...r,
      ...patch,
      ...(headcountEdited
        ? {
            userEnteredHeadcount: patch.headcount ?? null,
            systemSuggestedHeadcount: null,
          }
        : {}),
      source: "human",
      explanation: `${r.explanation}; edited by human`,
      status: "edited",
    };
  });
  return next;
}

/** A HUMAN rejects one requirement line — it stays in the plan as an honest
 *  record (status "rejected") and is excluded from capacity/gap work. */
export function rejectRequirement(
  plan: WorkforcePlanV1,
  requirementId: string,
): WorkforcePlanV1 {
  const { plan: next } = replaceRequirement(plan, requirementId, (r) =>
    r.status === "rejected" ? r : { ...r, status: "rejected" },
  );
  return next;
}
