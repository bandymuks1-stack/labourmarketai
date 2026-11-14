import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { markConversationNotificationsRead } from "./events";

/**
 * Chat audit 2026-11-11, defect 7: opening a thread moved the thread's own
 * read marker but left its bell rows unread, so the bell and the activity
 * centre kept announcing a message the person had already read.
 */

const CONV = "c0000000-0000-4000-8000-000000000001";

function recorder(error: { code?: string } | null = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain = {
    update: (v: unknown) => (calls.push(["update", v]), chain),
    eq: (c: string, v: unknown) => (calls.push(["eq", c, v]), chain),
    is: async (c: string, v: unknown) => (calls.push(["is", c, v]), { error }),
  };
  return { calls, client: { from: (t: string) => (calls.push(["from", t]), chain) } };
}

describe("markConversationNotificationsRead", () => {
  it("marks only the caller's unread new-message rows of THIS thread", async () => {
    const { calls, client } = recorder();
    const r = await markConversationNotificationsRead(client as never, CONV, "2026-11-12T08:00:00Z");
    expect(r).toEqual({ kind: "persisted" });
    expect(calls).toEqual([
      ["from", "notification_events"],
      ["update", { read_at: "2026-11-12T08:00:00Z" }],
      ["eq", "event_type", "message_received"],
      ["eq", "metadata->>conversationId", CONV],
      ["is", "read_at", null],
    ]);
  });

  it("a non-uuid id changes nothing", async () => {
    const { calls, client } = recorder();
    await markConversationNotificationsRead(client as never, "x),or(id.neq.0", "t");
    expect(calls).toEqual([]);
  });

  it("an absent store degrades honestly", async () => {
    const { client } = recorder({ code: "42P01" });
    expect(await markConversationNotificationsRead(client as never, CONV, "t")).toEqual({
      kind: "feature_unavailable",
    });
  });
});

describe("opening a thread reads its bell rows", () => {
  it("markConversationRead calls the bell mark-read after the thread's own marker", () => {
    const src = readFileSync(join(__dirname, "..", "communication", "actions.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function markConversationRead"));
    const thread = fn.indexOf('.update({ last_read_at');
    const bell = fn.indexOf("markConversationNotificationsRead(");
    expect(thread).toBeGreaterThan(-1);
    expect(bell).toBeGreaterThan(thread);
  });
});
