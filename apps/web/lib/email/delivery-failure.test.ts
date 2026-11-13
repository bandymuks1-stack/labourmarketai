import { describe, expect, it } from "vitest";

import {
  classifyDeliveryFailure,
  deliveryStateOf,
  linkOpened,
  MAX_DELIVERY_ATTEMPTS,
  nextRetryAt,
  normaliseReason,
  sanitiseDiagnostics,
  type SendDiagnostics,
} from "@/lib/email/delivery-failure";

const smtpAt = (step: SendDiagnostics["step"], transmitted = false): SendDiagnostics => ({
  provider: "smtp",
  step,
  messageTransmitted: transmitted,
});

describe("classifyDeliveryFailure — explicit replies", () => {
  it.each([
    ["smtp_greeting_421", "TEMPORARY"],
    ["smtp_rcpt_to_450", "TEMPORARY"],
    ["smtp_rcpt_to_452", "TEMPORARY"],
    ["smtp_data_end_451", "TEMPORARY"], // the server ANSWERED 451: explicitly not accepted
    ["provider_status_429", "TEMPORARY"],
    ["provider_status_503", "TEMPORARY"],
    ["invalid_address", "PERMANENT"],
    ["smtp_rcpt_to_550", "PERMANENT"],
    ["smtp_rcpt_to_553", "PERMANENT"],
    ["smtp_data_end_554", "PERMANENT"],
    ["provider_status_422", "PERMANENT"],
    ["smtp_auth_535", "CONFIGURATION"],
    ["smtp_auth_none", "CONFIGURATION"],
    ["smtp_mail_from_550", "CONFIGURATION"],
    ["smtp_ehlo_554", "CONFIGURATION"],
    ["provider_status_401", "CONFIGURATION"],
    ["provider_status_403", "CONFIGURATION"],
    ["not_configured", "CONFIGURATION"],
    ["provider_status_500", "UNKNOWN_OUTCOME"],
    ["provider_status_504", "UNKNOWN_OUTCOME"],
  ] as const)("%s → %s", (reason, cls) => {
    expect(classifyDeliveryFailure(reason)).toEqual({ reason, failureClass: cls });
  });

  it("our own guards refused before any provider call → TEMPORARY (nothing can have left)", () => {
    expect(classifyDeliveryFailure("rate_limited").failureClass).toBe("TEMPORARY");
    expect(classifyDeliveryFailure("ledger_unavailable").failureClass).toBe("TEMPORARY");
  });
});

describe("classifyDeliveryFailure — no reply: retry ONLY when the body provably never left", () => {
  it.each(["timeout", "connection_closed", "transport_error", "smtp_greeting_none"])(
    "%s before DATA was transmitted → TEMPORARY",
    (reason) => {
      expect(classifyDeliveryFailure(reason, smtpAt("rcpt_to")).failureClass).toBe("TEMPORARY");
      expect(classifyDeliveryFailure(reason, smtpAt("greeting")).failureClass).toBe("TEMPORARY");
    },
  );

  it.each(["timeout", "connection_closed", "transport_error"])(
    "%s after the body was handed over → UNKNOWN_OUTCOME (may have been accepted)",
    (reason) => {
      expect(classifyDeliveryFailure(reason, smtpAt("data_end", true)).failureClass).toBe("UNKNOWN_OUTCOME");
    },
  );

  it("no diagnostics at all → UNKNOWN_OUTCOME (no proof that nothing left)", () => {
    expect(classifyDeliveryFailure("timeout").failureClass).toBe("UNKNOWN_OUTCOME");
    expect(classifyDeliveryFailure("ECONNRESET weird").failureClass).toBe("UNKNOWN_OUTCOME");
  });

  it("an HTTP provider's transport error is UNKNOWN_OUTCOME (the request may have reached it)", () => {
    expect(
      classifyDeliveryFailure("transport_error", { provider: "resend", step: "http", messageTransmitted: true })
        .failureClass,
    ).toBe("UNKNOWN_OUTCOME");
  });
});

describe("diagnostics are codes only", () => {
  it("a stored reason is [a-z0-9_]{1,64}, never free text or an address", () => {
    const r = normaliseReason("Mailbox <someone@example.com> unavailable! ".repeat(5));
    expect(r).toMatch(/^[a-z0-9_]{1,64}$/);
    expect(r).not.toContain("@");
  });

  it("malformed fields are dropped, well-formed kept", () => {
    expect(
      sanitiseDiagnostics({
        provider: "smtp",
        step: "rcpt_to",
        replyCode: "550 user unknown",
        enhancedCode: "5.1.1",
        messageTransmitted: false,
        messageId: "<person@example.com> extra",
        durationMs: 812.4,
      }),
    ).toEqual({
      provider: "smtp",
      step: "rcpt_to",
      replyCode: null,
      enhancedCode: "5.1.1",
      messageTransmitted: false,
      messageId: null,
      durationMs: 812,
    });
  });
});

describe("nextRetryAt — exponential backoff, bounded, TEMPORARY only", () => {
  const now = new Date("2026-11-13T18:51:52Z");
  it("10 min, 1 h, 6 h, then none (dead letter)", () => {
    const at = (attempts: number) => nextRetryAt({ failureClass: "TEMPORARY", attempts, now });
    expect(at(1)?.toISOString()).toBe("2026-11-13T19:01:52.000Z");
    expect(at(2)?.toISOString()).toBe("2026-11-13T19:51:52.000Z");
    expect(at(3)?.toISOString()).toBe("2026-11-14T00:51:52.000Z");
    expect(at(4)).toBeNull();
    expect(MAX_DELIVERY_ATTEMPTS).toBe(4);
  });
  it.each(["PERMANENT", "CONFIGURATION", "UNKNOWN_OUTCOME"] as const)("never retries %s", (failureClass) => {
    expect(nextRetryAt({ failureClass, attempts: 1, now })).toBeNull();
  });
});

describe("deliveryStateOf — the owner's state model", () => {
  it("a provider acknowledgement alone is SMTP_ACCEPTED", () => {
    expect(deliveryStateOf({ deliveryStatus: "sent" })).toBe("SMTP_ACCEPTED");
  });
  it("LINK_OPENED is never delivery proof — it is reported beside the state", () => {
    const opened = { deliveryStatus: "sent", firstOpenedAt: "2026-11-13T19:00:00Z" };
    expect(deliveryStateOf(opened)).toBe("SMTP_ACCEPTED");
    expect(linkOpened(opened)).toBe(true);
    // Incident 862a91f4: opened 21 s after creation, its mail failed.
    const incident = { deliveryStatus: "delivery_failed", failureClass: null, firstOpenedAt: "2026-11-13T18:52:12Z" };
    expect(deliveryStateOf(incident)).toBe("UNKNOWN_OUTCOME");
    expect(linkOpened(incident)).toBe(true);
  });
  it("DELIVERED_CONFIRMED needs a positive delivery report", () => {
    expect(deliveryStateOf({ deliveryStatus: "sent", deliveryConfirmedAt: "x" })).toBe("DELIVERED_CONFIRMED");
  });
  it("separates every state", () => {
    expect(deliveryStateOf({ deliveryStatus: "not_sent" })).toBe("CREATED");
    expect(deliveryStateOf({ deliveryStatus: "not_sent", deliveryReservedAt: "x" })).toBe("QUEUED");
    expect(deliveryStateOf({ deliveryStatus: "sent", bouncedAt: "x" })).toBe("BOUNCED");
    expect(deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "TEMPORARY", nextRetryAt: "x" })).toBe(
      "TEMPORARY_FAILURE",
    );
    expect(deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "PERMANENT" })).toBe("PERMANENT_FAILURE");
    expect(deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "CONFIGURATION" })).toBe(
      "CONFIGURATION_FAILURE",
    );
    expect(deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "UNKNOWN_OUTCOME" })).toBe(
      "UNKNOWN_OUTCOME",
    );
    expect(deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "TEMPORARY", deadLetteredAt: "x" })).toBe(
      "DEAD_LETTER",
    );
  });
});
