import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
type Plan =
  | { kind: "existing"; conversationId: string; permission: string }
  | { kind: "new"; permission: string }
  | { kind: "refused"; permission: string };
const plan = vi.fn(async (...a: unknown[]): Promise<Plan> => (void a, { kind: "new", permission: "allowed_engagement" }));
const openConv = vi.fn(async (...a: unknown[]) => (void a, { ok: true as const, data: { id: "conv-new", created: true, permission: "allowed_engagement" } }));
const send = vi.fn(async (...a: unknown[]) => (void a, { ok: true as const, data: { id: "msg-1", attachmentsFailed: 0 } }));
vi.mock("@/lib/communication/direct-conversation-core", () => ({
  planDirectContact: (...a: unknown[]) => plan(...a),
  getOrCreateDirectConversationCore: (...a: unknown[]) => openConv(...a),
}));
vi.mock("@/lib/communication/communication-core", () => ({ sendMessageCore: (...a: unknown[]) => send(...a) }));

import { MESSAGING_CAPABILITIES } from "./messaging-capabilities";
import type { CapabilityCaller } from "./contract";

const RAMUNAS = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const BODY = "Prašau toliau pildyti Work Journal su nuotraukomis.";

function caller(tables: Record<string, unknown> = {}) {
  const supabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      const val = tables[table];
      chain.maybeSingle = async () => ({ data: val ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: Array.isArray(val) ? val : [], error: null });
      return chain;
    },
    async rpc() {
      return { data: [], error: null };
    },
  } as unknown as CapabilityCaller["supabase"];
  return { userId: "manager-1", transport: "bearer", supabase, locale: "lt" } as CapabilityCaller;
}
const cap = (id: string) => MESSAGING_CAPABILITIES.find((c) => c.id === id)!;

beforeEach(() => {
  plan.mockClear();
  openConv.mockClear();
  send.mockClear();
});

describe("message.send — draft, human confirm, the one core", () => {
  it("the draft sends nothing and passes the project to the contact gate", async () => {
    const c = caller({ workers: { display_name: "Ramunas Šukys" } });
    const d = await cap("message.send_draft").run(c, { recipientProfileId: RAMUNAS, projectId: PROJECT, body: BODY });
    expect(d.ok).toBe(true);
    expect(plan).toHaveBeenCalledWith({ supabase: c.supabase, userId: "manager-1" }, RAMUNAS, { projectId: PROJECT });
    expect(send).not.toHaveBeenCalled();
    expect(openConv).not.toHaveBeenCalled();
    const preview = d.ok ? (d.data as { preview: { to: { name: string }; body: string; permission: string } }).preview : null;
    expect(preview).toMatchObject({ to: { name: "Ramunas Šukys" }, body: BODY, permission: "allowed_engagement" });
  });

  it("no relationship → refused, nothing drafted", async () => {
    plan.mockResolvedValueOnce({ kind: "refused", permission: "no_permission" });
    const r = await cap("message.send_draft").run(caller(), { recipientProfileId: RAMUNAS, body: BODY });
    expect(r.ok === false && r.code).toBe("no_permission");
  });

  it("confirm with edited text is rejected; the exact text is sent once through the core and read back", async () => {
    const c = caller({
      workers: { display_name: "Ramunas Šukys" },
      conversation_messages: { id: "msg-1", conversation_id: "conv-new", created_at: "2026-09-30T10:00:00Z", body: BODY },
      conversation_participants: { profile_id: RAMUNAS, revoked_at: null },
    });
    const d = await cap("message.send_draft").run(c, { recipientProfileId: RAMUNAS, projectId: PROJECT, body: BODY });
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";

    const edited = await cap("message.send_confirm").run(c, {
      recipientProfileId: RAMUNAS,
      projectId: PROJECT,
      body: BODY + " (edited)",
      confirmationToken: token,
    });
    expect(edited.ok === false && edited.code).toBe("confirmation_rejected");
    expect(send).not.toHaveBeenCalled();

    const ok = await cap("message.send_confirm").run(c, { recipientProfileId: RAMUNAS, projectId: PROJECT, body: BODY, confirmationToken: token });
    expect(ok.ok).toBe(true);
    expect(openConv).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toEqual({ conversationId: "conv-new", body: BODY, locale: "lt" });
    const data = ok.ok ? (ok.data as { readBack: { id: string; bodyMatches: boolean; recipientIsParticipant: boolean } }) : null;
    expect(data!.readBack).toMatchObject({ id: "msg-1", bodyMatches: true, recipientIsParticipant: true });
  });

  it("an existing thread is reused, and a new message in it since the draft voids the token", async () => {
    plan.mockResolvedValue({ kind: "existing", conversationId: "conv-old", permission: "allowed_existing_conversation" });
    const tables: Record<string, unknown> = { conversation_messages: [{ id: "m-before" }] };
    const c = caller(tables);
    const d = await cap("message.send_draft").run(c, { recipientProfileId: RAMUNAS, body: BODY });
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";
    tables.conversation_messages = [{ id: "m-newer" }];
    const stale = await cap("message.send_confirm").run(c, { recipientProfileId: RAMUNAS, body: BODY, confirmationToken: token });
    expect(stale.ok === false && stale.code).toBe("confirmation_rejected");
    expect(send).not.toHaveBeenCalled();
    plan.mockReset();
    plan.mockResolvedValue({ kind: "new", permission: "allowed_engagement" });
  });

  it("exactly one of conversationId or recipientProfileId", async () => {
    const r = await cap("message.send_draft").inputSchema.safeParse({ body: BODY });
    expect(r.success).toBe(false);
  });
});
