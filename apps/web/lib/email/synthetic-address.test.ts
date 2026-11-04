import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sendSmtp } = vi.hoisted(() => ({ sendSmtp: vi.fn(async () => ({ status: "sent" as const })) }));
vi.mock("@/lib/email/smtp", () => ({
  sendSmtp,
  smtpConfigFromEnv: () => ({ host: "smtp.example.test", port: 465, user: "u", pass: "p", from: "f@example.test" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { isSyntheticQaPlusAddress } from "./synthetic-address";
import { sendTransactionalEmail } from "./transactional";
import { __setEmailSendStoreForTests, guardedSendTransactionalEmail } from "./send-ledger-store";

/**
 * Synthetic QA plus-addresses (`qa.<name>+<tag>@labourmarket.ai`) bounce with
 * 550 at the domain's mail host, which has no plus-addressing. The send choke
 * point never delivers to them, answers the tagged
 * `suppressed_synthetic_address` (not "sent", not a retryable failure) and
 * writes no send-ledger row. Every other address — `qa.invited@` included —
 * is untouched.
 */
describe("isSyntheticQaPlusAddress", () => {
  it.each([
    "qa.worker+goal3@labourmarket.ai",
    "qa.company+r41584540254@labourmarket.ai",
    "QA.Worker+Tag@LabourMarket.AI",
    "  qa.agency+x-1@labourmarket.ai ",
  ])("suppresses %s", (address) => {
    expect(isSyntheticQaPlusAddress(address)).toBe(true);
  });

  it.each([
    "qa.invited@labourmarket.ai",
    "qa.worker@labourmarket.ai",
    "info@labourmarket.ai",
    "qa.worker+tag@example.com",
    "qa.worker+tag@labourmarket.ai.evil.test",
    "person+qa.worker@labourmarket.ai",
    "xqa.worker+tag@labourmarket.ai",
    "qa.+tag@labourmarket.ai",
    "jonas+work@gmail.com",
  ])("keeps %s deliverable", (address) => {
    expect(isSyntheticQaPlusAddress(address)).toBe(false);
  });
});

describe("the send choke point", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sendSmtp.mockClear();
    __setEmailSendStoreForTests(null);
  });

  const smtpOn = () => vi.stubEnv("INVITE_EMAIL_PROVIDER", "smtp");
  const message = (to: string) => ({ to, subject: "s", text: "b" });

  it("never hands a synthetic plus-address to the provider", async () => {
    smtpOn();
    expect(await sendTransactionalEmail(message("qa.worker+goal3@labourmarket.ai"))).toEqual({
      status: "suppressed_synthetic_address",
    });
    expect(sendSmtp).not.toHaveBeenCalled();
  });

  it("still delivers to the real QA mailbox and to every other address", async () => {
    smtpOn();
    expect(await sendTransactionalEmail(message("qa.invited@labourmarket.ai"))).toEqual({ status: "sent" });
    expect(await sendTransactionalEmail(message("person@example.test"))).toEqual({ status: "sent" });
    expect(sendSmtp).toHaveBeenCalledTimes(2);
  });

  it("the guarded send writes no ledger row for a suppressed address", async () => {
    smtpOn();
    const reserve = vi.fn(async () => ({ allowed: true as const, organizationId: null }));
    __setEmailSendStoreForTests({ reserve });
    const r = await guardedSendTransactionalEmail(message("qa.company+r1@labourmarket.ai"), {
      kind: "invitation",
      requireLedger: true,
    });
    expect(r).toEqual({ status: "suppressed_synthetic_address" });
    expect(reserve).not.toHaveBeenCalled();
    expect(sendSmtp).not.toHaveBeenCalled();
  });

  it("the guarded send reserves and sends as before for qa.invited@", async () => {
    smtpOn();
    const reserve = vi.fn(async () => ({ allowed: true as const, organizationId: null }));
    __setEmailSendStoreForTests({ reserve });
    const r = await guardedSendTransactionalEmail(message("qa.invited@labourmarket.ai"), { kind: "notification" });
    expect(r).toEqual({ status: "sent" });
    expect(reserve).toHaveBeenCalledTimes(1);
  });
});
