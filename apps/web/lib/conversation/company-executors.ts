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
import { assignWorkerToProjectAction } from "@/lib/projects/actions";
import { inviteClientAction, submitOfferAction, type BridgeActionState } from "@/lib/agency/bridge-actions";
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
      // mapped to success.
      try {
        const row = await saveDemandDraftAction("company_request", {
          title: input.role ?? undefined,
          capabilities: input.description,
          location: input.location ?? undefined,
          timing: input.urgency ?? undefined,
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

  "agency.invite-client": async (input) =>
    mapBridge(
      await inviteClientAction(
        { status: "idle" },
        fd({ agencyCompanyId: input.agencyCompanyId, email: input.email }),
      ),
    ),

  "agency.propose-candidate": async (input) =>
    mapBridge(
      await submitOfferAction(
        { status: "idle" },
        fd({ shareId: input.shareId, workerId: input.workerId, note: input.note ?? "" }),
      ),
    ),
});
