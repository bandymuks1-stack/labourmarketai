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

// ── Document & Evidence Engine v3 emitters (20260817121000) ─────────────────
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
    const { data } = await admin
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
      const { data } = await admin
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
