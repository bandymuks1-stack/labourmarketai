import { describe, expect, it } from "vitest";

import { parseDeliveryReport } from "@/lib/email/dsn";

const ID = "<6f1e2d3c-aaaa-4bbb-8ccc-1234567890ab@labourmarket.ai>";
const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");

/** A synthetic RFC 3464 report, shaped like a Postfix / Hostinger bounce. */
function rfc3464(action: string, status: string, messageId = ID, returned: "headers" | "message" = "headers") {
  return crlf(`From: MAILER-DAEMON@mx.example.test
To: info@labourmarket.ai
Subject: Undelivered Mail Returned to Sender
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="B1"

--B1
Content-Type: text/plain; charset=us-ascii

This is the mail system. Your message could not be delivered to
<person@example.test>: host gmail-smtp-in.l.google.com said: 550 5.1.1 The email account does not exist.

--B1
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.test

Final-Recipient: rfc822; person@example.test
Original-Recipient: rfc822;person@example.test
Action: ${action}
Status: ${status}
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.

--B1
Content-Type: ${returned === "headers" ? "text/rfc822-headers" : "message/rfc822"}

From: LabourMarket.ai <info@labourmarket.ai>
To: <person@example.test>
Subject: =?UTF-8?B?a3ZpZXRpbWFz?=
Message-ID: ${messageId}

${returned === "message" ? "body text\n" : ""}--B1--
`);
}

describe("parseDeliveryReport — RFC 3464", () => {
  it("a permanent bounce → failed + 5.1.1 + OUR Message-ID; never the address or the diagnostic text", () => {
    const fact = parseDeliveryReport(rfc3464("failed", "5.1.1"), "labourmarket.ai");
    expect(fact).toEqual({ messageId: ID, action: "failed", status: "5.1.1" });
    expect(JSON.stringify(fact)).not.toContain("person@");
    expect(JSON.stringify(fact)).not.toContain("does not exist");
  });

  it("returned as a full message/rfc822 part works too", () => {
    expect(parseDeliveryReport(rfc3464("failed", "5.2.2", ID, "message"), "labourmarket.ai")).toMatchObject({
      action: "failed",
      status: "5.2.2",
    });
  });

  it("a positive delivery report → delivered (the only source of DELIVERED_CONFIRMED)", () => {
    expect(parseDeliveryReport(rfc3464("delivered", "2.0.0"), "labourmarket.ai")).toEqual({
      messageId: ID,
      action: "delivered",
      status: "2.0.0",
    });
  });

  it("a delay warning → delayed (not a bounce)", () => {
    expect(parseDeliveryReport(rfc3464("delayed", "4.4.7"), "labourmarket.ai")?.action).toBe("delayed");
  });

  it("a report about someone else's message is ignored", () => {
    expect(parseDeliveryReport(rfc3464("failed", "5.1.1", "<abc@other.example>"), "labourmarket.ai")).toBeNull();
    expect(
      parseDeliveryReport(rfc3464("failed", "5.1.1", "<6f1e2d3c-aaaa-4bbb-8ccc-1234567890ab@nonstopgroup.eu>"), "labourmarket.ai"),
    ).toBeNull();
  });
});

describe("parseDeliveryReport — non-standard bounces", () => {
  it("a plain-text MAILER-DAEMON bounce quoting our Message-ID → failed", () => {
    const raw = crlf(`From: Mail Delivery System <MAILER-DAEMON@mx.example.test>
Subject: Mail delivery failed: returning message to sender
Content-Type: text/plain

This message was created automatically by mail delivery software.
A message that you sent could not be delivered. 550 5.7.1 rejected

------ This is a copy of the message, including all the headers. ------
Message-ID: ${ID}
`);
    expect(parseDeliveryReport(raw, "labourmarket.ai")).toEqual({ messageId: ID, action: "failed", status: "5.7.1" });
  });

  it("an ordinary reply that quotes our Message-ID is NOT a bounce", () => {
    const raw = crlf(`From: Person <person@example.test>
Subject: Re: kvietimas
In-Reply-To: ${ID}
Content-Type: text/plain

Ačiū, užsiregistruosiu.
`);
    expect(parseDeliveryReport(raw, "labourmarket.ai")).toBeNull();
  });

  it("base64-encoded delivery-status parts are decoded", () => {
    const ds = Buffer.from("Final-Recipient: rfc822; x@example.test\r\nAction: failed\r\nStatus: 5.4.1\r\n").toString("base64");
    const raw = crlf(`From: postmaster@mx.example.test
Content-Type: multipart/report; report-type="delivery-status"; boundary=Z

--Z
Content-Type: message/delivery-status
Content-Transfer-Encoding: base64

${ds}
--Z
Content-Type: text/rfc822-headers

Message-ID: ${ID}
--Z--
`);
    expect(parseDeliveryReport(raw, "labourmarket.ai")).toEqual({ messageId: ID, action: "failed", status: "5.4.1" });
  });

  it("garbage and oversize input → null, never a throw", () => {
    expect(parseDeliveryReport("", "labourmarket.ai")).toBeNull();
    expect(parseDeliveryReport("not a message at all", "labourmarket.ai")).toBeNull();
    expect(parseDeliveryReport("x".repeat(2_000_001), "labourmarket.ai")).toBeNull();
  });
});
