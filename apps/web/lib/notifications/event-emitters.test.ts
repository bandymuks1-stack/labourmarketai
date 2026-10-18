import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Write-path emitters with FACTS: each one produces the notification row
 * through the existing insert path from the facts the write path handed
 * over, and a missing recipient answers `{ delivered: false, reason }`.
 *
 * The fake admin client below is STRICTER than production: production
 * answers an ungranted table with 42501, which `maybeSingle()` used to turn
 * into a null row and a silent `row_unreadable`; this fake THROWS on any
 * table service_role does not hold (verified 2026-09-23), so a regression
 * that reintroduces an admin domain read fails loudly here instead of
 * surfacing as "recipient_unresolved" in production logs.
 */

const GRANTED = new Set([
  "workers",
  "notification_events",
  "notification_preferences",
  "journal_entries",
]);

type Insert = Record<string, unknown>;

const state = {
  inserts: [] as Insert[],
  tables: [] as string[],
  /** What `workers.profile_id` answers for ANY worker id (null = no row). */
  workerProfile: null as string | null,
  insertErrorCode: null as string | null,
};

function fakeAdmin() {
  return {
    from(table: string) {
      state.tables.push(table);
      if (!GRANTED.has(table)) {
        throw new Error(`42501 insufficient_privilege (fake): ${table}`);
      }
      if (table === "workers") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: state.workerProfile ? { profile_id: state.workerProfile } : null,
            error: null,
          }),
        };
        return chain;
      }
      if (table === "notification_events") {
        return {
          insert: async (payload: Insert) => {
            state.inserts.push(payload);
            return {
              error: state.insertErrorCode ? { code: state.insertErrorCode } : null,
            };
          },
        };
      }
      throw new Error(`unexpected table in this test: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock("./notification-preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./notification-preferences")>()),
  // Fail-open path: no stored rows → channel defaults (in-app ON).
  readNotificationPreferencesFor: async () => ({ kind: "ok", rows: [] }),
}));
vi.mock("./email-dispatch", () => ({
  maybeDispatchNotificationEmail: async () => ({ kind: "not_configured" }),
}));
// Read-time digest dependencies — never reached by the write-path emitters.
vi.mock("../data/worker-core", () => ({ getWorkerCoreRow: async () => null }));
vi.mock("@/lib/opportunities/recommendations", () => ({
  getWorkerJobRecommendations: async () => ({ kind: "unavailable" }),
}));
vi.mock("../worker/weekly-intelligence", () => ({
  getWeeklyPersonalIntelligence: async () => ({ kind: "unavailable" }),
}));

import {
  INTEREST_UNDELIVERED,
  NOTIFICATION_UNDELIVERED,
  emitAbsenceNotification,
  emitBookingNotification,
  emitDemandInterestNotification,
  emitDemandInterestResponseNotification,
  emitEngagementCreatedNotification,
  emitEngagementEndedNotification,
  emitWorkTaskAssignedNotification,
} from "./event-emitters";
import { resetNotificationStoreWriteBlock } from "./events";

const OWNER = "11111111-1111-4111-8111-111111111111";
const WORKER_PROFILE = "22222222-2222-4222-8222-222222222222";
const WORKER_ID = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";
const ENGAGEMENT = "55555555-5555-4555-8555-555555555555";
const TASK = "66666666-6666-4666-8666-666666666666";
const ABSENCE = "77777777-7777-4777-8777-777777777777";
const SIGNAL = "88888888-8888-4888-8888-888888888888";
const MANAGER = "99999999-9999-4999-8999-999999999999";

const bookingFacts = {
  bookingId: BOOKING,
  ownerProfileId: OWNER,
  workerId: WORKER_ID,
  startDate: "2026-10-01",
  locationCountry: "LT",
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.inserts = [];
  state.tables = [];
  state.workerProfile = WORKER_PROFILE;
  state.insertErrorCode = null;
  resetNotificationStoreWriteBlock();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

/** The row shape the existing insert path writes (events.ts). */
function expectRow(
  row: Insert | undefined,
  expected: {
    recipient: string;
    eventType: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, string>;
  },
): void {
  expect(row).toEqual({
    recipient_profile_id: expected.recipient,
    event_type: expected.eventType,
    entity_type: expected.entityType,
    entity_id: expected.entityId,
    dedupe_key: `${expected.eventType}:${expected.entityId}`,
    metadata: expected.metadata,
  });
}

function undeliveredMarker(eventType: string, reason: string): void {
  expect(warn).toHaveBeenCalledWith(NOTIFICATION_UNDELIVERED, { eventType, reason });
}

describe("booking events from facts", () => {
  it("booking_proposed goes to the WORKER, resolved through the granted workers table", async () => {
    const result = await emitBookingNotification(bookingFacts, "booking_proposed");
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expectRow(state.inserts[0], {
      recipient: WORKER_PROFILE,
      eventType: "booking_proposed",
      entityType: "booking_request",
      entityId: BOOKING,
      metadata: { country: "LT", startDate: "2026-10-01" },
    });
    expect(state.tables).toContain("workers");
    expect(warn).not.toHaveBeenCalled();
  });

  it("booking_accepted goes to the OWNER straight from the facts — no workers read", async () => {
    const result = await emitBookingNotification(bookingFacts, "booking_accepted");
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expectRow(state.inserts[0], {
      recipient: OWNER,
      eventType: "booking_accepted",
      entityType: "booking_request",
      entityId: BOOKING,
      metadata: { country: "LT", startDate: "2026-10-01" },
    });
    expect(state.tables).not.toContain("workers");
  });

  it("booking_withdrawn goes to the worker; booking_declined to the owner", async () => {
    await emitBookingNotification(bookingFacts, "booking_withdrawn");
    await emitBookingNotification(bookingFacts, "booking_declined");
    expect(state.inserts.map((r) => r.recipient_profile_id)).toEqual([WORKER_PROFILE, OWNER]);
  });

  it("no owner in the facts → recipient_unresolved, logged, nothing inserted", async () => {
    const result = await emitBookingNotification(
      { ...bookingFacts, ownerProfileId: null },
      "booking_declined",
    );
    expect(result).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(state.inserts).toEqual([]);
    undeliveredMarker("booking_declined", "recipient_unresolved");
  });

  it("a worker id that resolves to no profile → recipient_unresolved", async () => {
    state.workerProfile = null;
    const result = await emitBookingNotification(bookingFacts, "booking_proposed");
    expect(result).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(state.inserts).toEqual([]);
    undeliveredMarker("booking_proposed", "recipient_unresolved");
  });

  it("null facts (the caller could not read its row) never guess a recipient", async () => {
    const result = await emitBookingNotification(
      { bookingId: BOOKING, ownerProfileId: null, workerId: null, startDate: null, locationCountry: null },
      "booking_proposed",
    );
    expect(result).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(state.tables).not.toContain("workers");
  });

  it("an already-stored fact is delivered:true with outcome duplicate", async () => {
    state.insertErrorCode = "23505";
    const result = await emitBookingNotification(bookingFacts, "booking_accepted");
    expect(result).toEqual({ delivered: true, outcome: "duplicate", recipients: 1 });
    expect(warn).not.toHaveBeenCalled();
  });

  it("an unknown insert failure is delivered:false insert_failed, and logged", async () => {
    state.insertErrorCode = "XX000";
    const result = await emitBookingNotification(bookingFacts, "booking_accepted");
    expect(result).toEqual({ delivered: false, reason: "insert_failed" });
    expect(warn).toHaveBeenCalledWith(NOTIFICATION_UNDELIVERED, {
      eventType: "booking_accepted",
      reason: "insert_failed",
      detail: "XX000",
    });
  });

  it("an absent store is the named feature_unavailable degradation, unlogged", async () => {
    state.insertErrorCode = "42P01";
    const result = await emitBookingNotification(bookingFacts, "booking_accepted");
    expect(result).toEqual({ delivered: false, reason: "feature_unavailable" });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("engagement_created from the same booking facts", () => {
  it("BOTH parties hear it, keyed on the booking id", async () => {
    const result = await emitEngagementCreatedNotification(bookingFacts);
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 2 });
    expect(state.inserts).toHaveLength(2);
    expectRow(state.inserts[0], {
      recipient: OWNER,
      eventType: "engagement_created",
      entityType: "engagement",
      entityId: BOOKING,
      metadata: { country: "LT", startDate: "2026-10-01" },
    });
    expect(state.inserts[1]?.recipient_profile_id).toBe(WORKER_PROFILE);
  });

  it("one resolvable party still counts as delivered; none is a logged miss", async () => {
    state.workerProfile = null;
    const partial = await emitEngagementCreatedNotification(bookingFacts);
    expect(partial).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    state.inserts = [];
    const none = await emitEngagementCreatedNotification({ ...bookingFacts, ownerProfileId: null });
    expect(none).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(state.inserts).toEqual([]);
    undeliveredMarker("engagement_created", "recipient_unresolved");
  });
});

describe("engagement_ended from facts the end action resolved", () => {
  it("worker acted → the company owner pointer the caller read is the recipient", async () => {
    const result = await emitEngagementEndedNotification({
      engagementId: ENGAGEMENT,
      actorSide: "worker",
      companyOwnerProfileId: OWNER,
      workerId: WORKER_ID,
    });
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expectRow(state.inserts[0], {
      recipient: OWNER,
      eventType: "engagement_ended",
      entityType: "engagement",
      entityId: ENGAGEMENT,
      metadata: {},
    });
    // The company owner is never looked up through `workers`.
    expect(state.tables).not.toContain("workers");
  });

  it("company acted → the worker is resolved through the granted workers table", async () => {
    const result = await emitEngagementEndedNotification({
      engagementId: ENGAGEMENT,
      actorSide: "company",
      companyOwnerProfileId: null,
      workerId: WORKER_ID,
    });
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expect(state.inserts[0]?.recipient_profile_id).toBe(WORKER_PROFILE);
  });

  it("worker acted with no owner pointer → recipient_unresolved, logged", async () => {
    const result = await emitEngagementEndedNotification({
      engagementId: ENGAGEMENT,
      actorSide: "worker",
      companyOwnerProfileId: null,
      workerId: WORKER_ID,
    });
    expect(result).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(state.inserts).toEqual([]);
    undeliveredMarker("engagement_ended", "recipient_unresolved");
  });
});

describe("work_task_assigned from the stored assignee", () => {
  it("the new assignee hears it, with the due date as the safe render hint", async () => {
    const result = await emitWorkTaskAssignedNotification({
      taskId: TASK,
      assigneeProfileId: WORKER_PROFILE,
      actorProfileId: MANAGER,
      dueAt: "2026-10-03T00:00:00+00:00",
    });
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expectRow(state.inserts[0], {
      recipient: WORKER_PROFILE,
      eventType: "work_task_assigned",
      entityType: "work_task",
      entityId: TASK,
      metadata: { startDate: "2026-10-03" },
    });
  });

  it("a self-assignment is the unlogged self_action silence", async () => {
    const result = await emitWorkTaskAssignedNotification({
      taskId: TASK,
      assigneeProfileId: MANAGER,
      actorProfileId: MANAGER,
      dueAt: null,
    });
    expect(result).toEqual({ delivered: false, reason: "self_action" });
    expect(state.inserts).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("no stored assignee → recipient_unresolved, logged", async () => {
    const result = await emitWorkTaskAssignedNotification({
      taskId: TASK,
      assigneeProfileId: null,
      actorProfileId: MANAGER,
      dueAt: null,
    });
    expect(result).toEqual({ delivered: false, reason: "recipient_unresolved" });
    undeliveredMarker("work_task_assigned", "recipient_unresolved");
  });
});

describe("absence events from facts the request/review path resolved", () => {
  const absenceFacts = {
    absenceId: ABSENCE,
    workerId: WORKER_ID,
    requestedByProfileId: WORKER_PROFILE,
    startDate: "2026-11-02",
  };

  it("absence_approved reaches the WORKER (the requester is the same person → one row)", async () => {
    const result = await emitAbsenceNotification(absenceFacts, "absence_approved");
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expectRow(state.inserts[0], {
      recipient: WORKER_PROFILE,
      eventType: "absence_approved",
      entityType: "worker_absence",
      entityId: ABSENCE,
      metadata: { startDate: "2026-11-02" },
    });
  });

  it("absence_rejected also reaches a DIFFERENT requester", async () => {
    const result = await emitAbsenceNotification(
      { ...absenceFacts, requestedByProfileId: MANAGER },
      "absence_rejected",
    );
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 2 });
    expect(state.inserts.map((r) => r.recipient_profile_id)).toEqual([WORKER_PROFILE, MANAGER]);
  });

  it("absence_requested filed by the worker themselves is the approved self_action silence", async () => {
    const result = await emitAbsenceNotification(absenceFacts, "absence_requested");
    expect(result).toEqual({ delivered: false, reason: "self_action" });
    expect(state.inserts).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("absence_requested filed by someone ELSE tells the worker", async () => {
    const result = await emitAbsenceNotification(
      { ...absenceFacts, requestedByProfileId: MANAGER },
      "absence_requested",
    );
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expect(state.inserts[0]?.recipient_profile_id).toBe(WORKER_PROFILE);
  });

  it("no worker in the facts → recipient_unresolved, logged", async () => {
    const result = await emitAbsenceNotification(
      { ...absenceFacts, workerId: null },
      "absence_approved",
    );
    expect(result).toEqual({ delivered: false, reason: "recipient_unresolved" });
    undeliveredMarker("absence_approved", "recipient_unresolved");
  });
});

describe("demand interest (already fact-carrying since #1761) answers the same way", () => {
  it("the demand owner hears it, keyed on the signal row", async () => {
    const result = await emitDemandInterestNotification({
      signalId: SIGNAL,
      ownerProfileId: OWNER,
      actorProfileId: WORKER_PROFILE,
      country: "NL",
    });
    expect(result).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expectRow(state.inserts[0], {
      recipient: OWNER,
      eventType: "demand_interest_expressed",
      entityType: "demand_interest_signal",
      entityId: SIGNAL,
      metadata: { country: "NL" },
    });
  });

  it("no owner → owner_unresolved with the interest marker; self-interest → self_action, unlogged", async () => {
    const miss = await emitDemandInterestNotification({
      signalId: SIGNAL,
      ownerProfileId: null,
      actorProfileId: WORKER_PROFILE,
      country: null,
    });
    expect(miss).toEqual({ delivered: false, reason: "owner_unresolved" });
    expect(warn).toHaveBeenCalledWith(INTEREST_UNDELIVERED, { reason: "owner_unresolved" });
    warn.mockClear();
    const self = await emitDemandInterestNotification({
      signalId: SIGNAL,
      ownerProfileId: OWNER,
      actorProfileId: OWNER,
      country: null,
    });
    expect(self).toEqual({ delivered: false, reason: "self_action" });
    expect(warn).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("the return direction: reviewed reaches the worker; contacted is not_applicable", async () => {
    const reviewed = await emitDemandInterestResponseNotification({
      requestId: BOOKING,
      workerId: WORKER_ID,
      signalId: SIGNAL,
      status: "reviewed",
      actorProfileId: OWNER,
    });
    expect(reviewed).toEqual({ delivered: true, outcome: "written", recipients: 1 });
    expect(state.inserts[0]?.recipient_profile_id).toBe(WORKER_PROFILE);
    const contacted = await emitDemandInterestResponseNotification({
      requestId: BOOKING,
      workerId: WORKER_ID,
      signalId: SIGNAL,
      status: "contacted",
      actorProfileId: OWNER,
    });
    expect(contacted).toEqual({ delivered: false, reason: "not_applicable" });
    expect(state.inserts).toHaveLength(1);
  });
});
