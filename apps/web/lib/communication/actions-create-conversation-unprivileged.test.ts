import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications/event-emitters", () => ({ emitMessageReceivedNotifications: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const writes: { client: "user" | "admin"; table: string; rows: unknown }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: ME } } }) },
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
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      return {
        insert(rows: unknown) {
          writes.push({ client: "admin", table, rows });
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

import { createConversation } from "./actions";

beforeEach(() => {
  writes.length = 0;
});

describe("createConversation — the browser-callable action is unprivileged (audit F-1)", () => {
  it("ADVERSARIAL: a client that names another profile gets no thread, no row, no service-role write", async () => {
    const r = await createConversation({
      kind: "direct",
      participantProfileIds: [THEM],
      locale: "en",
      subject: "hello",
    });
    expect(r).toMatchObject({ ok: false, code: "no_permission" });
    expect(writes).toEqual([]);
  });

  it("ADVERSARIAL: the same for a team thread and for a forged authority field smuggled in the payload", async () => {
    const team = await createConversation({ kind: "team", participantProfileIds: [THEM], locale: "en" });
    expect(team).toMatchObject({ ok: false, code: "no_permission" });
    const smuggled = await createConversation({
      kind: "direct",
      participantProfileIds: [THEM],
      locale: "en",
      // a client can put anything in the payload; it is not an issued authority
      ...({ authority: { permission: "allowed_engagement" } } as object),
    } as never);
    expect(smuggled).toMatchObject({ ok: false, code: "no_permission" });
    expect(writes).toEqual([]);
  });

  it("POSITIVE: the support launcher shape (self-only thread) still works and never uses the service client", async () => {
    const r = await createConversation({ kind: "support", subject: "need help", locale: "en" });
    expect(r).toEqual({ ok: true, data: { id: "conv-1" } });
    expect(writes.filter((w) => w.client === "admin")).toEqual([]);
  });
});
