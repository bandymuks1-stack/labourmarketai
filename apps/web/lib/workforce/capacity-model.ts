/**
 * Capacity model (Labour Market OS P3) — pure comparison of workforce
 * requirements against the REAL internal supply: workers (availability,
 * planned commitments, skills, professions, certificates, languages,
 * location, preferences), project assignments and brigades.
 *
 * PRIVACY: `WorkerCapacityInput` and every output type carry opaque worker
 * ids only — no name, no email, no phone, no contact field of any kind may
 * cross this boundary (type-level test pins this).
 *
 * Matching rules (documented in
 * docs/product/workforce-capacity-skill-gap-contract-v1.md):
 *   available  availability_status !== "unavailable" AND (available_from
 *              <= need start when both are known).
 *   free       no planned commitment overlaps the need window — INCLUSIVE
 *              calendar-day ranges, the exact booking-accept-guard
 *              semantics (rangesOverlapInclusive). Without a need window
 *              the check degrades honestly to availability only.
 *   fit        professions include the requirement's profession, OR the
 *              worker covers at least half (rounded up) of the
 *              requirement's skills.
 *   eligible   available AND free AND fit → counts toward headcount.
 *   busy-fit   fit + available but COMMITTED in the window — surfaced
 *              separately (transfer candidates), never counted as capacity.
 *
 * Eight gap types are computed per requirement — headcount, hours, skill,
 * certificate, language, supervisor, location, brigade — each with the
 * worker ids that CAN cover it and an honest shortfall number. Nothing here
 * fabricates capacity: unknown data never matches.
 *
 * Pure module: no server-only import, no DB client, no IO.
 */
import { rangesOverlapInclusive } from "@/lib/planning/planning-model";
import type {
  FutureWorkEntry,
  WorkforceRequirement,
  WorkforceRequirementStatus,
} from "@/lib/workforce/future-work-model";

/* ------------------------------------------------------------------ */
/* Supply inputs (opaque ids only — never contact data)                 */
/* ------------------------------------------------------------------ */

export interface CommitmentRange {
  readonly startDate: string;
  /** Null collapses to the start day (booking-guard coalesce semantics). */
  readonly endDate: string | null;
}

export interface WorkerCapacityPreferences {
  readonly willingToRelocate: boolean | null;
  readonly needsAccommodation: boolean | null;
  readonly hasTransport: boolean | null;
  readonly maxTripDays: number | null;
  readonly teamAvailable: boolean | null;
  readonly soloAvailable: boolean | null;
}

export interface WorkerCapacityInput {
  /** workers.id — opaque; NEVER profile contact data. */
  readonly workerId: string;
  readonly availabilityStatus: string | null;
  readonly availableFrom: string | null;
  /** Date ranges the worker is already committed to (assignments/bookings). */
  readonly plannedCommitments: readonly CommitmentRange[];
  /** Canonical skill slugs: worker_skills + confirmed profile claims. */
  readonly skills: readonly string[];
  readonly professions: readonly string[];
  /** Certificate labels from worker_documents (professional_certificate). */
  readonly certificates: readonly string[];
  readonly languages: readonly { readonly lang: string; readonly level: string }[];
  readonly locationCountry: string | null;
  readonly preferences: WorkerCapacityPreferences;
  readonly brigadeIds: readonly string[];
  /** Living-CV signal — confirmed work-history entries (0 when unknown). */
  readonly confirmedWorkHistoryCount: number;
}

export interface WorkerAssignmentInput {
  readonly workerId: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface BrigadeInput {
  readonly brigadeId: string;
  readonly memberWorkerIds: readonly string[];
}

export interface WorkforceSupply {
  readonly workers: readonly WorkerCapacityInput[];
  /** Extra commitments (merged with each worker's plannedCommitments). */
  readonly assignments: readonly WorkerAssignmentInput[];
  readonly brigades: readonly BrigadeInput[];
}

/* ------------------------------------------------------------------ */
/* Gap outputs                                                          */
/* ------------------------------------------------------------------ */

export const CAPACITY_GAP_KINDS = [
  "headcount",
  "hours",
  "skill",
  "certificate",
  "language",
  "supervisor",
  "location",
  "brigade",
] as const;
export type CapacityGapKind = (typeof CAPACITY_GAP_KINDS)[number];

export interface CapacityGap {
  readonly kind: CapacityGapKind;
  readonly requirementId: string;
  /** Skill slug / certificate label / language code — null for count gaps. */
  readonly subject: string | null;
  readonly required: number;
  /** Workers that CAN cover this dimension (opaque ids). */
  readonly matchedWorkerIds: readonly string[];
  readonly shortfall: number;
}

export interface HoursGap {
  readonly requirementId: string;
  /** Null when the requirement carries no derivable hour volume. */
  readonly requiredHours: number | null;
  /** Proportional model: requiredHours × min(eligible, headcount)/headcount.
   *  No per-worker hour ledger exists — documented approximation. */
  readonly coverableHours: number | null;
  readonly shortfallHours: number | null;
}

export interface RequirementCapacity {
  readonly requirementId: string;
  readonly requirementKind: WorkforceRequirement["kind"];
  readonly requirementStatus: WorkforceRequirementStatus;
  readonly entryId: string;
  readonly needStartDate: string | null;
  readonly needEndDate: string | null;
  readonly headcountRequired: number;
  /** Fully eligible workers (available + free + fit). */
  readonly matchedWorkerIds: readonly string[];
  /** Fit + available but committed in the window — transfer candidates. */
  readonly busyMatchedWorkerIds: readonly string[];
  /** Right profession but missing required skills — training candidates. */
  readonly nearMissWorkerIds: readonly string[];
  readonly headcountGap: CapacityGap;
  readonly hoursGap: HoursGap;
  readonly skillGaps: readonly CapacityGap[];
  readonly certificateGaps: readonly CapacityGap[];
  readonly languageGaps: readonly CapacityGap[];
  /** Only supervisor-kind requirements produce one. */
  readonly supervisorGap: CapacityGap | null;
  readonly locationGap: CapacityGap | null;
  /** Only brigade-shaped requirements produce one. */
  readonly brigadeGap: CapacityGap | null;
  /** True when the requirement expects an external partner (never covered
   *  by internal workers — surfaced for the recommendation layer). */
  readonly partnerNeeded: boolean;
}

export interface CapacityAssessment {
  readonly requirements: readonly RequirementCapacity[];
  readonly workersConsidered: number;
  readonly totalHeadcountShortfall: number;
}

/* ------------------------------------------------------------------ */
/* Deterministic matching helpers                                       */
/* ------------------------------------------------------------------ */

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** level >= required on the CEFR ladder; "native" beats everything. */
export function languageLevelSatisfies(
  workerLevel: string,
  requiredLevel: string,
): boolean {
  if (workerLevel === "native") return true;
  const have = CEFR_ORDER.indexOf(workerLevel as (typeof CEFR_ORDER)[number]);
  const need = CEFR_ORDER.indexOf(requiredLevel as (typeof CEFR_ORDER)[number]);
  if (have === -1 || need === -1) return false;
  return have >= need;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Certificate match: normalized equality or containment either way —
 *  certificates are bounded free text on both sides (no taxonomy yet). */
export function certificateMatches(
  workerCertificate: string,
  requiredCertificate: string,
): boolean {
  const a = norm(workerCertificate);
  const b = norm(requiredCertificate);
  if (a.length === 0 || b.length === 0) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function skillCoverage(
  worker: WorkerCapacityInput,
  skills: readonly string[],
): number {
  if (skills.length === 0) return 0;
  const have = new Set(worker.skills.map(norm));
  let covered = 0;
  for (const s of skills) if (have.has(norm(s))) covered += 1;
  return covered;
}

/** fit = profession match OR >= half (rounded up) of the skills covered. */
export function workerFitsRequirement(
  worker: WorkerCapacityInput,
  requirement: Pick<WorkforceRequirement, "professionSlug" | "skills">,
): boolean {
  if (
    requirement.professionSlug !== null &&
    worker.professions.some((p) => norm(p) === norm(requirement.professionSlug!))
  ) {
    return true;
  }
  if (requirement.skills.length === 0) return false;
  const covered = skillCoverage(worker, requirement.skills);
  return covered >= Math.ceil(requirement.skills.length / 2);
}

function isAvailable(
  worker: WorkerCapacityInput,
  needStart: string | null,
): boolean {
  if (worker.availabilityStatus === "unavailable") return false;
  if (worker.availableFrom && needStart && worker.availableFrom > needStart) {
    return false;
  }
  return true;
}

function isFree(
  commitments: readonly CommitmentRange[],
  needStart: string | null,
  needEnd: string | null,
): boolean {
  if (!needStart) return true; // no window → degrade to availability only
  const end = needEnd && needEnd >= needStart ? needEnd : needStart;
  for (const c of commitments) {
    const cEnd = c.endDate && c.endDate >= c.startDate ? c.endDate : c.startDate;
    if (rangesOverlapInclusive(c.startDate, cEnd, needStart, end)) return false;
  }
  return true;
}

function locationMatches(
  worker: WorkerCapacityInput,
  country: string | null,
): boolean {
  if (!country) return true; // no stated country → location is not a gap axis
  if (worker.locationCountry && norm(worker.locationCountry) === norm(country)) {
    return true;
  }
  return worker.preferences.willingToRelocate === true;
}

/** Supervision capability: coordinating profession or supervision skills. */
const SUPERVISION_PROFESSIONS = new Set(["foreman", "site_manager"]);
const SUPERVISION_SKILLS = new Set([
  "site-supervision",
  "site-management",
  "team-coordination",
]);

export function workerCanSupervise(worker: WorkerCapacityInput): boolean {
  if (worker.professions.some((p) => SUPERVISION_PROFESSIONS.has(norm(p)))) {
    return true;
  }
  return worker.skills.some((s) => SUPERVISION_SKILLS.has(norm(s)));
}

/* ------------------------------------------------------------------ */
/* Assessment                                                           */
/* ------------------------------------------------------------------ */

function gap(
  kind: CapacityGapKind,
  requirementId: string,
  subject: string | null,
  required: number,
  matchedWorkerIds: readonly string[],
): CapacityGap {
  return {
    kind,
    requirementId,
    subject,
    required,
    matchedWorkerIds,
    shortfall: Math.max(0, required - matchedWorkerIds.length),
  };
}

function assessRequirement(
  requirement: WorkforceRequirement,
  workers: readonly WorkerCapacityInput[],
  commitmentsByWorker: ReadonlyMap<string, readonly CommitmentRange[]>,
  brigades: readonly BrigadeInput[],
  entry: FutureWorkEntry | undefined,
): RequirementCapacity {
  const needStart = entry?.startDate ?? null;
  const needEnd = entry?.endDate ?? null;
  const country = entry?.location.country ?? null;

  const eligible: string[] = [];
  const busyFit: string[] = [];
  const nearMiss: string[] = [];

  for (const w of workers) {
    const available = isAvailable(w, needStart);
    const fit = workerFitsRequirement(w, requirement);
    const free = isFree(
      commitmentsByWorker.get(w.workerId) ?? w.plannedCommitments,
      needStart,
      needEnd,
    );
    if (fit && available && free) eligible.push(w.workerId);
    else if (fit && available && !free) busyFit.push(w.workerId);
    if (
      !fit &&
      requirement.professionSlug !== null &&
      w.professions.some((p) => norm(p) === norm(requirement.professionSlug!))
    ) {
      // (unreachable by construction: profession match implies fit) — kept
      // explicit so a future fit-rule change cannot silently drop near-miss.
      nearMiss.push(w.workerId);
    } else if (
      !fit &&
      requirement.skills.length > 0 &&
      skillCoverage(w, requirement.skills) > 0
    ) {
      // Covers SOME required skills but under the fit bar — training candidate.
      if (available) nearMiss.push(w.workerId);
    }
  }

  const eligibleWorkers = workers.filter((w) => eligible.includes(w.workerId));
  const headcountGap = gap(
    "headcount",
    requirement.id,
    null,
    requirement.headcount,
    eligible,
  );

  const requiredHours = requirement.totalHours;
  const coverableHours =
    requiredHours !== null && requirement.headcount > 0
      ? Math.round(
          (requiredHours * Math.min(eligible.length, requirement.headcount)) /
            requirement.headcount,
        )
      : null;
  const hoursGap: HoursGap = {
    requirementId: requirement.id,
    requiredHours,
    coverableHours,
    shortfallHours:
      requiredHours !== null && coverableHours !== null
        ? Math.max(0, requiredHours - coverableHours)
        : null,
  };

  const skillGaps = requirement.skills.map((skill) =>
    gap(
      "skill",
      requirement.id,
      skill,
      requirement.headcount,
      eligibleWorkers
        .filter((w) => w.skills.some((s) => norm(s) === norm(skill)))
        .map((w) => w.workerId),
    ),
  );

  const certificateGaps = requirement.certificates.map((cert) =>
    gap(
      "certificate",
      requirement.id,
      cert,
      requirement.headcount,
      eligibleWorkers
        .filter((w) => w.certificates.some((c) => certificateMatches(c, cert)))
        .map((w) => w.workerId),
    ),
  );

  const languageGaps = requirement.languages.map((need) =>
    gap(
      "language",
      requirement.id,
      need.lang,
      need.onePerTeamSufficient ? 1 : requirement.headcount,
      eligibleWorkers
        .filter((w) =>
          w.languages.some(
            (l) =>
              norm(l.lang) === norm(need.lang) &&
              languageLevelSatisfies(l.level, need.level),
          ),
        )
        .map((w) => w.workerId),
    ),
  );

  const supervisorGap =
    requirement.kind === "supervisor"
      ? gap(
          "supervisor",
          requirement.id,
          null,
          requirement.headcount,
          workers
            .filter(
              (w) =>
                workerCanSupervise(w) &&
                isAvailable(w, needStart) &&
                isFree(
                  commitmentsByWorker.get(w.workerId) ?? w.plannedCommitments,
                  needStart,
                  needEnd,
                ),
            )
            .map((w) => w.workerId),
        )
      : null;

  const locationGap = country
    ? gap(
        "location",
        requirement.id,
        country,
        requirement.headcount,
        eligibleWorkers
          .filter((w) => locationMatches(w, country))
          .map((w) => w.workerId),
      )
    : null;

  let brigadeGap: CapacityGap | null = null;
  if (requirement.teamShape === "brigade") {
    const eligibleSet = new Set(eligible);
    let best: { brigadeId: string; members: string[] } | null = null;
    for (const b of [...brigades].sort((a, z) =>
      a.brigadeId < z.brigadeId ? -1 : 1,
    )) {
      const members = b.memberWorkerIds.filter((id) => eligibleSet.has(id));
      if (best === null || members.length > best.members.length) {
        best = { brigadeId: b.brigadeId, members };
      }
    }
    brigadeGap = gap(
      "brigade",
      requirement.id,
      best?.brigadeId ?? null,
      requirement.headcount,
      best?.members ?? [],
    );
  }

  return {
    requirementId: requirement.id,
    requirementKind: requirement.kind,
    requirementStatus: requirement.status,
    entryId: requirement.entryId,
    needStartDate: needStart,
    needEndDate: needEnd,
    headcountRequired: requirement.headcount,
    matchedWorkerIds: eligible,
    busyMatchedWorkerIds: busyFit,
    nearMissWorkerIds: nearMiss,
    headcountGap,
    hoursGap,
    skillGaps,
    certificateGaps,
    languageGaps,
    supervisorGap,
    locationGap,
    brigadeGap,
    partnerNeeded: requirement.partnerNeeded,
  };
}

/**
 * Assess every non-rejected requirement against the supply. Rejected lines
 * are excluded (a human said no); everything else — including unconfirmed
 * suggestions — is assessed, but the per-line status travels with the
 * result so the recommendation layer can gate on human confirmation.
 */
export function assessCapacity(
  requirements: readonly WorkforceRequirement[],
  supply: WorkforceSupply,
  options?: { readonly entries?: readonly FutureWorkEntry[] },
): CapacityAssessment {
  const entriesById = new Map<string, FutureWorkEntry>();
  for (const e of options?.entries ?? []) entriesById.set(e.id, e);

  // Merge explicit assignment ranges into each worker's commitments.
  const commitmentsByWorker = new Map<string, CommitmentRange[]>();
  for (const w of supply.workers) {
    commitmentsByWorker.set(w.workerId, [...w.plannedCommitments]);
  }
  for (const a of supply.assignments) {
    if (!a.startDate) continue;
    const list = commitmentsByWorker.get(a.workerId);
    if (!list) continue;
    list.push({ startDate: a.startDate, endDate: a.endDate });
  }

  const assessed = requirements
    .filter((r) => r.status !== "rejected")
    .map((r) =>
      assessRequirement(
        r,
        supply.workers,
        commitmentsByWorker,
        supply.brigades,
        entriesById.get(r.entryId),
      ),
    );

  return {
    requirements: assessed,
    workersConsidered: supply.workers.length,
    totalHeadcountShortfall: assessed.reduce(
      (sum, r) => sum + r.headcountGap.shortfall,
      0,
    ),
  };
}
