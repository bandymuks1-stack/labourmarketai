/**
 * Future-work model (Labour Market OS P1, workforce planning) — the canonical
 * "future work entry" VIEW over the two models that already exist:
 *
 *   - demand   → `customer_requests` rows (kind `company_request`) with the
 *                typed `payload.structured_v2` cluster (the canonical
 *                structured demand contract — lib/demand/structured-demand-v2)
 *   - project  → `projects` rows (title, country, city, start/end dates,
 *                draft|live|paused lifecycle — the delivery axis)
 *
 * There is deliberately NO third intake and NO new store: employer intake
 * happens through the EXISTING demand form (save_demand_draft /
 * submit_demand_request RPCs) and the EXISTING project form. This module only
 * types the canonical mapping and composes the two sources into one
 * deduplicated, timeline-ordered list — the same "compose, never duplicate"
 * doctrine as lib/planning/planning-model.ts.
 *
 * Human-editable workforce-plan state (`WorkforcePlanV1`) is ADDITIVE JSON on
 * the canonical demand payload, stored at `payload.workforce_plan` — a SIBLING
 * of `structured_v2`, NOT inside it, because `structuredDemandV2Schema` is
 * zod-strict: an unknown key inside `structured_v2` would make every existing
 * `readStructuredDemandV2` call return null and silently break structured
 * demand for that request. The sibling key is written through the same
 * existing owner-scoped `save_demand_draft` RPC (payload is jsonb) — no schema
 * change, no new table, no 4th demand model.
 *
 * Pure module: no IO, no server-only import, no DB client — safe for
 * client, server and tests. Contract doc:
 * docs/product/future-work-planning-contract-v1.md
 */
import { z } from "zod";

import {
  readStructuredDemandV2,
  type StructuredDemandV2,
} from "@/lib/demand/structured-demand-v2";
import { toIsoDay } from "@/lib/planning/planning-model";

/* ------------------------------------------------------------------ */
/* Future work entry                                                    */
/* ------------------------------------------------------------------ */

export const FUTURE_WORK_SOURCES = ["demand", "project"] as const;
export type FutureWorkSource = (typeof FUTURE_WORK_SOURCES)[number];

/** Crew shape vocabulary — mirrors NEED_TEAM_SHAPES (lib/staffing/company-need)
 *  so the workforce layer never invents a fourth shape. Kept as a local const
 *  to keep this module free of the AI-registry import chain that
 *  company-need.ts pulls in. */
export const WORK_TEAM_SHAPES = ["solo", "team", "brigade"] as const;
export type WorkTeamShape = (typeof WORK_TEAM_SHAPES)[number];

export interface FutureWorkLanguageNeed {
  readonly lang: string;
  /** CEFR level (A1..C2) as stated in structured_v2. */
  readonly level: string;
  readonly onePerTeamSufficient: boolean;
}

export interface FutureWorkLocation {
  readonly country: string | null;
  readonly city: string | null;
}

/**
 * One future work entry — a read-time projection of ONE source record.
 * Every field is real data from the source (or an honest null); nothing here
 * fabricates scope, dates or requirements.
 */
export interface FutureWorkEntry {
  /** Stable id: `${source}:${sourceId}` (list keys, requirement linkage). */
  readonly id: string;
  readonly source: FutureWorkSource;
  readonly sourceId: string;
  readonly title: string | null;
  /** Source-native lifecycle value (customer_requests.status / projects.status). */
  readonly status: string;
  /** "YYYY-MM-DD" (UTC calendar days) — null is honest "no date yet". */
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly location: FutureWorkLocation;
  /** From structured_v2.time.hours_per_week — null when not captured. */
  readonly hoursPerWeek: number | null;
  /** From structured_v2.time.shifts (closed set day/night/weekend). */
  readonly shifts: readonly string[];
  /** Requested crew size when the payload states one (team_size /
   *  number_of_workers); null = the owner never stated a headcount. */
  readonly teamSize: number | null;
  /** Derived from structured_v2.target_supply (individual→solo,
   *  multiple_workers/team→team); null when not captured. `company` supply is
   *  a partner request, not an internal crew shape. */
  readonly teamShape: WorkTeamShape | null;
  /** Skill slugs stated on the payload (required_skills) — owner-stated. */
  readonly requiredSkills: readonly string[];
  /** Bounded owner-side certificate text (structured_v2.requirements.certificates). */
  readonly requiredCertificates: readonly string[];
  readonly requiredLanguages: readonly FutureWorkLanguageNeed[];
  /** structured_v2.requirements.min_experience_years, when stated. */
  readonly minExperienceYears: number | null;
  /** target_supply === "company" OR subcontract/service_request opportunity —
   *  the work expects an external partner, not only internal crew. */
  readonly partnerSupplyExpected: boolean;
  /** True when a structured_v2 cluster was captured (demand entries only). */
  readonly structuredCaptured: boolean;
}

/* ------------------------------------------------------------------ */
/* Source inputs (rows the server service reads; kept storage-shaped)   */
/* ------------------------------------------------------------------ */

/** A customer_requests row (kind company_request) as read owner-scoped. */
export interface DemandWorkInput {
  readonly id: string;
  readonly title: string | null;
  readonly status: string;
  /** The raw payload jsonb — structured_v2 is parsed here, tolerantly. */
  readonly payload: unknown;
}

/** A projects row (the delivery axis) as read under the projects RLS. */
export interface ProjectWorkInput {
  readonly id: string;
  readonly title: string | null;
  readonly status: string;
  readonly country: string | null;
  readonly city: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

/* ------------------------------------------------------------------ */
/* Tolerant payload readers (never throw, never fabricate)              */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Owner-stated crew size, if the payload carries one under any of the
 *  historical keys. Bounded 1..100000 (the company-need bound). */
export function readTeamSize(payload: unknown): number | null {
  const rec = asRecord(payload);
  if (!rec) return null;
  for (const key of ["team_size", "teamSize", "number_of_workers", "numberOfWorkers"]) {
    const v = rec[key];
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100_000) {
      return v;
    }
  }
  return null;
}

/** Owner-stated required skill slugs (bounded, strings only). */
export function readRequiredSkills(payload: unknown): readonly string[] {
  const rec = asRecord(payload);
  if (!rec) return [];
  for (const key of ["required_skills", "requiredSkills"]) {
    const v = rec[key];
    if (Array.isArray(v)) {
      return v
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 120)
        .slice(0, 40);
    }
  }
  return [];
}

function teamShapeFromV2(v2: StructuredDemandV2 | null): WorkTeamShape | null {
  switch (v2?.target_supply) {
    case "individual":
      return "solo";
    case "multiple_workers":
    case "team":
      return "team";
    default:
      return null;
  }
}

function partnerExpected(v2: StructuredDemandV2 | null): boolean {
  if (!v2) return false;
  if (v2.target_supply === "company") return true;
  return (
    v2.opportunity_type === "subcontract" ||
    v2.opportunity_type === "service_request"
  );
}

/* ------------------------------------------------------------------ */
/* Composition                                                          */
/* ------------------------------------------------------------------ */

export function demandToFutureWork(input: DemandWorkInput): FutureWorkEntry {
  const v2 = readStructuredDemandV2(input.payload);
  return {
    id: `demand:${input.id}`,
    source: "demand",
    sourceId: input.id,
    title: input.title?.trim() ? input.title : null,
    status: input.status,
    startDate: toIsoDay(v2?.time?.start_earliest ?? null),
    endDate: toIsoDay(v2?.time?.end_date ?? null),
    location: { country: v2?.contract_country ?? null, city: null },
    hoursPerWeek: v2?.time?.hours_per_week ?? null,
    shifts: v2?.time?.shifts ?? [],
    teamSize: readTeamSize(input.payload),
    teamShape: teamShapeFromV2(v2),
    requiredSkills: readRequiredSkills(input.payload),
    requiredCertificates: v2?.requirements?.certificates ?? [],
    requiredLanguages: (v2?.requirements?.languages ?? []).map((l) => ({
      lang: l.lang,
      level: l.level,
      onePerTeamSufficient: l.one_per_team_sufficient === true,
    })),
    minExperienceYears: v2?.requirements?.min_experience_years ?? null,
    partnerSupplyExpected: partnerExpected(v2),
    structuredCaptured: v2 !== null,
  };
}

export function projectToFutureWork(input: ProjectWorkInput): FutureWorkEntry {
  return {
    id: `project:${input.id}`,
    source: "project",
    sourceId: input.id,
    title: input.title?.trim() ? input.title : null,
    status: input.status,
    startDate: toIsoDay(input.startDate),
    endDate: toIsoDay(input.endDate),
    location: {
      country: input.country?.trim() ? input.country : null,
      city: input.city?.trim() ? input.city : null,
    },
    // Projects carry no structured workforce requirements today — honest
    // nulls; the demand entry is where requirements live.
    hoursPerWeek: null,
    shifts: [],
    teamSize: null,
    teamShape: null,
    requiredSkills: [],
    requiredCertificates: [],
    requiredLanguages: [],
    minExperienceYears: null,
    partnerSupplyExpected: false,
    structuredCaptured: false,
  };
}

function sortEntries(a: FutureWorkEntry, b: FutureWorkEntry): number {
  const aKey = `${a.startDate ?? "9999-99-99"}|${a.source}|${a.sourceId}`;
  const bKey = `${b.startDate ?? "9999-99-99"}|${b.source}|${b.sourceId}`;
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}

/**
 * Merge demand + project inputs into ONE deduplicated, timeline-ordered
 * future-work list. Dedup key is `${source}:${sourceId}` — the same source
 * row can never appear twice (first occurrence wins); a demand and a project
 * are DIFFERENT records on purpose (no cross-source guessing — the platform
 * has no stored demand→project link to merge on, and inventing one here
 * would fake a relation).
 */
export function composeFutureWork(inputs: {
  readonly demands: readonly DemandWorkInput[];
  readonly projects: readonly ProjectWorkInput[];
}): readonly FutureWorkEntry[] {
  const seen = new Set<string>();
  const out: FutureWorkEntry[] = [];
  for (const entry of [
    ...inputs.demands.map(demandToFutureWork),
    ...inputs.projects.map(projectToFutureWork),
  ]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out.sort(sortEntries);
}

/* ------------------------------------------------------------------ */
/* WorkforcePlanV1 — human-editable plan state on the demand payload     */
/* ------------------------------------------------------------------ */

export const WORKFORCE_PLAN_VERSION = 1 as const;
/** The additive payload key — a SIBLING of structured_v2 (see header). */
export const WORKFORCE_PLAN_PAYLOAD_KEY = "workforce_plan" as const;

export const WORKFORCE_REQUIREMENT_STATUSES = [
  "suggested",
  "confirmed",
  "edited",
  "rejected",
] as const;
export type WorkforceRequirementStatus =
  (typeof WORKFORCE_REQUIREMENT_STATUSES)[number];

export const WORKFORCE_CONFIDENCES = ["high", "medium", "low"] as const;
export type WorkforceConfidence = (typeof WORKFORCE_CONFIDENCES)[number];

export const WORKFORCE_REQUIREMENT_KINDS = ["crew", "supervisor"] as const;
export type WorkforceRequirementKind =
  (typeof WORKFORCE_REQUIREMENT_KINDS)[number];

/**
 * One workforce requirement line. Derivation (lib/workforce/work-breakdown)
 * only ever produces status "suggested"; the three pure human transitions
 * (confirm / edit / reject) are the ONLY status changes — a machine never
 * auto-confirms.
 */
export interface WorkforceRequirement {
  /** Deterministic id — stable across re-derivation of the same entry. */
  readonly id: string;
  /** FutureWorkEntry.id this requirement belongs to. */
  readonly entryId: string;
  readonly kind: WorkforceRequirementKind;
  /** Profession catalogue slug, or null = undetermined (human decides). */
  readonly professionSlug: string | null;
  readonly roleTitle: string | null;
  readonly headcount: number;
  readonly hoursPerWeek: number | null;
  /** headcount × hoursPerWeek × duration weeks — null when underivable. */
  readonly totalHours: number | null;
  readonly skills: readonly string[];
  readonly certificates: readonly string[];
  readonly languages: readonly FutureWorkLanguageNeed[];
  readonly teamShape: WorkTeamShape | null;
  readonly equipmentNeeded: boolean;
  readonly partnerNeeded: boolean;
  /** Fields the deterministic rules could NOT determine — a human must
   *  confirm or edit these before the line is trustworthy. */
  readonly undeterminedFields: readonly string[];
  /** Provenance: "deterministic:<rule-id>" (derivation) or "human" (manual). */
  readonly source: string;
  readonly explanation: string;
  readonly confidence: WorkforceConfidence;
  readonly status: WorkforceRequirementStatus;
}

export interface WorkforcePlanV1 {
  readonly version: typeof WORKFORCE_PLAN_VERSION;
  readonly requirements: readonly WorkforceRequirement[];
  /** Set by confirmRequirement — the last human confirmation moment. */
  readonly confirmedAtIso?: string;
  readonly confirmedBy?: string;
}

const languageNeedSchema = z
  .object({
    lang: z.string().min(1).max(8),
    level: z.string().min(1).max(8),
    onePerTeamSufficient: z.boolean(),
  })
  .strict();

const requirementSchema = z
  .object({
    id: z.string().min(1).max(300),
    entryId: z.string().min(1).max(300),
    kind: z.enum(WORKFORCE_REQUIREMENT_KINDS),
    professionSlug: z.string().min(1).max(120).nullable(),
    roleTitle: z.string().min(1).max(200).nullable(),
    headcount: z.number().int().min(0).max(100_000),
    hoursPerWeek: z.number().int().min(1).max(80).nullable(),
    totalHours: z.number().min(0).max(10_000_000).nullable(),
    skills: z.array(z.string().min(1).max(120)).max(60),
    certificates: z.array(z.string().min(1).max(300)).max(20),
    languages: z.array(languageNeedSchema).max(10),
    teamShape: z.enum(WORK_TEAM_SHAPES).nullable(),
    equipmentNeeded: z.boolean(),
    partnerNeeded: z.boolean(),
    undeterminedFields: z.array(z.string().min(1).max(60)).max(20),
    source: z.string().min(1).max(120),
    explanation: z.string().min(1).max(2000),
    confidence: z.enum(WORKFORCE_CONFIDENCES),
    status: z.enum(WORKFORCE_REQUIREMENT_STATUSES),
  })
  .strict();

const workforcePlanV1Schema = z
  .object({
    version: z.literal(WORKFORCE_PLAN_VERSION),
    requirements: z.array(requirementSchema).max(100),
    confirmedAtIso: z.string().max(40).optional(),
    confirmedBy: z.string().max(200).optional(),
  })
  .strict();

/** Read a stored payload's workforce plan — old records without one, or an
 *  unknown/future shape, are an honest null (never a crash, never a default). */
export function readWorkforcePlanV1(payload: unknown): WorkforcePlanV1 | null {
  const rec = asRecord(payload);
  if (!rec) return null;
  const raw = rec[WORKFORCE_PLAN_PAYLOAD_KEY];
  if (raw == null) return null;
  const parsed = workforcePlanV1Schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Return a NEW payload object with the plan written at the additive sibling
 * key. Never mutates the input; every other payload key (including
 * structured_v2) is preserved byte-for-byte. Invalid plans return null —
 * a malformed plan must never overwrite a stored one.
 */
export function writeWorkforcePlanV1(
  payload: unknown,
  plan: WorkforcePlanV1,
): Record<string, unknown> | null {
  const parsed = workforcePlanV1Schema.safeParse(plan);
  if (!parsed.success) return null;
  const base = asRecord(payload) ?? {};
  return { ...base, [WORKFORCE_PLAN_PAYLOAD_KEY]: parsed.data };
}
