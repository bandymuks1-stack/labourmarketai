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
    if (fn === "record_invitation_delivery_attempt_v1") return { data: "ok", error: null };
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

describe("partner intake — a failed send keeps its reason (owner P0 2026-11-13, invitation 862a91f4)", () => {
  beforeEach(() => {
    rpc.mockReset();
    send.mockClear();
  });

  it("a TEMPORARY failure is marked delivery_failed, its reason stored and a bounded retry scheduled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db({ data: "ok" });
    send.mockResolvedValueOnce({
      status: "failed",
      reason: "timeout",
      detail: { provider: "smtp", step: "rcpt_to", messageTransmitted: false },
    } as never);
    const r = await receiveExternalReferral(input);
    expect(r).toMatchObject({ outcome: "created", delivery: "delivery_failed" });
    expect(rpc).toHaveBeenCalledWith("mark_external_referral_delivery_v1", { p_invitation_id: "inv-2", p_outcome: "delivery_failed" });
    expect(rpc).toHaveBeenCalledWith(
      "record_invitation_delivery_attempt_v1",
      expect.objectContaining({
        p_invitation_id: "inv-2",
        p_path: "intake",
        p_outcome: "delivery_failed",
        p_reason: "timeout",
        p_failure_class: "TEMPORARY",
        p_next_retry_at: expect.any(String),
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a PERMANENT failure is stored with no retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db({ data: "ok" });
    send.mockResolvedValueOnce({ status: "failed", reason: "smtp_rcpt_to_550" } as never);
    await receiveExternalReferral(input);
    expect(rpc).toHaveBeenCalledWith(
      "record_invitation_delivery_attempt_v1",
      expect.objectContaining({ p_failure_class: "PERMANENT", p_next_retry_at: null }),
    );
  });
});

describe("partner intake — an unclear SMTP result is never retried (owner correction item 3)", () => {
  beforeEach(() => {
    rpc.mockReset();
    send.mockClear();
  });

  it("a connection lost after the body was handed over → UNKNOWN_OUTCOME, no retry scheduled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db({ data: "ok" });
    send.mockResolvedValueOnce({
      status: "failed",
      reason: "connection_closed",
      detail: { provider: "smtp", step: "data_end", messageTransmitted: true, messageId: "<a1b2c3@labourmarket.ai>" },
    } as never);
    const r = await receiveExternalReferral(input);
    expect(r).toMatchObject({ delivery: "delivery_failed" });
    expect(rpc).toHaveBeenCalledWith(
      "record_invitation_delivery_attempt_v1",
      expect.objectContaining({
        p_failure_class: "UNKNOWN_OUTCOME",
        p_next_retry_at: null,
        p_detail: expect.objectContaining({ step: "data_end", message_transmitted: true, message_id: "<a1b2c3@labourmarket.ai>" }),
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("the invite link handed to the partner is the one minted at intake — a failed mail does not rotate it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db({ data: "ok" });
    send.mockResolvedValueOnce({ status: "failed", reason: "timeout" } as never);
    const r = await receiveExternalReferral(input);
    expect(r).toMatchObject({ outcome: "created", inviteUrl: expect.stringMatching(/^https:\/\/labourmarket\.ai\/en\/invite\//) });
    expect(rpc).not.toHaveBeenCalledWith("reissue_external_referral_v1", expect.anything());
  });
});
