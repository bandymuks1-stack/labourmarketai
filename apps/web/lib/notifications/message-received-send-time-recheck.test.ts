import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P0 CHAT PRIVACY (owner 2026-11-11) — the SEND-TIME re-check. The fan-out
 * list is read once, before delivery; a participant removed after that read
 * must not get any channel that has not run yet. `isStillParticipant` is
 * asked right before the bell insert, again before the e-mail and again
 * before the push — per recipient. These tests drive the real
 * `emitMessageReceivedNotifications` → `deliverDetailed` path against a fake
 * store that counts every channel.
 *
 * Regression set (owner list): 1 an active participant is alerted; 2 a
 * removed one is not; 6 a removal landing mid-delivery stops the remaining
 * channels; 7 the other participants are untouched. (3/4/6 at the database
 * layer: scripts/db-proof/chat-participant-revocation.sh, real PostgreSQL.)
 */

const state = {
  inserts: [] as Record<string, unknown>[],
  emailCalls: [] as string[],
  pushCalls: [] as string[],
};

function fakeAdmin() {
  return {
    from(table: string) {
      if (table !== "notification_events" && table !== "notification_preferences") {
        throw new Error(`42501 insufficient_privilege (fake): ${table}`);
      }
      return {
        insert: async (payload: Record<string, unknown>) => {
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
  readNotificationPreferencesFor: async () => ({ kind: "ok", rows: [] }),
}));
vi.mock("./email-dispatch", () => ({
  maybeDispatchNotificationEmail: async (_a: unknown, input: { recipientProfileId: string }) => {
    state.emailCalls.push(input.recipientProfileId);
    return { kind: "logged" };
  },
}));
vi.mock("./web-push-dispatch", () => ({
  maybeDispatchWebPush: async (_a: unknown, input: { recipientProfileId: string }) => {
    state.pushCalls.push(input.recipientProfileId);
    return { kind: "channel_disabled" };
  },
}));
vi.mock("../data/worker-core", () => ({ getWorkerCoreRow: async () => null }));
vi.mock("@/lib/opportunities/recommendations", () => ({
  getWorkerJobRecommendations: async () => ({ kind: "unavailable" }),
}));
vi.mock("../worker/weekly-intelligence", () => ({
  getWeeklyPersonalIntelligence: async () => ({ kind: "unavailable" }),
}));

import { emitMessageReceivedNotifications } from "./event-emitters";
import { resetNotificationStoreWriteBlock } from "./events";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const LIVE = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
const CONV = "44444444-4444-4444-8444-444444444444";
const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);

const recipientsOf = (rows: Record<string, unknown>[]) => rows.map((r) => r.recipient_profile_id);

beforeEach(() => {
  state.inserts = [];
  state.emailCalls = [];
  state.pushCalls = [];
  resetNotificationStoreWriteBlock();
});

describe("send-time eligibility, per channel", () => {
  it("1 + 7: every live participant gets the bell, the e-mail and the push", async () => {
    const res = await emitMessageReceivedNotifications({
      conversationId: CONV,
      authorProfileId: AUTHOR,
      participantProfileIds: [AUTHOR, LIVE, GONE],
      isStillParticipant: async () => true,
      nowMs: T0,
    });
    expect(res).toMatchObject({ delivered: true, recipients: 2 });
    expect(recipientsOf(state.inserts).sort()).toEqual([LIVE, GONE].sort());
    expect(state.emailCalls.sort()).toEqual([LIVE, GONE].sort());
    expect(state.pushCalls.sort()).toEqual([LIVE, GONE].sort());
  });

  it("2: a participant removed before delivery gets no channel; the others are untouched", async () => {
    await emitMessageReceivedNotifications({
      conversationId: CONV,
      authorProfileId: AUTHOR,
      // The list was read BEFORE the removal — it still names GONE.
      participantProfileIds: [AUTHOR, LIVE, GONE],
      isStillParticipant: async (id) => id !== GONE,
      nowMs: T0,
    });
    expect(recipientsOf(state.inserts)).toEqual([LIVE]);
    expect(state.emailCalls).toEqual([LIVE]);
    expect(state.pushCalls).toEqual([LIVE]);
  });

  it("6: a removal landing right after the bell insert stops the e-mail and the push", async () => {
    let asked = 0;
    await emitMessageReceivedNotifications({
      conversationId: CONV,
      authorProfileId: AUTHOR,
      participantProfileIds: [AUTHOR, GONE],
      // Eligible for the bell (first ask), removed before the e-mail (second).
      isStillParticipant: async () => ++asked === 1,
      nowMs: T0,
    });
    expect(recipientsOf(state.inserts)).toEqual([GONE]);
    expect(state.emailCalls).toEqual([]);
    expect(state.pushCalls).toEqual([]);
  });

  it("6: a removal landing between the e-mail and the push stops the push", async () => {
    let asked = 0;
    await emitMessageReceivedNotifications({
      conversationId: CONV,
      authorProfileId: AUTHOR,
      participantProfileIds: [AUTHOR, GONE],
      isStillParticipant: async () => ++asked <= 2,
      nowMs: T0,
    });
    expect(state.emailCalls).toEqual([GONE]);
    expect(state.pushCalls).toEqual([]);
  });

  it("an unreadable re-check (throws) counts as not eligible — fail closed", async () => {
    await emitMessageReceivedNotifications({
      conversationId: CONV,
      authorProfileId: AUTHOR,
      participantProfileIds: [AUTHOR, GONE],
      isStillParticipant: async () => {
        throw new Error("network");
      },
      nowMs: T0,
    });
    expect(state.inserts).toEqual([]);
    expect(state.emailCalls).toEqual([]);
    expect(state.pushCalls).toEqual([]);
  });

  it("the re-check is asked per recipient, with that recipient's id", async () => {
    const asked: string[] = [];
    await emitMessageReceivedNotifications({
      conversationId: CONV,
      authorProfileId: AUTHOR,
      participantProfileIds: [AUTHOR, LIVE, GONE],
      isStillParticipant: async (id) => (asked.push(id), true),
      nowMs: T0,
    });
    expect(new Set(asked)).toEqual(new Set([LIVE, GONE]));
    expect(asked).not.toContain(AUTHOR);
  });
});
