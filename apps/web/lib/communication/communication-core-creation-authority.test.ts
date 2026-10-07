import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/event-emitters", () => ({ emitMessageReceivedNotifications: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

type Write = { client: "user" | "admin"; table: string; rows: unknown };
const writes: Write[] = [];
let adminShouldFail = false;

/** The caller's own RLS-scoped client: counts its recent rows, records its inserts. */
function userClient() {
  return {
    from(table: string) {
      return {
        select: () => ({ eq: () => ({ gte: async () => ({ count: 0, error: null }) }) }),
        insert(rows: unknown) {
          writes.push({ client: "user", table, rows });
          if (table === "conversations") {
            return { select: () => ({ single: async () => ({ data: { id: "conv-1" }, error: null }) }) };
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      return {
        insert(rows: unknown) {
          writes.push({ client: "admin", table, rows });
          return Promise.resolve({ error: adminShouldFail ? { message: "boom" } : null });
        },
      };
    },
  }),
}));

import { createConversationCore, type CommunicationCaller } from "./communication-core";
import { issueContactAuthority } from "./contact-authority";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const caller = (): CommunicationCaller => ({ supabase: userClient() as never, userId: ME });
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  writes.length = 0;
  adminShouldFail = false;
});

describe("createConversationCore — §8.1 authority at the creation boundary", () => {
  it("NEGATIVE: naming another person WITHOUT an authority is refused before any read or write", async () => {
    const r = await createConversationCore(caller(), { kind: "direct", participantProfileIds: [THEM], locale: "en" });
    expect(r).toMatchObject({ ok: false, code: "no_permission" });
    expect(writes).toEqual([]);
  });

  it("ADVERSARIAL: a forged look-alike authority is refused", async () => {
    const forged = { permission: "allowed_engagement" } as never;
    const r = await createConversationCore(
      caller(),
      { kind: "direct", participantProfileIds: [THEM], locale: "en" },
      forged,
    );
    expect(r).toMatchObject({ ok: false, code: "no_permission" });
    expect(writes).toEqual([]);
  });

  it("ADVERSARIAL: a no_permission gate result mints nothing, so nothing is created", async () => {
    const r = await createConversationCore(
      caller(),
      { kind: "direct", participantProfileIds: [THEM], locale: "en" },
      issueContactAuthority("no_permission") ?? undefined,
    );
    expect(r).toMatchObject({ ok: false, code: "no_permission" });
    expect(writes).toEqual([]);
  });

  it("ADVERSARIAL: the team kind gets no exemption", async () => {
    const r = await createConversationCore(caller(), { kind: "team", participantProfileIds: [THEM], locale: "en" });
    expect(r).toMatchObject({ ok: false, code: "no_permission" });
    expect(writes).toEqual([]);
  });

  it("ADVERSARIAL: a source stamp without an authority is dropped (it cannot be forged through the open door)", async () => {
    const r = await createConversationCore(caller(), {
      kind: "support",
      locale: "en",
      subject: "help",
      sourceHint: { type: "scouting", id: SOURCE_ID },
    });
    expect(r.ok).toBe(true);
    const conv = writes.find((w) => w.table === "conversations")!;
    expect(conv.rows).toEqual({ subject: "help", kind: "support", created_by: ME });
  });

  it("POSITIVE: a self-only support thread needs no authority and never touches the service client", async () => {
    const r = await createConversationCore(caller(), { kind: "support", locale: "en", subject: "help" });
    expect(r).toEqual({ ok: true, data: { id: "conv-1" } });
    expect(writes.filter((w) => w.client === "admin")).toEqual([]);
    expect(writes.find((w) => w.table === "conversation_participants")).toMatchObject({
      client: "user",
      rows: [{ conversation_id: "conv-1", profile_id: ME, added_by: ME }],
    });
  });

  it("POSITIVE: with an authority, the caller writes the thread + THEMSELVES and the server adds the other person", async () => {
    const authority = issueContactAuthority("allowed_engagement")!;
    const r = await createConversationCore(
      caller(),
      { kind: "direct", participantProfileIds: [THEM], locale: "en", sourceHint: { type: "scouting", id: SOURCE_ID } },
      authority,
    );
    expect(r).toEqual({ ok: true, data: { id: "conv-1" } });
    const participantWrites = writes.filter((w) => w.table === "conversation_participants");
    expect(participantWrites).toEqual([
      { client: "user", table: "conversation_participants", rows: [{ conversation_id: "conv-1", profile_id: ME, added_by: ME }] },
      { client: "admin", table: "conversation_participants", rows: [{ conversation_id: "conv-1", profile_id: THEM, added_by: ME }] },
    ]);
    // the user client is NEVER used to add another profile
    expect(
      writes.some(
        (w) =>
          w.client === "user" &&
          w.table === "conversation_participants" &&
          JSON.stringify(w.rows).includes(THEM),
      ),
    ).toBe(false);
    // the source stamp is honoured only because the authority is present
    expect(writes.find((w) => w.table === "conversations")!.rows).toMatchObject({
      source_type: "scouting",
      source_id: SOURCE_ID,
    });
  });

  it("POSITIVE: the caller cannot smuggle themselves or duplicates into the server's insert", async () => {
    const authority = issueContactAuthority("allowed_admin")!;
    await createConversationCore(
      caller(),
      { kind: "direct", participantProfileIds: [ME, THEM], locale: "en" },
      authority,
    );
    const adminRows = writes.find((w) => w.client === "admin")!.rows as { profile_id: string }[];
    expect(adminRows.map((r) => r.profile_id)).toEqual([THEM]);
  });

  it("FAILURE: when the server-side participant insert fails the call fails honestly", async () => {
    adminShouldFail = true;
    const r = await createConversationCore(
      caller(),
      { kind: "direct", participantProfileIds: [THEM], locale: "en" },
      issueContactAuthority("allowed_engagement")!,
    );
    expect(r).toMatchObject({ ok: false, code: "insert_failed" });
  });

  it("the participant cap still applies before anything is written", async () => {
    const many = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const r = await createConversationCore(
      caller(),
      { kind: "direct", participantProfileIds: many, locale: "en" },
      issueContactAuthority("allowed_engagement")!,
    );
    expect(r).toMatchObject({ ok: false, code: "invalid_input" });
    expect(writes).toEqual([]);
  });
});
