import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { rpc, send } = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(async () => ({ status: "sent" })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/email/transactional", () => ({ isTransactionalEmailConfigured: () => true }));
vi.mock("@/lib/email/send-ledger-store", () => ({ guardedSendTransactionalEmail: send }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/invitations/external-referral-contract", () => ({ toDeclaredContext: () => ({}) }));
vi.mock("@/lib/invitations/email-content", () => ({
  buildInvitationSubject: () => "s",
  buildInvitationBody: () => "b",
}));

import { receiveExternalReferral } from "./external-referral-receive";

const input = {
  source: { slug: "partner", consentVersion: "v1" },
  envelope: { leadId: "L-2", locale: "en", worker: { contact: { email: "person@example.test", name: null } }, consent: {} },
  origin: "https://labourmarket.ai",
} as unknown as Parameters<typeof receiveExternalReferral>[0];

function db(reserve: { data?: unknown; error?: { code: string } }) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "receive_external_referral_v1") return { data: { outcome: "created", invitation_id: "inv-2" }, error: null };
    if (fn === "reserve_external_referral_send_v1") return { data: reserve.data ?? null, error: reserve.error ?? null };
    if (fn === "mark_external_referral_delivery_v1") return { data: "ok", error: null };
    throw new Error(`unexpected rpc ${fn}`);
  });
}

describe("partner intake — one mail per address (20261028070000)", () => {
  beforeEach(() => {
    rpc.mockReset();
    send.mockClear();
  });

  it("a new lead id for an address already mailed is stored but not mailed", async () => {
    db({ data: "address_already_sent" });
    const r = await receiveExternalReferral(input);
    expect(r).toMatchObject({ outcome: "created", delivery: "not_sent" });
    expect(send).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("mark_external_referral_delivery_v1", expect.anything());
  });

  it("an address with a send in flight is not mailed twice", async () => {
    db({ data: "address_reserved" });
    await receiveExternalReferral(input);
    expect(send).not.toHaveBeenCalled();
  });

  it("a reserved address is mailed once and the outcome is marked", async () => {
    db({ data: "ok" });
    const r = await receiveExternalReferral(input);
    expect(send).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ delivery: "sent" });
    expect(rpc).toHaveBeenCalledWith("mark_external_referral_delivery_v1", { p_invitation_id: "inv-2", p_outcome: "sent" });
  });

  it("before the migration is applied, intake mails as it always did", async () => {
    db({ error: { code: "PGRST202" } });
    await receiveExternalReferral(input);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("any other database error mails nothing (the row stays not_sent for a later, guarded run)", async () => {
    db({ error: { code: "57014" } });
    const r = await receiveExternalReferral(input);
    expect(send).not.toHaveBeenCalled();
    expect(r).toMatchObject({ delivery: "not_sent" });
  });
});
