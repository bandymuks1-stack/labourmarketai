import { z } from "zod";

import { OPPORTUNITY_TYPES } from "@/lib/demand/structured-demand-v2";

/**
 * Zod input schemas for the executable EMPLOYER-side conversation actions
 * (company.* + agency.* — PR-E). Same contract as `worker-schemas.ts`: every
 * dispatched write is validated against one of these server-side BEFORE the
 * canonical handler runs, so an LLM-proposed or hand-crafted payload can never
 * reach a server action with an unexpected shape. Kept isomorphic (no
 * server-only import) so both the dispatcher and the UI can share them.
 *
 * These schemas are SHAPE gates only — the closed-set business validation
 * (work-type slugs, market countries, accommodation enums, invite-email rules,
 * shortlist reason requirements, RLS ownership…) stays in the canonical
 * lib/demand / lib/scouting / lib/booking / lib/agency layer, which remains
 * the single authority. Nothing here is a second copy of that logic.
 */

const uuid = z.string().uuid();
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Create a demand on the ONE canonical structured-demand intake
 * (`customer_requests`, doctrine §17) via the existing draft/submit chain:
 *   - mode "submit" → `submitDemandRequestAction` (status becomes 'submitted')
 *   - mode "draft"  → `saveDemandDraftAction`     (status becomes 'draft')
 * A draft is only defined for the company_request kind (the agency-offer
 * wizard has its own payload shape), so mode "draft" requires the
 * hire_workers intent. `description` is REQUIRED — an empty need is never
 * persisted (§7), mirroring the canonical action's own guard.
 */
/** The demand fields WITHOUT the web-chat `mode` switch — exported so the
 *  capability layer can reuse the exact shape (its draft is a token preview,
 *  not a persisted `customer_requests` draft row; see registry). A refined
 *  schema cannot be `.extend()`ed, hence the split. */
export const companyCreateDemandFields = z.object({
  intent: z.enum(["hire_workers", "partner"]).default("hire_workers"),
  description: z.string().trim().min(3).max(4000),
  role: z.string().trim().max(120).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  skills: z.string().trim().max(4000).nullable().optional(),
  urgency: z.enum(["flexible", "this_week", "urgent"]).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  /** Work-type slug — validated against the shared taxonomy canonically. */
  workType: z.string().trim().max(64).nullable().optional(),
  country: z.string().trim().length(2).nullable().optional(),
  teamSize: z.number().int().min(1).max(100000).nullable().optional(),
  accommodation: z
    .enum(["provided_free", "provided_paid", "provided_deducted", "not_provided"])
    .nullable()
    .optional(),
  transport: z
    .enum(["provided", "compensated", "not_provided", "unknown"])
    .nullable()
    .optional(),
  /** DECLARED opportunity type (closed set shared with the structured demand
   *  cluster) — internship / apprenticeship / temporary assignment … Never
   *  inferred from the description; absent = the employer stated none. */
  opportunityType: z.enum(OPPORTUNITY_TYPES).nullable().optional(),
});

export const companyCreateDemandSchema = z
  .object({
    intent: z.enum(["hire_workers", "partner"]).default("hire_workers"),
    mode: z.enum(["draft", "submit"]).default("submit"),
    description: z.string().trim().min(3).max(4000),
    role: z.string().trim().max(120).nullable().optional(),
    location: z.string().trim().max(120).nullable().optional(),
    skills: z.string().trim().max(4000).nullable().optional(),
    urgency: z.enum(["flexible", "this_week", "urgent"]).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    /** Work-type slug — validated against the shared taxonomy canonically. */
    workType: z.string().trim().max(64).nullable().optional(),
    country: z.string().trim().length(2).nullable().optional(),
    teamSize: z.number().int().min(1).max(100000).nullable().optional(),
    accommodation: z
      .enum(["provided_free", "provided_paid", "provided_deducted", "not_provided"])
      .nullable()
      .optional(),
    transport: z
      .enum(["provided", "compensated", "not_provided", "unknown"])
      .nullable()
      .optional(),
    /** Same declared opportunity type as `companyCreateDemandFields`. */
    opportunityType: z.enum(OPPORTUNITY_TYPES).nullable().optional(),
    /** Stated start day (ISO) → `structured_v2.time.start_earliest`. */
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    /** Stated end day (ISO) → `structured_v2.time.end_date`. */
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((v) => v.mode !== "draft" || v.intent === "hire_workers", {
    message: "drafts exist only for the hire_workers intent",
    path: ["mode"],
  });

/** §19 explicit human act: confirm the offline-recognized skill set on the
 *  company's OWN demand (canonical: `confirmRecognizedNeedAction`). */
export const companyConfirmNeedSchema = z.object({ requestId: uuid });

/** Close the company's own demand (canonical: `closeDemandAction`). */
export const companyCloseDemandSchema = z.object({ requestId: uuid });

/** Reopen a previously closed demand (canonical: `reopenDemandAction`). */
export const companyReopenDemandSchema = z.object({ requestId: uuid });

export const companyShortlistCandidateSchema = z.object({
  requestId: uuid,
  workerId: uuid,
  status: z.enum(["saved", "interested", "not_fit", "reviewed"]),
  /** Optional internal note; `undefined` preserves the stored one (extension B).
   *  The `not_fit`-requires-reason rule stays server-side in lib/scouting. */
  note: z.string().trim().max(500).nullable().optional(),
});

export const companyContactWorkerSchema = z.object({
  requestId: uuid,
  workerId: uuid,
});

export const companyProposeBookingSchema = z.object({
  requestId: uuid,
  workerId: uuid,
  startDate: isoDate.nullable().optional(),
  expectedEndDate: isoDate.nullable().optional(),
  locationCountry: z.string().trim().length(2).nullable().optional(),
  role: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const companyAssignWorkerSchema = z.object({
  projectId: uuid,
  workerProfileId: uuid,
});

/** §11 what-if MOVE: the person leaves project X for project Y. Both ids are
 *  re-checked by the two canonical RPCs (assign, end); X ≠ Y here. */
export const companyMoveWorkerSchema = z
  .object({
    workerProfileId: uuid,
    fromProjectId: uuid,
    toProjectId: uuid,
  })
  .refine((v) => v.fromProjectId !== v.toProjectId, { message: "same project" });

export const agencyInviteClientSchema = z.object({
  /** Optional since 2026-09-04: the chat never knows the company id — the
   *  executor resolves the ACTIVE workspace's company (M-P0-3, the same
   *  resolver every employer write uses). A supplied id is still re-checked
   *  by the RPC (`owns_company` + staffing_agency). */
  agencyCompanyId: uuid.optional(),
  /** Shape gate only — the canonical `validateInviteEmail` stays authoritative. */
  email: z.string().trim().email().max(254),
});

/** Roster invitation by e-mail (company or agency; the active workspace's
 *  company is resolved server-side). */
export const companyInviteWorkerSchema = z.object({
  email: z.string().trim().email().max(254),
  note: z.string().trim().max(500).nullable().optional(),
});

// ── EDUCATION (owner contract 2026-09-04 §15) ───────────────────────────────
// The institution's commands existed only as page forms; these are the SAME
// server actions (`lib/education/program-actions.ts`, the invitation layer)
// reached by sentence through the ONE dispatcher. Closed-set validation
// (profession / education-type slugs, manager authority, capability) stays
// in the RPCs.
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const educationCreateProgrammeSchema = z.object({
  name: z.string().trim().min(2).max(160),
  targetProfessionSlug: z.string().trim().max(80).nullable().optional(),
  educationTypeSlug: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

export const educationCreateCohortSchema = z.object({
  programId: uuid,
  name: z.string().trim().min(1).max(120),
  startsOn: isoDay.nullable().optional(),
  endsOn: isoDay.nullable().optional(),
});

export const educationInviteLearnerSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).nullable().optional(),
});

export const educationAssignLearnerSchema = z.object({
  cohortId: uuid,
  profileId: uuid,
});

/** F2 (owner contract 2026-09-04 §9/§11 seed): the SITE as a project object,
 *  by sentence — "sukurk projektą Roterdame". Shape gate only; the canonical
 *  `createProjectAction` → `insertProjectForCompany` validates the title and
 *  RLS `projects_insert` (owns_company) gates the row. */
export const companyCreateProjectSchema = z.object({
  title: z.string().trim().min(2).max(120),
  city: z.string().trim().max(120).nullable().optional(),
});

/** CLIENT: the decision on an agency's candidate offer (canonical:
 *  `respondCandidateOfferAction` → `respond_agency_candidate_offer_v1`, which
 *  re-checks that the caller owns the demand and the offer is open). */
export const companyRespondOfferSchema = z.object({
  offerId: uuid,
  decision: z.enum(["accepted", "declined"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** A work package (task) on the company's project, by sentence — the shape
 *  gate only; `create_work_task_v2` validates project ownership and limits. */
export const companyCreateTaskSchema = z.object({
  title: z.string().trim().min(3).max(160),
  projectId: uuid.nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  description: z.string().trim().max(2000).nullable().optional(),
});

/** PROGRESS (§11): a project stage moved to a real status — the canonical
 *  `updateStageStatusAction` (`set_project_stage_status`) re-checks that the
 *  caller manages the project; `blocked` needs a reason there too. */
export const companyUpdateStageStatusSchema = z.object({
  stageId: uuid,
  status: z.enum(["planned", "in_progress", "blocked", "done", "cancelled"]),
  blockedReason: z.string().trim().max(500).nullable().optional(),
});

export const agencyProposeCandidateSchema = z.object({
  shareId: uuid,
  workerId: uuid,
  note: z.string().trim().max(1000).nullable().optional(),
});

/**
 * Map of action id → schema for the executable employer-side actions
 * (company.* + agency.*). Every id here MUST have a matching executor in
 * `company-executors.ts` and a descriptor in the action registry.
 *
 * Deliberately NOT here (stay deep-link-only / not_executable):
 *   - company.review-candidates / company.who-waits / agency.review-clients /
 *     agency.offer-status / agency.who-waits — read-only navigations; the
 *     conversation routes to the real screen instead of "executing" a read.
 *   - any "publish demand" concept — there is NO canonical publish backend;
 *     worker-board visibility is RLS/RPC-driven (status='submitted' behind the
 *     verified-company gate). Faking a publish action would claim a state
 *     transition the platform does not have (§7).
 */
export const COMPANY_ACTION_SCHEMAS = {
  "company.create-demand": companyCreateDemandSchema,
  "company.confirm-need": companyConfirmNeedSchema,
  "company.close-demand": companyCloseDemandSchema,
  "company.reopen-demand": companyReopenDemandSchema,
  "company.shortlist-candidate": companyShortlistCandidateSchema,
  "company.contact-worker": companyContactWorkerSchema,
  "company.propose-booking": companyProposeBookingSchema,
  "company.assign-worker": companyAssignWorkerSchema,
  "company.move-worker": companyMoveWorkerSchema,
  "company.create-project": companyCreateProjectSchema,
  "company.respond-offer": companyRespondOfferSchema,
  "company.create-task": companyCreateTaskSchema,
  "company.update-stage-status": companyUpdateStageStatusSchema,
  "company.invite-worker": companyInviteWorkerSchema,
  "agency.invite-client": agencyInviteClientSchema,
  "agency.propose-candidate": agencyProposeCandidateSchema,
  "company.create-programme": educationCreateProgrammeSchema,
  "company.create-cohort": educationCreateCohortSchema,
  "company.invite-learner": educationInviteLearnerSchema,
  "company.assign-learner": educationAssignLearnerSchema,
} as const;

export type CompanyActionId = keyof typeof COMPANY_ACTION_SCHEMAS;
