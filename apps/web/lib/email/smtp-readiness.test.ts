import { describe, expect, it } from "vitest";

import { smtpReadiness } from "@/lib/email/smtp";

/** Which LM_SMTP_* setting stops the mail — presence only, never a value. */
const FULL = {
  LM_SMTP_HOST: "smtp.example.test",
  LM_SMTP_PORT: "465",
  LM_SMTP_USER: "box@example.test",
  LM_SMTP_PASS: "s3cret-value",
  LM_SMTP_FROM: "LabourMarket.ai <box@example.test>",
};

describe("smtpReadiness", () => {
  it("all five set on 465 → ready", () => {
    const r = smtpReadiness(FULL);
    expect(r.ready).toBe(true);
    expect(r.present).toEqual({ host: true, user: true, pass: true, from: true });
    expect(r.portSupported).toBe(true);
  });

  it("a password alone is not the only way to fail: a missing From or port 587 is named", () => {
    const noFrom = smtpReadiness({ ...FULL, LM_SMTP_FROM: "" });
    expect(noFrom.ready).toBe(false);
    expect(noFrom.present.from).toBe(false);
    expect(noFrom.present.pass).toBe(true);
    const starttls = smtpReadiness({ ...FULL, LM_SMTP_PORT: "587" });
    expect(starttls.ready).toBe(false);
    expect(starttls.port).toBe(587);
    expect(starttls.portSupported).toBe(false);
  });

  it("an unset port means the default 465", () => {
    const rest: Record<string, string> = { ...FULL };
    delete rest.LM_SMTP_PORT;
    expect(smtpReadiness(rest).port).toBe(465);
  });

  it("never carries a value", () => {
    const text = JSON.stringify(smtpReadiness(FULL));
    for (const v of [FULL.LM_SMTP_PASS, FULL.LM_SMTP_USER, FULL.LM_SMTP_HOST]) expect(text).not.toContain(v);
  });
});
