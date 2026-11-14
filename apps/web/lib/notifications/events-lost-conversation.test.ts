import { describe, expect, it } from "vitest";

import { lostThreadsFilter, readMyNotificationEvents } from "./events";

/**
 * P0 CHAT PRIVACY (owner 2026-11-11), regression 5: bell rows written before a
 * person was removed from a thread leave their ACTIVE feed and unread total —
 * excluded IN the query (a full page, an exact count), never deleted or
 * re-marked — and every other notification is unchanged.
 *
 * The fake store holds the reader's rows and applies the `.or(...)` filter the
 * way Postgres would; the participant read returns only the READER's own
 * revoked rows (what `conversation_participants_select` shows a person of
 * their own grants).
 */

const READER = "11111111-1111-4111-8111-111111111111";
const LOST = "c0000000-0000-4000-8000-000000000001";
const OPEN = "c0000000-0000-4000-8000-000000000002";

type Row = {
  id: string;
  recipient_profile_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, string>;
};

const chat = (id: string, convId: string, readAt: string | null, minute: number): Row => ({
  id,
  recipient_profile_id: READER,
  event_type: "message_received",
  entity_type: "conversation",
  entity_id: `${convId}:${minute}`,
  created_at: new Date(Date.UTC(2026, 10, 11, 12, minute)).toISOString(),
  read_at: readAt,
  metadata: { conversationId: convId },
});
const booking = (id: string, minute: number): Row => ({
  id,
  recipient_profile_id: READER,
  event_type: "booking_proposed",
  entity_type: "booking_request",
  entity_id: `br-${id}`,
  created_at: new Date(Date.UTC(2026, 10, 11, 12, minute)).toISOString(),
  read_at: null,
  metadata: {},
});

/** Postgres semantics of the PostgREST filter the reader builds. */
function passes(row: Row, filter: string | null): boolean {
  if (!filter) return true;
  const ids = /not\.in\.\(([^)]*)\)/.exec(filter)![1]!.split(",");
  const conv = row.metadata.conversationId;
  return row.entity_type !== "conversation" || conv == null || !ids.includes(conv);
}

function store(rows: Row[], ownRevoked: string[] | "error") {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      if (table === "conversation_participants") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          limit: async () =>
            ownRevoked === "error"
              ? { data: null, error: { code: "XX000" } }
              : { data: ownRevoked.map((conversation_id) => ({ conversation_id })), error: null },
        };
        return chain;
      }
      let filter: string | null = null;
      return {
        select: (_cols: string, o?: { head?: boolean }) => {
          const q = {
            or: (f: string) => ((filter = f), q),
            is: async () => ({
              count: rows.filter((r) => r.read_at === null && passes(r, filter)).length,
              error: null,
            }),
            order: () => ({
              limit: async (n: number) => ({
                data: rows
                  .filter((r) => passes(r, filter))
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .slice(0, n),
                error: null,
              }),
            }),
          };
          void o;
          return q;
        },
        update: () => {
          calls.push("WRITE");
          return { is: async () => ({ error: null }) };
        },
      };
    },
  };
  return { client, calls };
}

describe("old bells of a thread the reader was removed from", () => {
  it("5: leave the feed and the unread total; other threads and types stay", async () => {
    const rows = [chat("n1", LOST, null, 50), chat("n2", OPEN, null, 40), chat("n3", LOST, "x", 30), booking("b1", 20)];
    const { client, calls } = store(rows, [LOST]);
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events.map((e) => e.id)).toEqual(["n2", "b1"]);
    expect(r.unreadCount).toBe(2);
    expect(r.unreadCountIsWindowOnly).toBeUndefined();
    expect(calls).not.toContain("WRITE");
  });

  it("Codex P2: a page full of a lost thread's rows still shows the visible rows behind them", async () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, i) => chat(`l${i}`, LOST, null, 59 - i)),
      booking("b1", 1),
    ];
    const { client } = store(rows, [LOST]);
    const r = await readMyNotificationEvents(client as never, 20);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events.map((e) => e.id)).toEqual(["b1"]);
    expect(r.unreadCount).toBe(1);
  });

  it("Codex P2: more than 200 hidden unread rows are all left out of the count, exactly", async () => {
    const rows = [...Array.from({ length: 230 }, (_, i) => chat(`l${i}`, LOST, null, i % 60)), booking("b1", 0)];
    const { client } = store(rows, [LOST]);
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.unreadCount).toBe(1);
    expect(r.unreadCountIsWindowOnly).toBeUndefined();
  });

  it("Codex P2: the removal check reads only the reader's own grants (no co-participant rows to truncate)", async () => {
    const rows = [chat("n2", OPEN, null, 40)];
    const { client, calls } = store(rows, []);
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events.map((e) => e.id)).toEqual(["n2"]);
    // feed + count, then one own-grants read; no removal → no re-read.
    expect(calls).toEqual(["notification_events", "notification_events", "conversation_participants"]);
  });

  it("7: a live reader of the same threads keeps every row", async () => {
    const rows = [chat("n1", LOST, null, 50), chat("n2", OPEN, null, 40), booking("b1", 20)];
    const { client } = store(rows, []);
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events.map((e) => e.id)).toEqual(["n1", "n2", "b1"]);
    expect(r.unreadCount).toBe(3);
  });

  it("a failed own-grants read hides nothing (the thread itself stays closed by RLS)", async () => {
    const rows = [chat("n1", LOST, null, 50), booking("b1", 20)];
    const { client } = store(rows, "error");
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events).toHaveLength(2);
  });

  it("a feed with no chat rows costs no extra request", async () => {
    const { client, calls } = store([booking("b1", 20)], [LOST]);
    const r = await readMyNotificationEvents(client as never);
    if (r.kind !== "ready") throw new Error(r.kind);
    expect(r.events).toHaveLength(1);
    expect(calls).toEqual(["notification_events", "notification_events"]);
  });
});

describe("lostThreadsFilter", () => {
  it("keeps non-chat rows and chat rows without a thread id; drops only lost threads", () => {
    expect(lostThreadsFilter([LOST])).toBe(
      `entity_type.neq.conversation,metadata->>conversationId.is.null,metadata->>conversationId.not.in.(${LOST})`,
    );
  });

  it("only uuids reach the filter string; none = no filter", () => {
    expect(lostThreadsFilter(["x),or(id.neq.0", "nope"])).toBeNull();
    expect(lostThreadsFilter([])).toBeNull();
  });
});
