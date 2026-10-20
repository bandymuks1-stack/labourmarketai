import "server-only";

import { randomUUID } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import type { Duplex } from "node:stream";

/**
 * SMTP transport for the ONE existing mailbox (owner decision 2026-10-19:
 * Hostinger SMTP, info@labourmarket.ai). No dependency, no new service:
 * implicit TLS (port 465), AUTH PLAIN, one message per connection.
 *
 * Configuration (server-only env on the VPS — never in code or GitHub):
 *   LM_SMTP_HOST   e.g. smtp.hostinger.com
 *   LM_SMTP_PORT   465 (implicit TLS; the only mode supported)
 *   LM_SMTP_USER   the mailbox login
 *   LM_SMTP_PASS   the mailbox password (secret)
 *   LM_SMTP_FROM   e.g. "LabourMarket.ai <info@labourmarket.ai>"
 *
 * TRUTHFUL DELIVERY: `sent` only after the server answered 250 to the end of
 * DATA — that is "accepted by our mail server", the strongest fact SMTP gives.
 * The Message-ID is generated here and returned as the proof handle. Nothing
 * here logs: no address, no password, no server reply text.
 */

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export type SmtpMessage = { to: string; subject: string; text: string };

export type SmtpSendResult =
  | { status: "sent"; messageId: string }
  | { status: "not_configured" }
  | { status: "failed"; reason: string };

const TIMEOUT_MS = 20_000;

export function smtpConfigFromEnv(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = (env.LM_SMTP_HOST ?? "").trim();
  const port = Number((env.LM_SMTP_PORT ?? "465").trim());
  const user = (env.LM_SMTP_USER ?? "").trim();
  const pass = env.LM_SMTP_PASS ?? "";
  const from = (env.LM_SMTP_FROM ?? "").trim();
  if (!host || !user || !pass || !from || port !== 465) return null;
  return { host, port, user, pass, from };
}

/**
 * WHY the mailbox is or is not usable — for the operator's status screen.
 * Presence only, never a value (not even a length): which of the five
 * settings exist, the port as configured, and whether `smtpConfigFromEnv`
 * would accept them. "Not configured" used to be one opaque state, so a
 * missing From address or port 587 looked exactly like a missing password.
 */
export type SmtpReadiness = {
  readonly present: { readonly host: boolean; readonly user: boolean; readonly pass: boolean; readonly from: boolean };
  /** The configured port (465 when unset — the default `smtpConfigFromEnv` applies). */
  readonly port: number | null;
  readonly portSupported: boolean;
  readonly ready: boolean;
};

export function smtpReadiness(env: Record<string, string | undefined> = process.env): SmtpReadiness {
  const rawPort = (env.LM_SMTP_PORT ?? "465").trim();
  const port = /^\d{1,5}$/.test(rawPort) ? Number(rawPort) : null;
  return {
    present: {
      host: (env.LM_SMTP_HOST ?? "").trim() !== "",
      user: (env.LM_SMTP_USER ?? "").trim() !== "",
      pass: (env.LM_SMTP_PASS ?? "") !== "",
      from: (env.LM_SMTP_FROM ?? "").trim() !== "",
    },
    port,
    portSupported: port === 465,
    ready: smtpConfigFromEnv(env) !== null,
  };
}

/** The bare address inside "Name <addr>" (or the value itself). */
export function addressOf(from: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

const SAFE_ADDRESS = /^[^\s<>@"\r\n]+@[^\s<>@"\r\n]+\.[^\s<>@"\r\n]+$/;

function encodeHeader(value: string): string {
  // RFC 2047 B-encoding; header injection is impossible because CR/LF never
  // survive base64.
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, (line) => `${line}\r\n`);
}

/** The full RFC 5322 message. The body is base64, so no line can start with
 *  "." and no dot-stuffing is needed. */
export function buildMessage(cfg: SmtpConfig, msg: SmtpMessage, messageId: string, date: Date): string {
  const fromAddr = addressOf(cfg.from);
  const fromName = cfg.from.includes("<") ? cfg.from.slice(0, cfg.from.indexOf("<")).trim().replace(/^"|"$/g, "") : "";
  const headers = [
    `From: ${fromName ? `${encodeHeader(fromName)} ` : ""}<${fromAddr}>`,
    `To: <${msg.to}>`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrap76(Buffer.from(msg.text, "utf8").toString("base64"))}`;
}

type Connect = (cfg: SmtpConfig) => Duplex;

const defaultConnect: Connect = (cfg) =>
  tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host, minVersion: "TLSv1.2" });

/** One SMTP conversation. Every step must get the expected reply code. */
export async function sendSmtp(
  cfg: SmtpConfig,
  msg: SmtpMessage,
  opts: { connect?: Connect; now?: Date } = {},
): Promise<SmtpSendResult> {
  if (!SAFE_ADDRESS.test(msg.to) || !SAFE_ADDRESS.test(addressOf(cfg.from))) {
    return { status: "failed", reason: "invalid_address" };
  }
  const domain = addressOf(cfg.from).split("@")[1];
  const messageId = `<${randomUUID()}@${domain}>`;
  const socket = (opts.connect ?? defaultConnect)(cfg);
  let buffer = "";
  const waiters: Array<(line: string) => void> = [];
  // a reply may arrive before anyone waits for it — keep it
  const replies: string[] = [];
  let failure: string | null = null;

  const fail = (reason: string) => {
    if (!failure) failure = reason;
    while (waiters.length) waiters.shift()!("");
  };
  socket.setEncoding?.("utf8");
  socket.on("data", (chunk: string | Buffer) => {
    buffer += chunk.toString();
    // a reply is complete at a line "NNN text" (space, not dash, after the code)
    for (;;) {
      const lines = buffer.split("\r\n");
      // the last segment is an unfinished line until its CRLF arrives
      const done = lines.slice(0, -1).findIndex((l) => /^\d{3}( |$)/.test(l));
      if (done < 0) break;
      const reply = lines[done];
      buffer = lines.slice(done + 1).join("\r\n");
      const w = waiters.shift();
      if (w) w(reply);
      else replies.push(reply);
    }
  });
  socket.on("error", () => fail("transport_error"));
  socket.on("close", () => fail("connection_closed"));
  const timer = setTimeout(() => {
    fail("timeout");
    socket.destroy();
  }, TIMEOUT_MS);

  const reply = () =>
    new Promise<string>((resolve) => {
      if (replies.length) resolve(replies.shift()!);
      else if (failure) resolve("");
      else waiters.push(resolve);
    });
  const expect = async (code: string, step: string) => {
    const line = await reply();
    if (failure) throw new Error(failure);
    if (!line.startsWith(code)) throw new Error(`smtp_${step}_${line.slice(0, 3) || "none"}`);
  };
  const send = (line: string) => socket.write(`${line}\r\n`);

  try {
    await expect("220", "greeting");
    send(`EHLO ${domain}`);
    await expect("250", "ehlo");
    send(`AUTH PLAIN ${Buffer.from(`\u0000${cfg.user}\u0000${cfg.pass}`, "utf8").toString("base64")}`);
    await expect("235", "auth");
    send(`MAIL FROM:<${addressOf(cfg.from)}>`);
    await expect("250", "mail_from");
    send(`RCPT TO:<${msg.to}>`);
    await expect("25", "rcpt_to");
    send("DATA");
    await expect("354", "data");
    socket.write(`${buildMessage(cfg, msg, messageId, opts.now ?? new Date())}.\r\n`);
    await expect("250", "data_end");
    send("QUIT");
    return { status: "sent", messageId };
  } catch (e) {
    return { status: "failed", reason: e instanceof Error ? e.message : "smtp_error" };
  } finally {
    clearTimeout(timer);
    socket.end?.();
  }
}
