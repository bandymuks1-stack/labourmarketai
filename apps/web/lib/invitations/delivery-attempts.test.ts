import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));

import { decideAttempt, recordDeliveryAttempt } from "@/lib/invitations/delivery-attempts";

const now = new Date("2026-11-13T18:51:52Z");

describe("decideAttempt", () => {
  it("sent → sent; non-attempts are not recorded", () => {
    expect(decideAttempt({ result: { status: "sent" }, attempts: 1, autoRetry: true, now })).toEqual({ outcome: "sent" });
    expect(decideAttempt({ result: { status: "logged" }, attempts: 1, autoRetry: true, now })).toEqual({
      outcome: "not_attempted",
    });
    expect(
      decideAttempt({ result: { status: "suppressed_synthetic_address" }, attempts: 1, autoRetry: true, now }),
    ).toEqual({ outcome: "not_attempted" });
  });

  it("a TEMPORARY failure on an auto-retry path is scheduled; elsewhere it is not", () => {
    const failed = { status: "failed", reason: "timeout" } as const;
    expect(decideAttempt({ result: failed, attempts: 1, autoRetry: true, now })).toEqual({
      outcome: "delivery_failed",
      reason: "timeout",
      failureClass: "TEMPORARY",
      nextRetryAt: new Date("2026-11-13T19:01:52Z"),
    });
    expect(decideAttempt({ result: failed, attempts: 1, autoRetry: false, now })).toMatchObject({ nextRetryAt: null });
  });
});

describe("recordDeliveryAttempt", () => {
  const rpc = vi.fn();
  const errors: unknown[][] = [];
  beforeEach(() => {
    rpc.mockReset();
    errors.length = 0;
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      errors.push(a);
    });
  });

  it("logs the reason code and class — never the address — and stores the attempt", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    await recordDeliveryAttempt({
      invitationId: "862a91f4-a58f-4359-81a8-a22d11218445",
      path: "intake",
      result: { status: "failed", reason: "smtp_rcpt_to_550" },
      attempts: 1,
      autoRetry: true,
      now,
      client: { rpc } as never,
    });
    expect(rpc).toHaveBeenCalledWith("record_invitation_delivery_attempt_v1", {
      p_invitation_id: "862a91f4-a58f-4359-81a8-a22d11218445",
      p_path: "intake",
      p_outcome: "delivery_failed",
      p_reason: "smtp_rcpt_to_550",
      p_failure_class: "PERMANENT",
      p_next_retry_at: null,
    });
    const line = errors[0].join(" ");
    expect(line).toContain("reason=smtp_rcpt_to_550");
    expect(line).toContain("class=PERMANENT");
    expect(line).not.toMatch(/@/);
  });

  it("never throws: a missing function (migration not applied) is silent, the log line still exists", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const r = await recordDeliveryAttempt({
      invitationId: "i",
      path: "create",
      result: { status: "failed", reason: "timeout" },
      attempts: 1,
      autoRetry: false,
      client: { rpc } as never,
    });
    expect(r.outcome).toBe("delivery_failed");
    expect(errors).toHaveLength(1);
  });

  it("never throws when the client itself throws", async () => {
    rpc.mockRejectedValue(new Error("down"));
    await expect(
      recordDeliveryAttempt({ invitationId: "i", path: "resend", result: { status: "sent" }, attempts: 1, autoRetry: false, client: { rpc } as never }),
    ).resolves.toEqual({ outcome: "sent" });
  });
});
