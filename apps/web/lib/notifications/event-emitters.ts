import "server-only";

/**
 * DOMAIN EVENT EMITTERS — the glue between a completed domain write and the
 * durable notification store.
 *
 * Every function here:
 *   - runs with the ADMIN client (the table grants authenticated no INSERT);
 *   - is called AFTER the domain RPC succeeded, fire-and-forget (a booking
 *     accept must never fail because its notification could not be written);
 *   - resolves the RECIPIENT from the domain rows themselves (never from
 *     caller-supplied ids alone — the caller knows who acted, the row knows
 *     who must hear about it);
 *   - never throws.
 *
 * RECIPIENT DECISIONS, STATED (v1):
 *   booking_proposed    → the WORKER the employer proposed to.
 *   booking_accepted    → the booking OWNER (employer) — the worker acted.
 *   booking_declined    → the booking OWNER (employer).
 *   engagement_created  → BOTH parties: a new engagement changes both diaries.
 *   absence_requested   → the WORKER, only when someone ELSE filed it for
 *                         them. The manager-side "requests awaiting review"
 *                         signal stays with the derived spine count
 *                         (pending-absence-reviews) — that is the correct
 *                         shape for "N need attention now", and duplicating
 *                         it durably per-manager would need an org-membership
 *                         fan-out this v1 deliberately does not attempt.
 *   absence_approved /
 *   absence_rejected    → the WORKER (and the requester, if different) — the
 *                         exact "outcome the offline worker never learns
 *                         about" gap the durable store exists to close.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_EXPIRING_WINDOW_DAYS } from "@/lib/config/documents";
import {
  emitNotificationEventInBackground,
  type NotificationEventType,
} from "./events";

type AdminClient = ReturnType<typeof createAdminClient>;

async function workerProfileId(
  admin: AdminClient,
  workerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("workers")
    .select("profile_id")
    .eq("id", workerId)
    .maybeSingle();
  return (data as { profile_id?: string } | null)?.profile_id ?? null;
}

/** Booking lifecycle events. `bookingId` is the booking_requests row id. */
export async function emitBookingNotification(
  bookingId: string,
  eventType: Extract<
    NotificationEventType,
    "booking_proposed" | "booking_accepted" | "booking_declined" | "booking_withdrawn"
  >,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("booking_requests")
      .select("owner_id, worker_id, start_date, location_country")
      .eq("id", bookingId)
      .maybeSingle();
    const row = data as {
      owner_id?: string;
      worker_id?: string;
      start_date?: string | null;
      location_country?: string | null;
    } | null;
    if (!row) return;

    const metadata = {
      country: row.location_country ?? undefined,
      startDate: row.start_date ?? undefined,
    };

    // The COMPANY acts on these two — the worker is who must hear about it.
    // A withdrawn proposal is v2's first gap: the worker who saw the offer
    // otherwise finds a silently vanished row.
    if (eventType === "booking_proposed" || eventType === "booking_withdrawn") {
      const worker = row.worker_id
        ? await workerProfileId(admin, row.worker_id)
        : null;
      if (!worker) return;
      emitNotificationEventInBackground(admin, {
        recipientProfileId: worker,
        eventType,
        entityType: "booking_request",
        entityId: bookingId,
        metadata,
      });
      return;
    }

    if (!row.owner_id) return;
    emitNotificationEventInBackground(admin, {
      recipientProfileId: row.owner_id,
      eventType,
      entityType: "booking_request",
      entityId: bookingId,
      metadata,
    });
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/** Engagement creation — both parties hear it. Resolved from the booking the
 *  engagement was created from (v3 accepts create them in one transaction). */
export async function emitEngagementCreatedNotification(
  bookingId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("booking_requests")
      .select("owner_id, worker_id, start_date, location_country")
      .eq("id", bookingId)
      .maybeSingle();
    const row = data as {
      owner_id?: string;
      worker_id?: string;
      start_date?: string | null;
      location_country?: string | null;
    } | null;
    if (!row) return;
    const metadata = {
      country: row.location_country ?? undefined,
      startDate: row.start_date ?? undefined,
    };
    const recipients = new Set<string>();
    if (row.owner_id) recipients.add(row.owner_id);
    const worker = row.worker_id
      ? await workerProfileId(admin, row.worker_id)
      : null;
    if (worker) recipients.add(worker);
    for (const recipientProfileId of recipients) {
      emitNotificationEventInBackground(admin, {
        recipientProfileId,
        eventType: "engagement_created",
        entityType: "engagement",
        // v1 carries the BOOKING id as the entity: it is the row both sides
        // can already open, and the engagement id is not returned by the RPC.
        entityId: bookingId,
        metadata,
      });
    }
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/**
 * Engagement END — v2's second gap. The COUNTERPARTY hears it durably; the
 * actor already watched it happen on their own screen.
 *
 * Recipient resolution mirrors the shared end action's authority model: the
 * row itself names both parties, and `actorSide` (server-derived by the RPC,
 * never client-supplied) says which of them acted. worker acted → the
 * company owner hears; company acted → the worker hears.
 *
 * The rendered label stays NEUTRAL about visibility on purpose: whether the
 * company still sees the worker after the end depends on other relationships
 * (the F2 assignment branch), and this emitter has not measured that. The
 * acting surface carries the measured rider; the notification only states
 * the fact that the engagement ended.
 */
export async function emitEngagementEndedNotification(
  engagementId: string,
  actorSide: "company" | "worker",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_worker_engagements")
      .select("company_id, worker_id")
      .eq("id", engagementId)
      .maybeSingle();
    const row = data as { company_id?: string | null; worker_id?: string | null } | null;
    if (!row) return;

    let recipient: string | null = null;
    if (actorSide === "worker") {
      // The company owner hears. companies.profile_id is the owner pointer.
      if (row.company_id) {
        const { data: company } = await admin
          .from("companies")
          .select("profile_id")
          .eq("id", row.company_id)
          .maybeSingle();
        recipient = (company as { profile_id?: string } | null)?.profile_id ?? null;
      }
    } else if (row.worker_id) {
      recipient = await workerProfileId(admin, row.worker_id);
    }
    if (!recipient) return;

    emitNotificationEventInBackground(admin, {
      recipientProfileId: recipient,
      eventType: "engagement_ended",
      entityType: "engagement",
      entityId: engagementId,
      metadata: {},
    });
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/**
 * Task assignment — v4 (train D). The NEW assignee hears it durably; the
 * actor already watched the assignment happen on their own screen, so a
 * self-assignment emits nothing. The recipient is resolved from the TASK
 * ROW read AFTER the domain write succeeded — never from caller input.
 */
export async function emitWorkTaskAssignedNotification(
  taskId: string,
  actorProfileId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("work_tasks")
      .select("assignee_profile_id, due_at")
      .eq("id", taskId)
      .maybeSingle();
    const row = data as {
      assignee_profile_id?: string | null;
      due_at?: string | null;
    } | null;
    const assignee = row?.assignee_profile_id ?? null;
    if (!assignee || assignee === actorProfileId) return;

    emitNotificationEventInBackground(admin, {
      recipientProfileId: assignee,
      eventType: "work_task_assigned",
      entityType: "work_task",
      entityId: taskId,
      metadata: { startDate: row?.due_at?.slice(0, 10) ?? undefined },
    });
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/** Absence lifecycle events. `absenceId` is the worker_absences row id. */
export async function emitAbsenceNotification(
  absenceId: string,
  eventType: Extract<
    NotificationEventType,
    "absence_requested" | "absence_approved" | "absence_rejected"
  >,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("worker_absences")
      .select("worker_id, requested_by, start_date")
      .eq("id", absenceId)
      .maybeSingle();
    const row = data as {
      worker_id?: string;
      requested_by?: string;
      start_date?: string | null;
    } | null;
    if (!row?.worker_id) return;
    const worker = await workerProfileId(admin, row.worker_id);
    if (!worker) return;
    const metadata = { startDate: row.start_date ?? undefined };

    if (eventType === "absence_requested") {
      // Only when someone ELSE filed it for the worker — see the header.
      if (row.requested_by && row.requested_by !== worker) {
        emitNotificationEventInBackground(admin, {
          recipientProfileId: worker,
          eventType,
          entityType: "worker_absence",
          entityId: absenceId,
          metadata,
        });
      }
      return;
    }

    const recipients = new Set<string>([worker]);
    if (row.requested_by && row.requested_by !== worker) {
      recipients.add(row.requested_by);
    }
    for (const recipientProfileId of recipients) {
      emitNotificationEventInBackground(admin, {
        recipientProfileId,
        eventType,
        entityType: "worker_absence",
        entityId: absenceId,
        metadata,
      });
    }
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/* ── Workflow & Approval Engine v1 (canonical engine) ───────────────────────
 *
 * RECIPIENT DECISIONS, STATED (v3):
 *   workflow_step_pending — every approver (and delegate) on the instance's
 *     CURRENT decidable step. Resolved from the engine's own rows, never
 *     from caller-supplied ids. Dedupe is (type, instance) per recipient, so
 *     a person approving on several steps of one request hears once — the
 *     inbox itself stays the exact count.
 *   workflow_decided — the REQUESTER, when their request reaches a terminal
 *     outcome (approved / rejected / cancelled). The label states only that
 *     a decision exists; the outcome is read on the surface.
 *   workflow_delegated — the DELEGATE who just received a slot.
 *   workflow_escalated — the escalation rule's notify_roles members (default
 *     owner/admin). Escalation is a marked SAFE STATE: this event says a
 *     deadline passed — nothing was auto-approved, and approvers can still
 *     decide.
 */

const WORKFLOW_GOVERNANCE_NOTIFY_FALLBACK = ["owner", "admin"] as const;

// The workflow_* tables are proposed by the human-gated engine migration and
// are not in the generated Database types yet — the blessed boundary cast
// (lib/supabase/types.ts convention) until pnpm db:types learns them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asWorkflowClient(admin: AdminClient): any {
  return admin;
}

type WorkflowInstanceLite = {
  readonly id: string;
  readonly organizationId: string;
  readonly requesterProfileId: string | null;
  readonly currentStepOrder: number | null;
  readonly versionId: string | null;
};

async function readWorkflowInstanceLite(
  admin: AdminClient,
  instanceId: string,
): Promise<WorkflowInstanceLite | null> {
  const { data } = await asWorkflowClient(admin)
    .from("workflow_instances")
    .select(
      "id, organization_id, requester_profile_id, current_step_order, version_id",
    )
    .eq("id", instanceId)
    .maybeSingle();
  const row = data as {
    id?: string;
    organization_id?: string;
    requester_profile_id?: string | null;
    current_step_order?: number | null;
    version_id?: string | null;
  } | null;
  if (!row?.id || !row.organization_id) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    requesterProfileId: row.requester_profile_id ?? null,
    currentStepOrder: row.current_step_order ?? null,
    versionId: row.version_id ?? null,
  };
}

/** The approvers (and delegates) of the instance's CURRENT decidable step
 *  durably hear that a request awaits them. Call after a successful start
 *  and after a step handover. */
export async function emitWorkflowStepPendingNotifications(
  instanceId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const instance = await readWorkflowInstanceLite(admin, instanceId);
    if (!instance || instance.currentStepOrder === null) return;

    const { data: stepData } = await asWorkflowClient(admin)
      .from("workflow_instance_steps")
      .select("id, status")
      .eq("instance_id", instance.id)
      .eq("step_order", instance.currentStepOrder)
      .maybeSingle();
    const step = stepData as { id?: string; status?: string } | null;
    if (!step?.id) return;
    if (step.status !== "active" && step.status !== "escalated") return;

    const { data: slotData } = await asWorkflowClient(admin)
      .from("workflow_instance_approvers")
      .select("approver_profile_id, delegated_to_profile_id, decision")
      .eq("instance_step_id", step.id);
    const recipients = new Set<string>();
    for (const raw of (slotData ?? []) as {
      approver_profile_id?: string;
      delegated_to_profile_id?: string | null;
      decision?: string | null;
    }[]) {
      if (raw.decision) continue; // a settled slot needs no summons
      if (raw.approver_profile_id) recipients.add(raw.approver_profile_id);
      if (raw.delegated_to_profile_id) recipients.add(raw.delegated_to_profile_id);
    }
    for (const recipientProfileId of recipients) {
      emitNotificationEventInBackground(admin, {
        recipientProfileId,
        eventType: "workflow_step_pending",
        entityType: "workflow_instance",
        entityId: instance.id,
        metadata: {},
      });
    }
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/** The requester durably hears that their request reached a terminal
 *  outcome. The recipient comes from the instance row itself. */
export async function emitWorkflowDecidedNotification(
  instanceId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const instance = await readWorkflowInstanceLite(admin, instanceId);
    if (!instance?.requesterProfileId) return;
    emitNotificationEventInBackground(admin, {
      recipientProfileId: instance.requesterProfileId,
      eventType: "workflow_decided",
      entityType: "workflow_instance",
      entityId: instance.id,
      metadata: {},
    });
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/** The delegate durably hears they received a slot. The delegate is read
 *  from the actor's own slot row — never from client input. */
export async function emitWorkflowDelegatedNotification(
  instanceId: string,
  actorProfileId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await asWorkflowClient(admin)
      .from("workflow_instance_approvers")
      .select("delegated_to_profile_id")
      .eq("instance_id", instanceId)
      .eq("approver_profile_id", actorProfileId)
      .is("decision", null)
      .maybeSingle();
    const delegate =
      (data as { delegated_to_profile_id?: string | null } | null)
        ?.delegated_to_profile_id ?? null;
    if (!delegate) return;
    emitNotificationEventInBackground(admin, {
      recipientProfileId: delegate,
      eventType: "workflow_delegated",
      entityType: "workflow_instance",
      entityId: instanceId,
      metadata: {},
    });
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/** The escalation rule's notify_roles members durably hear a deadline
 *  passed. Marked + notified ONLY — nothing here (or anywhere) approves. */
export async function emitWorkflowEscalatedNotifications(
  instanceId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const instance = await readWorkflowInstanceLite(admin, instanceId);
    if (!instance) return;

    // The escalated step's authored rule (fallback: governance owner/admin).
    let notifyRoles: readonly string[] = WORKFLOW_GOVERNANCE_NOTIFY_FALLBACK;
    if (instance.versionId && instance.currentStepOrder !== null) {
      const { data } = await asWorkflowClient(admin)
        .from("workflow_version_steps")
        .select("escalation_rule")
        .eq("version_id", instance.versionId)
        .eq("step_order", instance.currentStepOrder)
        .maybeSingle();
      const rule = (data as { escalation_rule?: { notify_roles?: unknown } | null } | null)
        ?.escalation_rule;
      if (rule && Array.isArray(rule.notify_roles) && rule.notify_roles.length > 0) {
        notifyRoles = rule.notify_roles.filter(
          (r): r is string => typeof r === "string",
        );
      }
    }

    const { data: members } = await asWorkflowClient(admin)
      .from("company_memberships")
      .select("profile_id, role, status")
      .eq("organization_id", instance.organizationId)
      .eq("status", "active")
      .in("role", [...notifyRoles]);
    const recipients = new Set<string>();
    for (const raw of (members ?? []) as { profile_id?: string }[]) {
      if (raw.profile_id) recipients.add(raw.profile_id);
    }
    for (const recipientProfileId of recipients) {
      emitNotificationEventInBackground(admin, {
        recipientProfileId,
        eventType: "workflow_escalated",
        entityType: "workflow_instance",
        entityId: instanceId,
        metadata: {},
      });
    }
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}
// ── Document & Evidence Engine v3 emitters (20260817140100) ────────────────
//
// RECIPIENT DECISIONS, STATED (v3):
//   document_ack_assigned  → the ASSIGNEE — someone asked them to confirm a
//                            document version; resolved from the ack row.
//   document_ack_completed → the ASSIGNER — their request was answered;
//                            never emitted when assigner acknowledged their
//                            own assignment (the actor already watched it).
//   document_expiring      → worker scope: the WORKER whose own document
//                            enters the 30-day window (same derivation the
//                            documents page shows); org scope: the register
//                            entry's responsible person (falling back to
//                            its creator). Deduped by the store's UNIQUE
//                            (recipient, type:entity) key, so a document is
//                            durably announced ONCE per validity period —
//                            a renewed document that expires again later is
//                            a recorded v1 limitation, not a silent bug.
// All three stay INERT until the lead applies the v3 constraint widening —
// the CHECK rejects the insert and the fire-and-forget wrapper logs it.

// The document-engine tables ship behind the human-gated 20260817140000
// migration, so they are not in the generated Database types yet — the
// blessed boundary cast (lib/supabase/types.ts convention). RLS/authority
// still hold at runtime; these are admin-client reads by design (emitters).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAnyClient(c: AdminClient): any {
  return c;
}

/** Ack lifecycle events. `ackId` is the document_acknowledgements row id. */
export async function emitDocumentAckNotification(
  ackId: string,
  eventType: Extract<
    NotificationEventType,
    "document_ack_assigned" | "document_ack_completed"
  >,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await asAnyClient(admin)
      .from("document_acknowledgements")
      .select("assignee_profile_id, assigned_by")
      .eq("id", ackId)
      .maybeSingle();
    const row = data as {
      assignee_profile_id?: string;
      assigned_by?: string;
    } | null;
    if (!row) return;

    let recipient: string | null = null;
    if (eventType === "document_ack_assigned") {
      recipient = row.assignee_profile_id ?? null;
    } else if (
      row.assigned_by &&
      row.assigned_by !== row.assignee_profile_id
    ) {
      // Completed → the assigner hears it; the acting assignee does not.
      recipient = row.assigned_by;
    }
    if (!recipient) return;

    emitNotificationEventInBackground(admin, {
      recipientProfileId: recipient,
      eventType,
      entityType: "document_acknowledgement",
      entityId: ackId,
      metadata: {},
    });
  } catch {
    // Emission is an enhancement; the domain write already succeeded.
  }
}

/** True when a date-only string falls inside the (0, window] days-ahead
 *  band: not yet expired, but expiring. Same semantics the documents page
 *  derives (deriveDocumentStatus's 30-day window). */
function isInsideExpiryWindow(dateOnly: string | null, now: Date): boolean {
  if (!dateOnly) return false;
  const until = new Date(`${dateOnly}T23:59:59Z`);
  if (Number.isNaN(until.getTime())) return false;
  const ms = until.getTime() - now.getTime();
  return ms >= 0 && ms < DOCUMENT_EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Durable "your document enters the 30-day expiry window" facts for one
 *  worker's OWN documents. Fire-and-forget from the documents read path. */
export function emitWorkerDocumentExpiringNotifications(workerId: string): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const { data: worker } = await admin
        .from("workers")
        .select("profile_id")
        .eq("id", workerId)
        .maybeSingle();
      const recipient =
        (worker as { profile_id?: string } | null)?.profile_id ?? null;
      if (!recipient) return;

      const { data } = await admin
        .from("worker_documents")
        .select("id, status, valid_until")
        .eq("worker_id", workerId)
        .eq("status", "ready")
        .not("valid_until", "is", null)
        .limit(200);
      const now = new Date();
      for (const row of (data ?? []) as {
        id: string;
        valid_until: string | null;
      }[]) {
        if (!isInsideExpiryWindow(row.valid_until, now)) continue;
        emitNotificationEventInBackground(admin, {
          recipientProfileId: recipient,
          eventType: "document_expiring",
          entityType: "worker_document",
          entityId: row.id,
          metadata: {},
        });
      }
    } catch {
      // Emission is an enhancement; reads must never fail because of it.
    }
  })();
}

/** Durable expiry facts for an org register: the responsible person (or the
 *  creator) hears that an ACTIVE entry enters the window. */
export function emitOrgDocumentExpiringNotifications(
  organizationId: string,
): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const { data } = await asAnyClient(admin)
        .from("org_documents")
        .select("id, expires_on, responsible_profile_id, created_by")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .not("expires_on", "is", null)
        .limit(200);
      const now = new Date();
      for (const row of (data ?? []) as {
        id: string;
        expires_on: string | null;
        responsible_profile_id: string | null;
        created_by: string;
      }[]) {
        if (!isInsideExpiryWindow(row.expires_on, now)) continue;
        const recipient = row.responsible_profile_id ?? row.created_by;
        if (!recipient) continue;
        emitNotificationEventInBackground(admin, {
          recipientProfileId: recipient,
          eventType: "document_expiring",
          entityType: "org_document",
          entityId: row.id,
          metadata: {},
        });
      }
    } catch {
      // Emission is an enhancement; reads must never fail because of it.
    }
  })();
}
