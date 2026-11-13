import { PassThrough, Duplex } from "node:stream";
import { describe, expect, it } from "vitest";

import { addressOf, buildMessage, sendSmtp, smtpConfigFromEnv, type SmtpConfig } from "./smtp";

const CFG: SmtpConfig = {
  host: "smtp.example.test",
  port: 465,
  user: "info@labourmarket.ai",
  pass: "secret-not-real",
  from: "LabourMarket.ai <info@labourmarket.ai>",
};

/** A scripted SMTP server: answers each client line with the next reply. */
function fakeServer(script: Record<string, string>, log: string[]): () => Duplex {
  return () => {
    const toClient = new PassThrough();
    let inData = false;
    let data = "";
    const sock = new Duplex({
      read() {},
      write(chunk, _enc, cb) {
        const text = chunk.toString();
        if (inData) {
          data += text;
          if (data.endsWith("\r\n.\r\n")) {
            inData = false;
            log.push(`DATA-BODY ${data.length}`);
            sock.push(script["."] ?? "250 queued\r\n");
          }
          return cb();
        }
        for (const line of text.split("\r\n").filter(Boolean)) {
          const verb = line.split(/[ :]/)[0];
          log.push(verb === "AUTH" ? "AUTH ***" : line);
          if (verb === "DATA") inData = true;
          sock.push(script[verb] ?? "250 ok\r\n");
        }
        cb();
      },
    });
    void toClient;
    setTimeout(() => sock.push(script.greeting ?? "220 ready\r\n"), 1);
    return sock;
  };
}

describe("SMTP transport (Hostinger mailbox)", () => {
  it("reads config only from LM_SMTP_* and only implicit TLS 465", () => {
    expect(smtpConfigFromEnv({})).toBeNull();
    const env = { LM_SMTP_HOST: "smtp.hostinger.com", LM_SMTP_USER: "info@labourmarket.ai", LM_SMTP_PASS: "p", LM_SMTP_FROM: "LabourMarket.ai <info@labourmarket.ai>" };
    expect(smtpConfigFromEnv(env)).toMatchObject({ host: "smtp.hostinger.com", port: 465 });
    expect(smtpConfigFromEnv({ ...env, LM_SMTP_PORT: "587" })).toBeNull();
    expect(smtpConfigFromEnv({ ...env, LM_SMTP_PASS: "" })).toBeNull();
  });

  it("sends one message and returns the Message-ID only after 250 to the end of DATA", async () => {
    const log: string[] = [];
    const res = await sendSmtp(CFG, { to: "person@example.test", subject: "Jūsų paskyra ištrinta", text: "Sveiki,\n.\nviskas" }, {
      connect: fakeServer({ EHLO: "250-hello\r\n250 AUTH PLAIN\r\n", AUTH: "235 ok\r\n", DATA: "354 go\r\n", QUIT: "221 bye\r\n" }, log),
    });
    expect(res.status).toBe("sent");
    if (res.status === "sent") expect(res.messageId).toMatch(/^<[0-9a-f-]{36}@labourmarket\.ai>$/);
    expect(log.filter((l) => !l.startsWith("DATA-BODY"))).toEqual([
      "EHLO labourmarket.ai",
      "AUTH ***",
      "MAIL FROM:<info@labourmarket.ai>",
      "RCPT TO:<person@example.test>",
      "DATA",
      "QUIT",
    ]);
  });

  it("a refused login is a failure with the step and code, never 'sent'", async () => {
    const res = await sendSmtp(CFG, { to: "person@example.test", subject: "s", text: "t" }, {
      connect: fakeServer({ AUTH: "535 bad credentials\r\n" }, []),
    });
    expect(res).toEqual({ status: "failed", reason: "smtp_auth_535" });
  });

  it("a refused recipient is a failure", async () => {
    const res = await sendSmtp(CFG, { to: "nobody@example.test", subject: "s", text: "t" }, {
      connect: fakeServer({ AUTH: "235 ok\r\n", RCPT: "550 no such user\r\n" }, []),
    });
    expect(res).toEqual({ status: "failed", reason: "smtp_rcpt_to_550" });
  });

  it("refuses header injection in the recipient before connecting", async () => {
    let connected = false;
    const res = await sendSmtp(CFG, { to: "a@example.test\r\nBcc: x@example.test", subject: "s", text: "t" }, {
      connect: () => {
        connected = true;
        return new PassThrough();
      },
    });
    expect(res).toEqual({ status: "failed", reason: "invalid_address" });
    expect(connected).toBe(false);
  });

  it("builds a UTF-8 message whose subject and body cannot break the protocol", () => {
    const m = buildMessage(CFG, { to: "p@example.test", subject: "Ištrinta\r\nBcc: x", text: ".\r\n.\r\nQUIT" }, "<id@labourmarket.ai>", new Date("2026-10-19T12:00:00Z"));
    expect(m).toContain("Content-Transfer-Encoding: base64");
    expect(m).not.toMatch(/\r\nBcc:/);
    expect(m.split("\r\n\r\n")[1].split("\r\n").every((l) => !l.startsWith("."))).toBe(true);
    expect(addressOf(CFG.from)).toBe("info@labourmarket.ai");
  });

  it("without html, Reply-To or extra headers the message is exactly the plain one it always was", () => {
    const m = buildMessage(CFG, { to: "p@example.test", subject: "s", text: "t" }, "<id@labourmarket.ai>", new Date("2026-10-19T12:00:00Z"));
    expect(m).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(m).not.toContain("multipart");
    expect(m).not.toContain("Reply-To");
  });

  it("with html it is multipart/alternative: text first, then html, both base64", () => {
    const html = "<p>Sveiki, ąčęėįšųūž</p>";
    const m = buildMessage(CFG, { to: "p@example.test", subject: "s", text: "Sveiki", html, replyTo: "info@labourmarket.ai", headers: { "X-LabourMarket-Notification": "request" } }, "<abc-123@labourmarket.ai>", new Date("2026-11-13T12:00:00Z"));
    const boundary = /Content-Type: multipart\/alternative; boundary="([^"]+)"/.exec(m)?.[1];
    expect(boundary).toBeTruthy();
    expect(m).toContain("Reply-To: <info@labourmarket.ai>");
    expect(m).toContain("X-LabourMarket-Notification: request");
    expect(m).toContain("From: =?UTF-8?B?");
    const parts = m.split(`--${boundary}`);
    expect(parts).toHaveLength(4); // headers, text, html, closing "--"
    expect(parts[1]).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(parts[2]).toContain("Content-Type: text/html; charset=UTF-8");
    expect(parts[3].startsWith("--")).toBe(true);
    const decode = (part: string) => Buffer.from(part.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(decode(parts[1])).toBe("Sveiki");
    expect(decode(parts[2])).toBe(html);
    // no line of the body can end the DATA phase early
    expect(m.split("\r\n").every((l) => l !== ".")).toBe(true);
  });

  it("refuses an unsafe Reply-To or header before connecting", async () => {
    let connected = false;
    const connect = () => {
      connected = true;
      return new PassThrough();
    };
    expect(await sendSmtp(CFG, { to: "p@example.test", subject: "s", text: "t", replyTo: "a@example.test\r\nBcc: x@example.test" }, { connect })).toEqual({ status: "failed", reason: "invalid_reply_to" });
    expect(await sendSmtp(CFG, { to: "p@example.test", subject: "s", text: "t", headers: { "X-A": "v\r\nBcc: x@example.test" } }, { connect })).toEqual({ status: "failed", reason: "invalid_header" });
    expect(await sendSmtp(CFG, { to: "p@example.test", subject: "s", text: "t", headers: { Bcc: "x@example.test" } }, { connect })).toEqual({ status: "failed", reason: "invalid_header" });
    expect(connected).toBe(false);
  });

  it("sends an html message through the same conversation and gets the server's 250", async () => {
    const log: string[] = [];
    const res = await sendSmtp(CFG, { to: "person@example.test", subject: "s", text: "t", html: "<p>t</p>", replyTo: "info@labourmarket.ai" }, {
      connect: fakeServer({ EHLO: "250-hello\r\n250 AUTH PLAIN\r\n", AUTH: "235 ok\r\n", DATA: "354 go\r\n", QUIT: "221 bye\r\n" }, log),
    });
    expect(res.status).toBe("sent");
  });
});
