import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * v10 emitters: MESSAGE_RECEIVED and JOURNAL_REVIEW_DECISION, plus the email
 * outcome now surviving `deliver` instead of being discarded.
 *
 * The fake store emulates UNIQUE (recipient_profile_id, dedupe_key), so burst
 * coalescing is proven against the real constraint's behaviour (23505), not
 * assumed. Like the sibling test it THROWS on any table service_role does not
 * hold.
 */

const GRANTED = new Set(["workers", "notification_events", "notification_preferences"]);

type Insert = Record<string, unknown>;

const state = {
  inserts: [] as Insert[],
  seen: new Set<string>(),
  workerProfile: null as string | null,
  prefRows: [] as unknown[],
  email: { kind: "channel_disabled" } as { kind: string; reason?: string },
  emailCalls: 0,
};

function fakeAdmin() {
  return {
    from(table: string) {
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
      return {
        insert: async (payload: Insert) => {
          const key = `${payload.recipient_profile_id}|${payload.dedupe_key}`;
          if (state.seen.has(key)) return { error: { code: "23505" } };
          state.seen.add(key);
          state.inserts.push(payload);
          return { error: null };
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock("./notification-preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./notification-preferences")>()),
  readNotificationPreferencesFor: async () => ({ kind: "ok", rows: state.prefRows }),
}));
vi.mock("./email-dispatch", () => ({
  maybeDispatchNotificationEmail: async () => {
    state.emailCalls += 1;
    return state.email;
  },
}));
vi.mock("../data/worker-core", () => ({ getWorkerCoreRow: async () => null }));
vi.mock("@/lib/opportunities/recommendations", () => ({
  getWorkerJobRecommendations: async () => ({ kind: "unavailable" }),
}));
vi.mock("../worker/weekly-intelligence", () => ({
  getWeeklyPersonalIntelligence: async () => ({ kind: "unavailable" }),
}));

import {
  NOTIFICATION_EMAIL_UNDELIVERED,
  emitJournalReviewDecisionNotification,
  emitMessageReceivedNotifications,
} from "./event-emitters";
import {
  notificationEventHref,
  notificationRenderedType,
  resetNotificationStoreWriteBlock,
} from "./events";
import {
  MESSAGE_COALESCE_WINDOW_MS,
  messageReceivedEntityId,
} from "./message-coalescing";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";
const CONVERSATION = "44444444-4444-4444-8444-444444444444";
const WORKER_ID = "55555555-5555-4555-8555-555555555555";
const ENTRY = "66666666-6666-4666-8666-666666666666";
const T0 = Date.UTC(2026, 9, 2, 12, 0, 0);

let warn: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.inserts = [];
  state.seen = new Set();
  state.workerProfile = OTHER;
  state.prefRows = [];
  state.email = { kind: "channel_disabled" };
  state.emailCalls = 0;
  resetNotificationStoreWriteBlock();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  info.mockRestore();
});

describe("message_received", () => {
  const facts = {
    conversationId: CONVERSATION,
    authorProfileId: AUTHOR,
    participantProfileIds: [AUTHOR, OTHER],
    nowMs: T0,
  };

  it("notifies the counterpart, never the author, with only the thread id as metadata", async () => {
    const res = await emitMessageReceivedNotifications(facts);
    expect(res).toMatchObject({ delivered: true, outcome: "written", recipients: 1 });
    expect(state.inserts).toHaveLength(1);
    const row = state.inserts[0];
    expect(row.recipient_profile_id).toBe(OTHER);
    expect(row.event_type).toBe("message_received");
    expect(row.entity_type).toBe("conversation");
    expect(row.metadata).toEqual({ conversationId: CONVERSATION });
    expect(state.inserts.map((r) => r.recipient_profile_id)).not.toContain(AUTHOR);
  });

  it("skips silently when the author is the only participant (self action)", async () => {
    const res = await emitMessageReceivedNotifications({
      ...facts,
      participantProfileIds: [AUTHOR],
    });
    expect(res).toEqual({ delivered: false, reason: "self_action" });
    expect(state.inserts).toHaveLength(0);
  });

  it("reports recipient_unresolved (logged) when the participants were unreadable", async () => {
    const res = await emitMessageReceivedNotifications({
      ...facts,
      participantProfileIds: [],
    });
    expect(res).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(warn).toHaveBeenCalled();
  });

  it("fans out to every OTHER participant of a group thread", async () => {
    const res = await emitMessageReceivedNotifications({
      ...facts,
      participantProfileIds: [AUTHOR, OTHER, THIRD, OTHER],
    });
    expect(res).toMatchObject({ delivered: true, recipients: 2 });
    expect(state.inserts.map((r) => r.recipient_profile_id).sort()).toEqual(
      [OTHER, THIRD].sort(),
    );
  });

  it("coalesces a burst in one thread into ONE row, and a later window is a new row", async () => {
    const first = await emitMessageReceivedNotifications(facts);
    const burst = await emitMessageReceivedNotifications({ ...facts, nowMs: T0 + 60_000 });
    const burst2 = await emitMessageReceivedNotifications({ ...facts, nowMs: T0 + 120_000 });
    expect(first).toMatchObject({ outcome: "written" });
    expect(burst).toMatchObject({ delivered: true, outcome: "duplicate" });
    expect(burst2).toMatchObject({ delivered: true, outcome: "duplicate" });
    expect(state.inserts).toHaveLength(1);

    const later = await emitMessageReceivedNotifications({
      ...facts,
      nowMs: T0 + MESSAGE_COALESCE_WINDOW_MS,
    });
    expect(later).toMatchObject({ outcome: "written" });
    expect(state.inserts).toHaveLength(2);
  });

  it("two different threads never coalesce with each other", () => {
    const other = "77777777-7777-4777-8777-777777777777";
    expect(messageReceivedEntityId(CONVERSATION, T0)).not.toBe(
      messageReceivedEntityId(other, T0),
    );
    expect(messageReceivedEntityId(CONVERSATION, T0)).toBe(
      messageReceivedEntityId(CONVERSATION, T0 + 1000),
    );
  });

  it("an explicit in-app opt-out suppresses it (approved silence)", async () => {
    state.prefRows = [
      { notificationType: "message_received", channel: "in_app", enabled: false },
    ];
    const res = await emitMessageReceivedNotifications(facts);
    expect(res).toEqual({ delivered: false, reason: "suppressed_preference" });
    expect(state.inserts).toHaveLength(0);
  });

  it("deep-links to the thread, falling back to the inbox for a malformed id", () => {
    expect(notificationEventHref("conversation", { conversationId: CONVERSATION })).toBe(
      `/dashboard/communication/${CONVERSATION}`,
    );
    expect(notificationEventHref("conversation", { conversationId: "../x" })).toBe(
      "/dashboard/communication",
    );
    expect(notificationEventHref("conversation")).toBe("/dashboard/communication");
  });
});

describe("journal_review_decided", () => {
  const base = { entryId: ENTRY, workerId: WORKER_ID, actorProfileId: AUTHOR };

  it.each(["approved", "rejected", "changes_requested"] as const)(
    "tells the worker about a %s decision and carries only the decision",
    async (decision) => {
      const res = await emitJournalReviewDecisionNotification({ ...base, decision });
      expect(res).toMatchObject({ delivered: true, outcome: "written" });
      const row = state.inserts[0];
      expect(row.recipient_profile_id).toBe(OTHER);
      expect(row.event_type).toBe("journal_review_decided");
      expect(row.entity_type).toBe("journal_entry");
      expect(row.metadata).toEqual({ decision });
      expect(notificationRenderedType("journal_review_decided", { decision })).toBe(
        `event_journal_review_decided_${decision}`,
      );
    },
  );

  it("never notifies the reviewer about their own review", async () => {
    state.workerProfile = AUTHOR;
    const res = await emitJournalReviewDecisionNotification({
      ...base,
      decision: "approved",
    });
    expect(res).toEqual({ delivered: false, reason: "self_action" });
    expect(state.inserts).toHaveLength(0);
  });

  it("repeating the same decision is a no-op; a different decision is a new fact", async () => {
    await emitJournalReviewDecisionNotification({ ...base, decision: "changes_requested" });
    const again = await emitJournalReviewDecisionNotification({
      ...base,
      decision: "changes_requested",
    });
    const later = await emitJournalReviewDecisionNotification({ ...base, decision: "approved" });
    expect(again).toMatchObject({ outcome: "duplicate" });
    expect(later).toMatchObject({ outcome: "written" });
    expect(state.inserts).toHaveLength(2);
  });

  it("an unresolvable worker is reported, not guessed", async () => {
    expect(
      await emitJournalReviewDecisionNotification({
        ...base,
        workerId: null,
        decision: "approved",
      }),
    ).toEqual({ delivered: false, reason: "recipient_unresolved" });
    state.workerProfile = null;
    expect(
      await emitJournalReviewDecisionNotification({ ...base, decision: "approved" }),
    ).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(state.inserts).toHaveLength(0);
  });

  it("an unknown decision value falls back to the base type key (never a raw enum)", () => {
    expect(notificationRenderedType("journal_review_decided", { decision: "weird" })).toBe(
      "event_journal_review_decided",
    );
  });
});

describe("email outcome is kept, not discarded", () => {
  const facts = {
    conversationId: CONVERSATION,
    authorProfileId: AUTHOR,
    participantProfileIds: [AUTHOR, OTHER],
    nowMs: T0,
  };

  it("returns the default channel_disabled outcome quietly", async () => {
    const res = await emitMessageReceivedNotifications(facts);
    expect(res).toMatchObject({ emailOutcomes: ["channel_disabled"] });
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns sent without any warning", async () => {
    state.email = { kind: "sent" };
    const res = await emitMessageReceivedNotifications(facts);
    expect(res).toMatchObject({ emailOutcomes: ["sent"] });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["send_failed", "not_configured", "no_recipient_email", "render_failed"])(
    "returns and logs an opted-in %s outcome",
    async (kind) => {
      state.email = kind === "send_failed" ? { kind, reason: "http_500" } : { kind };
      const res = await emitJournalReviewDecisionNotification({
        entryId: ENTRY,
        workerId: WORKER_ID,
        actorProfileId: AUTHOR,
        decision: "approved",
      });
      expect(res).toMatchObject({ delivered: true, emailOutcomes: [kind] });
      // not_configured is the named inert state (info); real misses warn.
      const logger = kind === "not_configured" ? info : warn;
      expect(logger).toHaveBeenCalledWith(
        NOTIFICATION_EMAIL_UNDELIVERED,
        expect.objectContaining({ eventType: "journal_review_decided", outcome: kind }),
      );
      // never the address or content
      expect(JSON.stringify([...warn.mock.calls, ...info.mock.calls])).not.toMatch(/@/);
    },
  );

  it("runs no email hop for a duplicate (nothing was written now)", async () => {
    await emitMessageReceivedNotifications(facts);
    state.emailCalls = 0;
    const res = await emitMessageReceivedNotifications(facts);
    expect(res).toMatchObject({ outcome: "duplicate" });
    expect(state.emailCalls).toBe(0);
    expect((res as { emailOutcomes?: unknown }).emailOutcomes).toBeUndefined();
  });

  it("collects the per-recipient outcomes of a fan-out", async () => {
    state.email = { kind: "sent" };
    const res = await emitMessageReceivedNotifications({
      ...facts,
      participantProfileIds: [AUTHOR, OTHER, THIRD],
    });
    expect(res).toMatchObject({ recipients: 2, emailOutcomes: ["sent", "sent"] });
  });
});
