import { describe, expect, it } from "vitest";

import {
  ABSENCE_MANAGER_ROLES,
  canReviewAbsences,
  pendingAbsenceReviews,
  type WorkerAbsence,
} from "@/lib/leave/absences-model";
import {
  SPINE_SIGNALS,
  buildSpineNotifications,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";

/**
 * ABSENCE REVIEW AWARENESS — "how does the employer know?"
 *
 * A worker could file an absence and nothing anywhere told the person who has
 * to approve it. Every other waiting-on-you event (bookings, service requests,
 * invitations, messages) had a spine row; absence review did not, so the
 * request sat until someone happened to open /dashboard/absences.
 *
 * The subtlety is WHO must be told. `worker_absences`'s SELECT policy is
 * `self OR (caller_manages_worker(worker_id) AND status='requested') OR
 * is_admin()`. A read filtered only on `status='requested'` therefore returns
 * the caller's OWN request too — so the naive count tells a worker that their
 * own time off is waiting for their review, and no review can ever clear it.
 */

const absence = (
  id: string,
  workerId: string,
  status: WorkerAbsence["status"] = "requested",
): WorkerAbsence => ({
  id,
  workerId,
  workerName: null,
  absenceType: "annual_leave",
  startDate: "2026-08-10",
  endDate: "2026-08-12",
  halfDay: false,
  note: null,
  status,
});

const zeroCounts: SpineCounts = {
  pendingInvitations: 0,
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  openTaskAttention: 0,
  newJobMatches: 0,
  pendingAbsenceReviews: 0,
};

describe("who is asked to review an absence", () => {
  it("a manager sees the requests of workers they manage", () => {
    const rows = [absence("a", "worker-1"), absence("b", "worker-2")];
    expect(pendingAbsenceReviews(rows, "manager-worker")).toHaveLength(2);
  });

  it("NEVER counts the caller's own request as something to review", () => {
    const rows = [absence("own", "me"), absence("theirs", "worker-1")];
    const reviews = pendingAbsenceReviews(rows, "me");
    expect(reviews.map((a) => a.id)).toEqual(["theirs"]);
  });

  it("a reviewer with no worker record still sees every pending row", () => {
    const rows = [absence("a", "worker-1")];
    expect(pendingAbsenceReviews(rows, null)).toHaveLength(1);
  });

  it("a resolved request stops being pending — approve/reject clears it", () => {
    const rows = [
      absence("approved", "worker-1", "approved"),
      absence("rejected", "worker-2", "rejected"),
      absence("cancelled", "worker-3", "cancelled"),
      absence("open", "worker-4", "requested"),
    ];
    expect(pendingAbsenceReviews(rows, null).map((a) => a.id)).toEqual(["open"]);
  });

  it("only company / agency roles are ever asked to review", () => {
    expect(canReviewAbsences("company")).toBe(true);
    expect(canReviewAbsences("agency")).toBe(true);
    expect(canReviewAbsences("worker")).toBe(false);
    expect(canReviewAbsences("client")).toBe(false);
    expect(canReviewAbsences(null)).toBe(false);
    expect(canReviewAbsences(undefined)).toBe(false);
    expect([...ABSENCE_MANAGER_ROLES]).toEqual(["company", "agency"]);
  });
});

describe("the absence review signal reaches the bell", () => {
  const signal = SPINE_SIGNALS.find((s) => s.id === "pending-absence-reviews");

  it("is in the spine catalogue", () => {
    expect(signal).toBeDefined();
  });

  it("routes to the review surface that clears it", () => {
    expect(signal?.href).toBe("/dashboard/absences");
  });

  it("renders exactly when something is actually waiting", () => {
    expect(
      buildSpineNotifications(zeroCounts, "company").some(
        (n) => n.id === "pending-absence-reviews",
      ),
    ).toBe(false);

    const withOne = buildSpineNotifications(
      { ...zeroCounts, pendingAbsenceReviews: 2 },
      "company",
    ).find((n) => n.id === "pending-absence-reviews");
    expect(withOne?.count).toBe(2);
    expect(withOne?.href).toBe("/dashboard/absences");
  });

  it("ranks below people-waiting-on-you but above passive news", () => {
    const ids = SPINE_SIGNALS.map((s) => s.id);
    expect(ids.indexOf("pending-absence-reviews")).toBeGreaterThan(
      ids.indexOf("pending-bookings"),
    );
    expect(ids.indexOf("pending-absence-reviews")).toBeLessThan(
      ids.indexOf("new-job-matches"),
    );
  });
});
