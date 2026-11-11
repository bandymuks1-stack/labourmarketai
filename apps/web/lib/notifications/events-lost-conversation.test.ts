import { describe, expect, it } from "vitest";

import { lostConversationIds, readMyNotificationEvents } from "./events";

/**
 * P0 CHAT PRIVACY (owner 2026-11-11), regression 5: bell rows written before a
 * person was removed from a thread leave their ACTIVE feed and unread total at
 * read time — no row is deleted or re-marked (they stay audit facts) — and
 * every other notification is unchanged.
 *
 * The fake client answers like `conversation_participants_select` does for
 * the READER: a removed reader sees only their own (revoked) row of the lost
 * thread; a live reader sees live rows.
 */

const LOST = "c0000000-0000-4000-8000-000000000001";
const OPEN = "c0000000-0000-4000-8000-000000000002";

const conv = (id: string, convId: string, readAt: string | null, at: string) => ({
  id,
  event_type: "message_received",
  entity_type: "conversation",
  entity_id: `${convId}:w1`,
  created_at: at,
  read_at: readAt,
  metadata: { conversationId: convId },
});
const booking = {
  id: "b1",
  event_type: "booking_proposed",
  entity_type: "booking_request",
  entity_id: "br-1",
  created_at: "2026-11-11T09:00:00Z",
  read_at: null,
  metadata: {},
};

function readerClient(opts: {
  feed: Record<string, unknown>[];
  exactUnread: number;
  participants: { conversation_id: string; revoked_at: string | null }[] | "error";
}) {
  const writes: string[] = [];
  return {
    writes,
    client: {
      from(table: string) {
        if (table === "conversation_participants") {
          return {
            select: () => ({
              in: async () =>
                opts.participants === "error"
                  ? { data: null, error: { code: "XX000" } }
                  : { data: opts.participants, error: null },
            }),
          };
        }
        // notification_events — three reads, told apart by their shape.
        return {
          update: () => {
            writes.push("update");
            return { is: async () => ({ error: null }) };
          },
          delete: () => {
            writes.push("delete");
            return { eq: async () => ({ error: null }) };
          },
          select: (_cols: string, o?: { head?: boolean }) => {
            if (o?.head) return { is: async () => ({ count: opts.exactUnread, error: null }) };
            if (_cols === "metadata") {
              const unreadConv = opts.feed.filter((r) => r.entity_type === "conversation" && r.read_at === null);
              const chain = {
                eq: () => chain,
                is: () => chain,
                limit: async () => ({ data: unreadConv.map((r) => ({ metadata: r.metadata })), error: null }),
              };
              return chain;
            }
            return { order: () => ({ limit: async () => ({ data: opts.feed, error: null }) }) };
          },
        };
      },
    },
  };
}

const FEED = [
  conv("n1", LOST, null, "2026-11-11T12:00:00Z"),
  conv("n2", OPEN, null, "2026-11-11T11:00:00Z"),
  conv("n3", LOST, "2026-11-11T10:30:00Z", "2026-11-11T10:00:00Z"),
  booking,
];

describe("old bells of a thread the reader was removed from", () => {
  it("5: leave the active feed; other threads and other types stay", async () => {
    const { client, writes } = readerClient({
      feed: FEED,
      exactUnread: 3,
      participants: [
        { conversation_id: LOST, revoked_at: "2026-11-11T11:30:00Z" },
        { conversation_id: OPEN, revoked_at: null },
        { conversation_id: OPEN, revoked_at: null },
      ],
    });
    const r = await readMyNotificationEvents(client as never);
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.events.map((e) => e.id)).toEqual(["n2", "b1"]);
    // 3 unread in total, 1 of them belongs to the lost thread.
    expect(r.unreadCount).toBe(2);
    // Read-time only: nothing was deleted or re-marked.
    expect(writes).toEqual([]);
  });

  it("a live reader of the same thread keeps every row (7: others unchanged)", async () => {
    const { client } = readerClient({
      feed: FEED,
      exactUnread: 3,
      participants: [
        { conversation_id: LOST, revoked_at: null },
        { conversation_id: OPEN, revoked_at: null },
      ],
    });
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events.map((e) => e.id)).toEqual(["n1", "n2", "n3", "b1"]);
    expect(r.unreadCount).toBe(3);
  });

  it("a failed participant read hides nothing (the thread itself stays closed by RLS)", async () => {
    const { client } = readerClient({ feed: FEED, exactUnread: 3, participants: "error" });
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events).toHaveLength(4);
  });

  it("a thread with no visible row at all is treated as lost", async () => {
    const { client } = readerClient({ feed: FEED, exactUnread: 3, participants: [] });
    const lost = await lostConversationIds(client as never, FEED.map((r) => ({
      entityType: r.entity_type,
      metadata: r.metadata as Record<string, string>,
    })));
    expect([...lost.ids].sort()).toEqual([LOST, OPEN].sort());
  });
});
