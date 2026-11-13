import { describe, expect, it } from "vitest";

import {
  classifyDeliveryFailure,
  deliveryStateOf,
  MAX_DELIVERY_ATTEMPTS,
  nextRetryAt,
  normaliseReason,
} from "@/lib/email/delivery-failure";

describe("classifyDeliveryFailure — every reason the transports return", () => {
  it.each([
    ["timeout", "TEMPORARY"],
    ["connection_closed", "TEMPORARY"],
    ["transport_error", "TEMPORARY"],
    ["rate_limited", "TEMPORARY"],
    ["ledger_unavailable", "TEMPORARY"],
    ["smtp_greeting_421", "TEMPORARY"],
    ["smtp_rcpt_to_450", "TEMPORARY"],
    ["smtp_rcpt_to_452", "TEMPORARY"],
    ["smtp_data_end_451", "TEMPORARY"],
    ["smtp_greeting_none", "TEMPORARY"],
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
  ] as const)("%s → %s", (reason, cls) => {
    expect(classifyDeliveryFailure(reason)).toEqual({ reason, failureClass: cls });
  });

  it("an unknown code is TEMPORARY (bounded retries, the code is kept)", () => {
    expect(classifyDeliveryFailure("ECONNRESET weird")).toEqual({
      reason: "econnreset_weird",
      failureClass: "TEMPORARY",
    });
    expect(classifyDeliveryFailure(null).reason).toBe("unknown");
  });

  it("a stored reason is a code only: [a-z0-9_]{1,64}, never free text or an address", () => {
    const r = normaliseReason("Mailbox <someone@example.com> unavailable! ".repeat(5));
    expect(r).toMatch(/^[a-z0-9_]{1,64}$/);
    expect(r).not.toContain("@");
  });
});

describe("nextRetryAt — exponential backoff, bounded", () => {
  const now = new Date("2026-11-13T18:51:52Z");
  it("10 min, 1 h, 6 h, then none (dead letter)", () => {
    const at = (attempts: number) => nextRetryAt({ failureClass: "TEMPORARY", attempts, now });
    expect(at(1)?.toISOString()).toBe("2026-11-13T19:01:52.000Z");
    expect(at(2)?.toISOString()).toBe("2026-11-13T19:51:52.000Z");
    expect(at(3)?.toISOString()).toBe("2026-11-14T00:51:52.000Z");
    expect(at(4)).toBeNull();
    expect(MAX_DELIVERY_ATTEMPTS).toBe(4);
  });
  it("never retries a permanent or configuration failure", () => {
    expect(nextRetryAt({ failureClass: "PERMANENT", attempts: 1, now })).toBeNull();
    expect(nextRetryAt({ failureClass: "CONFIGURATION", attempts: 1, now })).toBeNull();
  });
});

describe("deliveryStateOf — SENT is never DELIVERED", () => {
  it("a provider acknowledgement alone is SENT", () => {
    expect(deliveryStateOf({ deliveryStatus: "sent" })).toBe("SENT");
  });
  it("DELIVERED needs the recipient's own evidence", () => {
    expect(deliveryStateOf({ deliveryStatus: "sent", firstOpenedAt: "2026-11-13T19:00:00Z" })).toBe("DELIVERED");
    expect(deliveryStateOf({ deliveryStatus: "sent", acceptedAt: "2026-11-13T19:00:00Z" })).toBe("DELIVERED");
  });
  it("separates every state", () => {
    expect(deliveryStateOf({ deliveryStatus: "not_sent" })).toBe("CREATED");
    expect(deliveryStateOf({ deliveryStatus: "not_sent", deliveryReservedAt: "x" })).toBe("QUEUED");
    expect(deliveryStateOf({ deliveryStatus: "sent", bouncedAt: "x" })).toBe("BOUNCED");
    expect(
      deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "TEMPORARY", nextRetryAt: "x" }),
    ).toBe("TEMPORARY_FAILURE");
    expect(deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "PERMANENT", deadLetteredAt: "x" })).toBe(
      "PERMANENT_FAILURE",
    );
    expect(deliveryStateOf({ deliveryStatus: "delivery_failed", failureClass: "TEMPORARY", deadLetteredAt: "x" })).toBe(
      "DEAD_LETTER",
    );
  });
});
