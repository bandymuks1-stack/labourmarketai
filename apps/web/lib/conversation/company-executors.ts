import "server-only";

import { submitDemandRequestAction } from "@/lib/demand/demand-request-actions";
import { saveDemandDraftAction } from "@/lib/demand/demand-drafts-actions";
import {
  confirmRecognizedNeedAction,
  closeDemandAction,
  reopenDemandAction,
} from "@/lib/demand/demand-lifecycle-actions";
import type { DemandLifecycleResult } from "@/lib/demand/demand-lifecycle";
import { setShortlistAction } from "@/lib/scouting/scouting-actions";
import { requestWorkerConversationAction } from "@/lib/communication/request-worker-conversation";
import { proposeBookingAction } from "@/lib/booking/booking-actions";
import { assignWorkerToProjectAction, createProjectAction, endAssignmentAction, type ProjectActionResult } from "@/lib/projects/actions";
import { inviteClientAction, respondCandidateOfferAction, submitOfferAction, type BridgeActionState } from "@/lib/agency/bridge-actions";
import { inviteCompanyWorkerAction } from "@/lib/company/actions";
import { createWorkTaskForChatAction, setWorkTaskStatusForChatAction } from "@/lib/tasks/task-chat-actions";
import { updateStageStatusAction } from "@/lib/projects/stages-actions";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  createCohortAction,
  createProgramAction,
  setCohortMemberAction,
  type ProgramActionState,
} from "@/lib/education/program-actions";
import { createAndSendInvitations } from "@/lib/invitations/actions";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { z } from "zod";

import {
  COMPANY_ACTION_SCHEMAS,
  type CompanyActionId,
} from "@/lib/conversation/company-schemas";
import {
  fd,
  mapKind,
  type ExecCtx,
  type ExecResult,
} from "@/lib/conversation/executor-contract";

/**
 * Employer-side executors (PR-E: company.* + agency.*). Same contract as the
 * worker executors: each is a THIN adapter that validates nothing new of its
 * own — the dispatcher already validated with the zod schema and re-checked
 * roles via dispatch-core — and delegates to the EXISTING canonical server
 * action / RPC wrapper, then normalizes the native result shape into the one
 * ExecResult contract.
 *
 * These NEVER touch the DB directly and NEVER re-implement domain logic; the
 * real write, authorization (RLS + the canonical RPC), rate limits, and audit
 * stay exactly where they are today:
 *
 *   company.create-demand       → lib/demand/demand-request-actions (submit)
 *                                 / lib/demand/demand-drafts-actions (draft)
 *                                 — the SOLE structured-demand intake,
 *                                 customer_requests (§17). No new table, no
 *                                 parallel path.
 *   company.confirm-need        → lib/demand/demand-lifecycle-actions (§19 act)
 *   company.close-demand        → lib/demand/demand-lifecycle-actions
 *   company.reopen-demand       → lib/demand/demand-lifecycle-actions
 *   company.shortlist-candidate → lib/scouting/scouting-actions
 *   company.contact-worker      → lib/communication/request-worker-conversation
 *   company.propose-booking     → lib/booking/booking-actions
 *   company.assign-worker       → lib/projects/actions (assign_worker_to_project)
 *   agency.invite-client        → lib/agency/bridge-actions
 *   agency.propose-candidate    → lib/agency/bridge-actions (submit offer)
 *
 * NOT wired (stay deep-link-only, honestly):
 *   - company.review-candidates, company.who-waits, agency.review-clients,
 *     agency.offer-status, agency.who-waits — read-only navigations; the
 *     conversation deep-links to the real screen.
 *   - a "publish demand" action — there is NO canonical publish backend and
 *     no such registry id. Worker-board visibility is a separate honest state
 *     driven by RLS + the worker RPC (status='submitted' behind the
 *     verified-company gate), not a switch a chat action could flip. Claiming
 *     "published" would be fake success (§7).
 *   - a general "edit demand" — no canonical whole-row edit exists; the §19
 *     confirm + close/reopen transitions above are the real lifecycle writes.
 */

type Infer<Id extends CompanyActionId> = z.infer<(typeof COMPANY_ACTION_SCHEMAS)[Id]>;

/** Normalize the demand-lifecycle result. `nothing-to-confirm` is an honest
 *  no-op (NOT success — nothing was written), surfaced as its own code. */
function mapLifecycle(r: DemandLifecycleResult): ExecResult {
  if (r.kind === "ok") {
    return { ok: true, data: r.status ? { status: r.status } : undefined };
  }
  return {
    ok: false,
    code: mapKind(r.kind),
    message: r.kind === "error" ? r.message : undefined,
  };
}

/** Normalize the agency-bridge tagged state (never fabricates success). */
function mapBridge(r: BridgeActionState): ExecResult {
  if (r.status === "ok") return { ok: true };
  const code =
    r.status === "needs-migration"
      ? "needs_migration"
      : r.status === "forbidden"
        ? "not_authorized"
        : r.status === "not-found"
          ? "not_found"
          : r.status === "invalid"
            ? "invalid"
            : "error";
  return {
    ok: false,
    code,
    message: r.status === "error" ? r.reason : undefined,
  };
}

// Frozen: the dispatcher indexes this record with a user-controlled action id
// (behind an own-property guard) — the record itself must never be mutable.
export const COMPANY_EXECUTORS: {
  readonly [Id in CompanyActionId]: (input: Infer<Id>, ctx: ExecCtx) => Promise<ExecResult>;
} = Object.freeze({
  "company.create-demand": async (input) => {
    if (input.mode === "draft") {
      // Canonical draft leg (save_demand_draft RPC via lib/demand). The draft
      // payload uses the wizard's own keys (title/capabilities/location/
      // timing/notes) — the same aliases getOwnLastDemandPrefill reads back.
      // The canonical helper THROWS on failure; a throw is a failure, never
      // mapped to success. Stage A: this leg INHERITS the employer workspace
      // gate from lib/demand/demand-drafts.ts (requireEmployerCompany on the
      // employer draft kinds), exactly as the submit leg inherits
      // demand-request.ts's gate — executors stay thin, authorization stays
      // in the canonical layer.
      try {
        const row = await saveDemandDraftAction("company_request", {
          title: input.role ?? undefined,
          capabilities: input.description,
          location: input.location ?? undefined,
          timing: input.urgency ?? undefined,
          // HOW MANY workers. The submit leg below has always passed this
          // through to `team_size`; the draft leg did not, so an employer who
          // ticked "save as draft" was told "Išsaugota." while the worker
          // count — the number the whole request is about — was discarded.
          // Sent as a string because the draft payload is string-only.
          teamSize:
            input.teamSize == null ? undefined : String(input.teamSize),
          // The declared opportunity type survives the draft leg too.
          opportunityType: input.opportunityType ?? undefined,
          notes: input.notes ?? undefined,
        });
        return row
          ? { ok: true, data: { requestId: row.id, status: "draft" } }
          : { ok: false, code: "save_failed" };
      } catch {
        return { ok: false, code: "save_failed" };
      }
    }
    const r = await submitDemandRequestAction(input.intent, {
      description: input.description,
      role: input.role ?? undefined,
      location: input.location ?? undefined,
      skills: input.skills ?? undefined,
      urgency: input.urgency ?? undefined,
      notes: input.notes ?? undefined,
      workType: input.workType ?? undefined,
      country: input.country ?? undefined,
      teamSize: input.teamSize ?? undefined,
      accommodation: input.accommodation ?? undefined,
      transport: input.transport ?? undefined,
      // Declared opportunity type → the structured cluster the worker board
      // and the Learning Compass read (`payload.structured_v2`). Absent when
      // the employer stated none — nothing is inferred.
      structuredV2:
        input.opportunityType || input.startDate || input.endDate
          ? {
              ...(input.opportunityType ? { opportunity_type: input.opportunityType } : {}),
              ...(input.startDate || input.endDate
                ? {
                    time: {
                      ...(input.startDate ? { start_earliest: input.startDate } : {}),
                      ...(input.endDate ? { end_date: input.endDate } : {}),
                    },
                  }
                : {}),
            }
          : undefined,
    });
    // The REAL id + status come from the canonical action — never invented.
    return r.ok
      ? { ok: true, data: { requestId: r.requestId, status: "submitted" } }
      : { ok: false, code: r.code };
  },

  "company.confirm-need": async (input, ctx) =>
    mapLifecycle(await confirmRecognizedNeedAction(ctx.locale, input.requestId)),

  "company.close-demand": async (input, ctx) =>
    mapLifecycle(await closeDemandAction(ctx.locale, input.requestId)),

  "company.reopen-demand": async (input, ctx) =>
    mapLifecycle(await reopenDemandAction(ctx.locale, input.requestId)),

  "company.shortlist-candidate": async (input, ctx) => {
    const r = await setShortlistAction(
      ctx.locale,
      input.requestId,
      input.workerId,
      input.status,
      input.note,
    );
    return r.kind === "ok"
      ? { ok: true, data: { status: r.status, note: r.note } }
      : {
          ok: false,
          code: mapKind(r.kind),
          message: r.kind === "error" ? r.message : undefined,
        };
  },

  "company.contact-worker": async (input, ctx) => {
    const r = await requestWorkerConversationAction({
      locale: ctx.locale,
      requestId: input.requestId,
      workerId: input.workerId,
    });
    if (r.ok) return { ok: true, data: { conversationId: r.conversationId } };
    // The canonical decision reasons are already honest snake_case codes;
    // only the auth naming is normalized to the dispatcher's convention.
    return { ok: false, code: r.reason === "not_authenticated" ? "auth" : r.reason };
  },

  "company.propose-booking": async (input, ctx) => {
    const r = await proposeBookingAction({
      locale: ctx.locale,
      requestId: input.requestId,
      workerId: input.workerId,
      startDate: input.startDate ?? null,
      expectedEndDate: input.expectedEndDate ?? null,
      locationCountry: input.locationCountry ?? null,
      role: input.role ?? null,
      note: input.note ?? null,
    });
    return r.kind === "ok"
      ? { ok: true, data: { status: r.status ?? null } }
      : {
          ok: false,
          code: mapKind(r.kind),
          message: r.kind === "error" ? r.message : undefined,
        };
  },

  "company.assign-worker": async (input) => {
    const r = await assignWorkerToProjectAction(
      null,
      fd({ project_id: input.projectId, worker_profile_id: input.workerProfileId }),
    );
    return r.ok
      ? { ok: true, data: r.id ? { id: r.id } : undefined }
      : { ok: false, code: r.code, message: r.message };
  },

  "company.move-worker": async (input) => {
    // §11 WHAT-IF → COMMIT: two canonical writes, in the safe order — the
    // person is assigned to the destination FIRST (`assign_worker_to_project`
    // re-checks project management + roster), and only then the source
    // assignment is ended (`end_worker_project_assignment`, audit trail, no
    // delete). If the second step fails the person is on BOTH projects and
    // the result says so — never "moved" for a half-done move.
    const r = await assignWorkerToProjectAction(
      null,
      fd({ project_id: input.toProjectId, worker_profile_id: input.workerProfileId }),
    );
    if (!r.ok) return { ok: false, code: r.code, message: r.message };
    const ended = await endAssignmentAction(input.fromProjectId, input.workerProfileId);
    return { ok: true, data: { assigned: true, ended: ended.ok } };
  },

  "company.invite-worker": async (input) => {
    // The canonical roster invite (lib/company/actions → invite_company_worker):
    // workspace-gated + capability-checked there, never here. Outcomes are the
    // RPC's own words; only `invited` is a new row — the others are honest
    // no-ops reported as such (never "saved" for something that already was).
    const r = await inviteCompanyWorkerAction(null, fd({ email: input.email, note: input.note ?? "" }));
    if (!r.ok) {
      return {
        ok: false,
        code: r.code === "needs_migration" ? "needs_migration" : r.code === "no_company" ? "not_authorized" : "error",
        message: "message" in r ? r.message : undefined,
      };
    }
    const recorded = r.ok && (r.outcome === "invited" || r.outcome === "already_pending" || r.outcome === "already_linked");
    return recorded
      ? { ok: true, data: { outcome: r.outcome } }
      : { ok: false, code: r.outcome === "not_owner" ? "not_authorized" : "invalid" };
  },

  "company.create-project": async (input, ctx) => {
    // F2 — the SITE as a project object, by sentence. The ONE project-create
    // core (`insertProjectForCompany`) sits behind the canonical server action
    // the company page uses; RLS `projects_insert` (owns_company) gates the
    // row. Never a second insert path.
    const r = await createProjectAction(null, fd({ title: input.title, city: input.city ?? "" }));
    if (!r.ok) return mapProjectCreate(r);
    emitServerFunnelEvent(FUNNEL_EVENTS.firstRealAction, {
      source: "projects-chat",
      route: `/${ctx.locale}/dashboard`,
      metadata: { surface: "projects", step: "project_created", role_context: "company", entity_type: "project" },
    });
    return { ok: true, data: { projectId: r.id ?? null } };
  },

  "company.create-task": async (input, ctx) => {
    // THE ONE task create (lib/tasks/create-task-core.ts) — the tasks page's
    // form inserts through the same core; `create_work_task_v2` re-checks the
    // project and the caller. Outcome names map to the dispatcher's codes.
    const r = await createWorkTaskForChatAction({
      title: input.title,
      description: input.description ?? "",
      priority: input.priority,
      dueDate: input.dueDate ?? "",
      projectId: input.projectId ?? "",
    });
    if (r.kind === "created") {
      emitServerFunnelEvent(FUNNEL_EVENTS.firstRealAction, {
        source: "tasks-chat",
        route: `/${ctx.locale}/dashboard`,
        metadata: { surface: "tasks", step: "task_created", role_context: "company", entity_type: "work_task" },
      });
      return { ok: true, data: { taskId: r.id, projectId: input.projectId ?? null } };
    }
    if (r.kind === "needs_migration") return { ok: false, code: "needs_migration" };
    if (r.kind === "not_authorized") return { ok: false, code: "not_authorized" };
    if (r.kind === "invalid" || r.kind === "not_found" || r.kind === "limit_reached" || r.kind === "cycle") return { ok: false, code: "invalid" };
    return { ok: false, code: "error" };
  },

  "company.update-stage-status": async (input) => {
    // PROGRESS is a real status on a real stage — the SAME action the
    // operations page's stage panel calls; the RPC re-checks project
    // management and refuses `blocked` without a reason.
    const r = await updateStageStatusAction({
      stageId: input.stageId,
      status: input.status,
      blockedReason: input.blockedReason ?? undefined,
    });
    if (r.ok) return { ok: true, data: { status: input.status } };
    if (r.code === "needs_migration") return { ok: false, code: "needs_migration" };
    if (r.code === "auth" || r.code === "not_authorized") return { ok: false, code: "not_authorized" };
    if (r.code === "invalid") return { ok: false, code: "invalid" };
    return { ok: false, code: "error", message: r.message };
  },

  "company.update-task-status": async (input) => {
    // RESULT is a real status on a real task — the SAME core the tasks page's
    // status control calls; the RPC re-checks creator / assignee / manager and
    // refuses to leave `done` / `cancelled`.
    const r = await setWorkTaskStatusForChatAction({ taskId: input.taskId, status: input.status });
    if (r.kind === "updated") return { ok: true, data: { taskId: r.taskId, status: r.status } };
    if (r.kind === "needs_migration") return { ok: false, code: "needs_migration" };
    if (r.kind === "not_authorized") return { ok: false, code: "not_authorized" };
    if (r.kind === "invalid" || r.kind === "invalid_transition" || r.kind === "not_found") return { ok: false, code: "invalid" };
    return { ok: false, code: "error", message: r.message };
  },

  "company.respond-offer": async (input) => {
    // The CLIENT's decision on an agency's offer — the SAME canonical action
    // the scouting page's buttons call; `respond_agency_candidate_offer_v1`
    // re-checks demand ownership and that the offer is still open. On
    // acceptance the RPC proposes the canonical booking to the worker.
    const r = await respondCandidateOfferAction(
      { status: "idle" },
      fd({ offerId: input.offerId, decision: input.decision, note: input.note ?? "" }),
    );
    if (r.status === "ok") return { ok: true, data: { decision: input.decision } };
    if (r.status === "needs-migration") return { ok: false, code: "needs_migration" };
    if (r.status === "forbidden") return { ok: false, code: "not_authorized" };
    if (r.status === "not-found" || r.status === "invalid") return { ok: false, code: "invalid" };
    return { ok: false, code: "error", message: r.status === "error" ? r.reason : undefined };
  },

  "agency.invite-client": async (input) => {
    // The chat never carries a company id: the ACTIVE workspace's company is
    // the agency (M-P0-3 — the one employer resolver). A fail-closed resolve
    // becomes the dispatcher's honest `not_authorized`, never a guess.
    let agencyCompanyId = input.agencyCompanyId ?? null;
    if (!agencyCompanyId) {
      const company = await requireEmployerCompany();
      if (!company.ok) return { ok: false, code: "not_authorized" };
      agencyCompanyId = company.companyId;
    }
    const r = await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId, email: input.email }),
    );
    // Readback for the conversation: the connection is PENDING until the
    // client accepts — the real state, stated as such.
    return r.status === "ok" ? { ok: true, data: { status: "pending" } } : mapBridge(r);
  },

  "agency.propose-candidate": async (input) =>
    mapBridge(
      await submitOfferAction(
        { status: "idle" },
        fd({ shareId: input.shareId, workerId: input.workerId, note: input.note ?? "" }),
      ),
    ),

  // ── EDUCATION (owner contract 2026-09-04 §15) ─────────────────────────────
  // The institution's commands by sentence. The organization is the ACTIVE
  // workspace's (membership-validated resolver — never client-supplied); the
  // RPCs re-check manager authority and the training_provider capability, so
  // a company that is not an institution is refused THERE with a named
  // reason, which the dispatcher reports honestly. Each first real write
  // emits `first_real_action` server-side (the institution's TTFV).
  "company.create-programme": async (input, ctx) => {
    const org = await requireEmployerCompany();
    if (!org.ok) return { ok: false, code: "not_authorized" };
    const r = await createProgramAction(
      { status: "idle" },
      fd({
        organizationId: org.organizationId,
        name: input.name,
        targetProfessionSlug: input.targetProfessionSlug ?? "",
        educationTypeSlug: input.educationTypeSlug ?? "",
        description: input.description ?? "",
      }),
    );
    if (r.status === "ok") emitEducationFirstAction("programme_created", "education_program", ctx.locale);
    return r.status === "ok" ? { ok: true, data: { programId: r.id ?? null } } : mapProgram(r);
  },

  "company.create-cohort": async (input, ctx) => {
    const r = await createCohortAction(
      { status: "idle" },
      fd({
        programId: input.programId,
        name: input.name,
        startsOn: input.startsOn ?? "",
        endsOn: input.endsOn ?? "",
      }),
    );
    if (r.status === "ok") emitEducationFirstAction("cohort_created", "education_cohort", ctx.locale);
    return r.status === "ok" ? { ok: true, data: { cohortId: r.id ?? null } } : mapProgram(r);
  },

  "company.assign-learner": async (input, ctx) => {
    const r = await setCohortMemberAction(
      { status: "idle" },
      fd({ cohortId: input.cohortId, profileId: input.profileId, status: "active" }),
    );
    if (r.status === "ok") emitEducationFirstAction("learner_assigned", "education_cohort_member", ctx.locale);
    return r.status === "ok" ? { ok: true, data: { status: "active" } } : mapProgram(r);
  },

  "company.invite-learner": async (input, ctx) => {
    // The SAME invitation the network panel sends for a learner: a
    // `join_organization` invitation carrying the `student` relationship —
    // accepted by the person, it becomes the institution↔learner link
    // (engagement_contexts, relationship student). The RPC validates the
    // capability (`training_provider`) and the relationship's invitability.
    const org = await requireEmployerCompany();
    if (!org.ok) return { ok: false, code: "not_authorized" };
    const r = await createAndSendInvitations({
      emails: input.email,
      invitationType: "join_organization",
      locale: ctx.locale,
      recipientLocale: ctx.locale,
      organizationId: org.organizationId,
      invitedName: input.name ?? null,
      relationshipSlug: "student",
    });
    // Readback states the REAL delivery: `sent` = provider acknowledged;
    // `created` = stored, no e-mail configured (share the link) — never a
    // fabricated "e-mail sent".
    if (r.status !== "ok") return { ok: false, code: "not_authorized" };
    const first = r.results[0];
    if (!first) return { ok: false, code: r.invalid.length > 0 ? "invalid" : "error" };
    if (r.status === "ok" && (first.outcome === "created" || first.outcome === "sent")) {
      emitEducationFirstAction("learner_invited", "invitation", ctx.locale);
      return { ok: true, data: { outcome: first.outcome, emailConfigured: r.emailConfigured } };
    }
    return { ok: false, code: first.outcome === "invalid_email" ? "invalid" : "error", message: first.outcome };
  },
});

/** The canonical project-create result → the dispatcher's honest codes. */
function mapProjectCreate(r: Extract<ProjectActionResult, { ok: false }>): ExecResult {
  if (r.code === "needs_migration") return { ok: false, code: "needs_migration" };
  if (r.code === "invalid") return { ok: false, code: "invalid" };
  if (r.code === "error") return { ok: false, code: "error", message: r.message };
  return { ok: false, code: "not_authorized" };
}

function mapProgram(r: ProgramActionState): ExecResult {
  if (r.status === "forbidden") return { ok: false, code: "not_authorized" };
  if (r.status === "invalid") return { ok: false, code: "invalid" };
  return { ok: false, code: "error", message: r.status === "error" ? r.reason : undefined };
}

function emitEducationFirstAction(step: string, entityType: string, locale: string): void {
  emitServerFunnelEvent(FUNNEL_EVENTS.firstRealAction, {
    source: "education-chat",
    route: `/${locale}/dashboard`,
    metadata: {
      surface: "education",
      step,
      role_context: "company",
      entity_type: entityType,
    },
  });
}
