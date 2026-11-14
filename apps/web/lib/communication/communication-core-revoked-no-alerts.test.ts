import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P0 CHAT PRIVACY (owner 2026-11-11): a participant removed from a thread
 * (`revoked_at` set) loses read access in the database the moment the
 * revocation lands (`is_conversation_participant`, 20260612170000). The
 * new-message alert fan-out read the participant list WITHOUT that filter,
 * so the removed person kept getting bell rows, e-mails and pushes for a
 * thread they could no longer open. These tests pin the fan-out to live
 * grants only, at both seams: the query asks the database for live rows,
 * and the pure filter drops a revoked row even if one comes back.
 */

vi.mock("server-only", () => ({}));
const emit = vi.fn();
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitMessageReceivedNotifications: (facts: unknown) => emit(facts),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

import { activeParticipantIds, sendMessageCore } from "./communication-core";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const LIVE = "22222222-2222-4222-8222-222222222222";
const REMOVED = "33333333-3333-4333-8333-333333333333";
const CONV = "44444444-4444-4444-8444-444444444444";

let participantFilters: Array<[string, string, unknown]> = [];

/** The sender's RLS-scoped client. Co-participants can see revoked rows
 *  (`conversation_participants_select`), so the fake returns BOTH rows and
 *  ignores filters — the worst case the code has to survive. */
function senderClient() {
  return {
    from(table: string) {
      if (table === "conversation_participants") {
        const rows = [
          { profile_id: AUTHOR, revoked_at: null },
          { profile_id: LIVE, revoked_at: null },
          { profile_id: REMOVED, revoked_at: "2026-11-11T10:00:00Z" },
        ];
        const chain = {
          select: () => chain,
          eq: (col: string, v: unknown) => (participantFilters.push(["eq", col, v]), chain),
          is: (col: string, v: unknown) => (participantFilters.push(["is", col, v]), chain),
          then: (resolve: (r: unknown) => unknown) => resolve({ data: rows, error: null }),
        };
        return chain;
      }
      // conversation_messages: the rate-cap count, then the insert.
      return {
        select: () => ({ eq: () => ({ gte: async () => ({ count: 0, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: "msg-1" }, error: null }) }) }),
      };
    },
  };
}

beforeEach(() => {
  emit.mockReset();
  participantFilters = [];
});

describe("a removed participant gets no new-message alert", () => {
  it("the fan-out never names a revoked participant, even when the read returns the row", async () => {
    const r = await sendMessageCore(
      { supabase: senderClient() as never, userId: AUTHOR },
      { conversationId: CONV, body: "Hej", locale: "en" },
    );
    expect(r.ok).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
    const facts = emit.mock.calls[0]![0] as { participantProfileIds: string[] };
    expect(facts.participantProfileIds).toContain(LIVE);
    expect(facts.participantProfileIds).not.toContain(REMOVED);
  });

  it("the participant read asks the database for live grants only", async () => {
    await sendMessageCore(
      { supabase: senderClient() as never, userId: AUTHOR },
      { conversationId: CONV, body: "Hej", locale: "en" },
    );
    expect(participantFilters).toContainEqual(["eq", "conversation_id", CONV]);
    expect(participantFilters).toContainEqual(["is", "revoked_at", null]);
  });
});

describe("activeParticipantIds", () => {
  it("keeps live grants and drops revoked ones and empty ids", () => {
    expect(
      activeParticipantIds([
        { profile_id: LIVE, revoked_at: null },
        { profile_id: REMOVED, revoked_at: "2026-11-11T10:00:00Z" },
        { profile_id: "", revoked_at: null },
        { profile_id: null },
        { profile_id: AUTHOR },
      ]),
    ).toEqual([LIVE, AUTHOR]);
  });
});
