import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN ≠ ZERO for the unread door (SEP-7). The lossy
 * `getUnreadConversationIds` turned every failure into "nothing unread", so
 * the home's `unread: null` branch was unreachable. `getUnreadConversationIdsResult`
 * tells a failed read from a successful empty one; the lossy reader keeps its
 * historical shape by delegating.
 */

type Row = Record<string, unknown>;

function fakeClient(opts: {
  user?: { id: string } | null;
  participants?: { data?: Row[]; error?: unknown };
  messages?: { data?: Row[]; error?: unknown };
  throws?: boolean;
}) {
  const user = opts.user === undefined ? { id: "me" } : opts.user;
  const result = (r?: { data?: Row[]; error?: unknown }) => ({ data: r?.data ?? [], error: r?.error ?? null });
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      if (opts.throws) throw new Error("boom");
      if (table === "conversation_participants") {
        return { select: () => ({ eq: async () => result(opts.participants) }) };
      }
      return {
        select: () => ({
          in: () => ({ neq: () => ({ order: () => ({ limit: async () => result(opts.messages) }) }) }),
        }),
      };
    },
  };
}

async function load(client: unknown) {
  vi.resetModules();
  vi.doMock("server-only", () => ({}));
  vi.doMock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));
  return import("./unread");
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("getUnreadConversationIdsResult", () => {
  it("a participants-query error is UNAVAILABLE, not empty", async () => {
    const m = await load(fakeClient({ participants: { error: { code: "42P01" } } }));
    expect(await m.getUnreadConversationIdsResult()).toEqual({ status: "unavailable" });
  });

  it("a messages-query error is UNAVAILABLE, not empty", async () => {
    const m = await load(
      fakeClient({ participants: { data: [{ conversation_id: "c1", last_read_at: null }] }, messages: { error: { code: "XX000" } } }),
    );
    expect(await m.getUnreadConversationIdsResult()).toEqual({ status: "unavailable" });
  });

  it("a thrown error and a missing user are UNAVAILABLE", async () => {
    expect(await (await load(fakeClient({ throws: true }))).getUnreadConversationIdsResult()).toEqual({ status: "unavailable" });
    expect(await (await load(fakeClient({ user: null }))).getUnreadConversationIdsResult()).toEqual({ status: "unavailable" });
  });

  it("no conversations at all is a successful EMPTY read", async () => {
    const m = await load(fakeClient({ participants: { data: [] } }));
    const r = await m.getUnreadConversationIdsResult();
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.ids.size).toBe(0);
  });

  it("a successful read returns exactly the threads with someone else's newer message", async () => {
    const m = await load(
      fakeClient({
        participants: {
          data: [
            { conversation_id: "read", last_read_at: "2026-10-04T10:00:00Z" },
            { conversation_id: "unread", last_read_at: "2026-10-01T10:00:00Z" },
            { conversation_id: "never", last_read_at: null },
          ],
        },
        messages: {
          data: [
            { conversation_id: "read", author_id: "x", created_at: "2026-10-03T10:00:00Z" },
            { conversation_id: "unread", author_id: "x", created_at: "2026-10-04T10:00:00Z" },
            { conversation_id: "never", author_id: "x", created_at: "2026-09-01T10:00:00Z" },
          ],
        },
      }),
    );
    const r = await m.getUnreadConversationIdsResult();
    expect(r.status === "ok" && [...r.ids].sort()).toEqual(["never", "unread"]);
  });
});

describe("the historical reader keeps its lossy shape (badges) by delegating", () => {
  it("failure reads as the empty set; success is unchanged; the count still delegates", async () => {
    const failed = await load(fakeClient({ participants: { error: { code: "42P01" } } }));
    expect((await failed.getUnreadConversationIds()).size).toBe(0);
    const ok = await load(
      fakeClient({
        participants: { data: [{ conversation_id: "c", last_read_at: null }] },
        messages: { data: [{ conversation_id: "c", author_id: "x", created_at: "2026-10-01T00:00:00Z" }] },
      }),
    );
    expect([...(await ok.getUnreadConversationIds())]).toEqual(["c"]);
    expect(await ok.getUnreadConversationCount()).toBe(1);
  });
});

describe("the home's unread door uses the RESULT reader", () => {
  const src = readFileSync(join(__dirname, "..", "today", "today-server.ts"), "utf8").replace(/\r\n/g, "\n");

  it("loadTodayAttention reads through getUnreadConversationIdsResult and maps unavailable to null", () => {
    expect(src).toMatch(/getUnreadConversationIdsResult\(\)/);
    expect(src).toMatch(/res\.status === "ok"[\s\S]{0,200}: null,/);
    // NEGATIVE: the lossy reader can never report a failure, so it must not feed this door.
    expect(src).not.toMatch(/getUnreadConversationIds\(\)/);
  });
});
