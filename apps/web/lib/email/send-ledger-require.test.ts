import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sendTransactionalEmail } = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(async () => ({ status: "sent" as const })),
}));
vi.mock("@/lib/email/transactional", () => ({
  isTransactionalEmailConfigured: () => true,
  sendTransactionalEmail,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { __setEmailSendStoreForTests, guardedSendTransactionalEmail } from "./send-ledger-store";

const message = { to: "person@example.test", subject: "s", text: "b" };
const failingStore = {
  reserve: async () => {
    throw new Error("reserve_email_send_v1 failed: 57014");
  },
};

describe("guarded send — requireLedger (partner referral sends)", () => {
  afterEach(() => {
    __setEmailSendStoreForTests(null);
    sendTransactionalEmail.mockClear();
  });

  it("the ledger cannot be written → a partner referral mail is NOT sent", async () => {
    __setEmailSendStoreForTests(failingStore);
    const r = await guardedSendTransactionalEmail(message, { kind: "invitation", requireLedger: true });
    expect(r).toEqual({ status: "failed", reason: "ledger_unavailable" });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("other mail keeps the documented fail-open degraded path", async () => {
    __setEmailSendStoreForTests(failingStore);
    const r = await guardedSendTransactionalEmail(message, { kind: "invitation" });
    expect(r).toEqual({ status: "sent" });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("a written ledger row → the partner referral mail is sent", async () => {
    __setEmailSendStoreForTests({ reserve: async () => ({ allowed: true, organizationId: null }) });
    const r = await guardedSendTransactionalEmail(message, { kind: "invitation", requireLedger: true });
    expect(r).toEqual({ status: "sent" });
  });
});
