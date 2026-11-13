import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));

import type { SendDiagnostics } from "@/lib/email/delivery-failure";
import { decideAttempt, recordDeliveryAttempt } from "@/lib/invitations/delivery-attempts";

const now = new Date("2026-11-13T18:51:52Z");
const beforeData: SendDiagnostics = { provider: "smtp", step: "rcpt_to", messageTransmitted: false };
const afterData: SendDiagnostics = {
  provider: "smtp",
  step: "data_end",
  messageTransmitted: true,
  messageId: "<0f6c1d2e-1111-4222-8333-944455556666@labourmarket.ai>",
};

describe("decideAttempt", () => {
  it("sent → sent with its Message-ID; non-attempts are not recorded", () => {
    expect(
      decideAttempt({ result: { status: "sent", detail: { ...afterData, replyCode: "250" } }, attempts: 1, autoRetry: true, now }),
    ).toMatchObject({ outcome: "sent", detail: { messageId: afterData.messageId, replyCode: "250" } });
    expect(decideAttempt({ result: { status: "logged" }, attempts: 1, autoRetry: true, now })).toEqual({
      outcome: "not_attempted",
    });
    expect(
      decideAttempt({ result: { status: "suppressed_synthetic_address" }, attempts: 1, autoRetry: true, now }),
    ).toEqual({ outcome: "not_attempted" });
  });

  it("a CONFIRMED temporary failure on an auto-retry path is scheduled; elsewhere it is not", () => {
    const failed = { status: "failed", reason: "timeout", detail: beforeData } as const;
    expect(decideAttempt({ result: failed, attempts: 1, autoRetry: true, now })).toMatchObject({
      outcome: "delivery_failed",
      reason: "timeout",
      failureClass: "TEMPORARY",
      nextRetryAt: new Date("2026-11-13T19:01:52Z"),
    });
    expect(decideAttempt({ result: failed, attempts: 1, autoRetry: false, now })).toMatchObject({ nextRetryAt: null });
  });

  it("an unclear result is UNKNOWN_OUTCOME and is never scheduled", () => {
    expect(
      decideAttempt({ result: { status: "failed", reason: "timeout", detail: afterData }, attempts: 1, autoRetry: true, now }),
    ).toMatchObject({ failureClass: "UNKNOWN_OUTCOME", nextRetryAt: null });
    expect(decideAttempt({ result: { status: "failed", reason: "timeout" }, attempts: 1, autoRetry: true, now })).toMatchObject({
      failureClass: "UNKNOWN_OUTCOME",
      nextRetryAt: null,
    });
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

  it("logs and stores codes only — step, reply, enhanced code, Message-ID — never the address", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    await recordDeliveryAttempt({
      invitationId: "862a91f4-a58f-4359-81a8-a22d11218445",
      path: "intake",
      result: {
        status: "failed",
        reason: "smtp_rcpt_to_550",
        detail: { provider: "smtp", step: "rcpt_to", replyCode: "550", enhancedCode: "5.1.1", messageTransmitted: false, messageId: afterData.messageId, durationMs: 640 },
      },
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
      p_detail: {
        provider: "smtp",
        step: "rcpt_to",
        reply_code: "550",
        enhanced_code: "5.1.1",
        message_transmitted: false,
        message_id: afterData.messageId,
        duration_ms: 640,
      },
    });
    const line = errors[0].join(" ");
    expect(line).toContain("reason=smtp_rcpt_to_550");
    expect(line).toContain("class=PERMANENT");
    expect(line).toContain("step=rcpt_to");
    expect(line).toContain("enhanced=5.1.1");
    expect(line).not.toMatch(/@/);
  });

  it("never throws: a missing function (migration not applied) is silent, the log line still exists", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const r = await recordDeliveryAttempt({
      invitationId: "i",
      path: "create",
      result: { status: "failed", reason: "timeout", detail: beforeData },
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
    ).resolves.toMatchObject({ outcome: "sent" });
  });
});
