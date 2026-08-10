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
    "booking_proposed" | "booking_accepted" | "booking_declined"
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

    if (eventType === "booking_proposed") {
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
