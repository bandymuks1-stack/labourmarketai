import "server-only";

import { connect, type TLSSocket } from "node:tls";

import { parseDeliveryReport, type DsnFact } from "@/lib/email/dsn";
import { addressOf, smtpConfigFromEnv } from "@/lib/email/smtp";

/**
 * READ-ONLY bounce reader for the platform's own sender mailbox (owner correction 2026-11-13
 * item 6). Every invitation mail is sent with this mailbox as envelope sender, so delivery
 * reports come back here.
 *
 * - Same mailbox, same credentials as the SMTP transport (LM_SMTP_USER / LM_SMTP_PASS); the IMAP
 *   host is LM_IMAP_HOST (Hostinger: imap.hostinger.com), port LM_IMAP_PORT (default 993,
 *   implicit TLS). Nothing here logs a host, a login, a password or a server reply.
 * - EXAMINE (the IMAP read-only select) and BODY.PEEK: no flag, folder or message is changed,
 *   so any other reader of this mailbox (the owner's mail client, Agentai OS) sees it as before.
 * - Only recent mail that looks like a delivery report is fetched (bounded count and size); each
 *   is reduced in memory to { our Message-ID, action, status code } by lib/email/dsn.ts.
 * - Idempotent by design: the database marks a Message-ID once, so re-reading the same window on
 *   the next run changes nothing.
 */

export const BOUNCE_LOOKBACK_DAYS = 3;
export const MAX_REPORTS_PER_RUN = 200;
const MAX_MESSAGE_BYTES = 512 * 1024;
const TIMEOUT_MS = 30_000;

export type BounceReaderConfig = { host: string; port: number; user: string; pass: string; ourDomain: string };

export function bounceReaderConfigFromEnv(env: Record<string, string | undefined> = process.env): BounceReaderConfig | null {
  const smtp = smtpConfigFromEnv(env);
  const host = (env.LM_IMAP_HOST ?? "").trim();
  const port = Number((env.LM_IMAP_PORT ?? "993").trim());
  if (!smtp || !host || port !== 993) return null;
  const domain = addressOf(smtp.from).split("@")[1] ?? "";
  return { host, port, user: smtp.user, pass: smtp.pass, ourDomain: domain.toLowerCase() };
}

export type BounceReadResult =
  | { readonly status: "not_configured" }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "ok"; readonly scanned: number; readonly facts: readonly DsnFact[] };

class Session {
  private buf = Buffer.alloc(0);
  private waiters: Array<() => void> = [];
  private seq = 0;
  private failed: string | null = null;

  private constructor(private readonly sock: TLSSocket) {
    sock.on("data", (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      for (const w of this.waiters.splice(0)) w();
    });
    sock.on("error", (err: NodeJS.ErrnoException) => {
      this.failed = err.code ?? "socket_error";
      for (const w of this.waiters.splice(0)) w();
    });
    sock.on("close", () => {
      this.failed ??= "connection_closed";
      for (const w of this.waiters.splice(0)) w();
    });
  }

  static async open(cfg: BounceReaderConfig): Promise<Session> {
    const sock = connect({ host: cfg.host, port: cfg.port, servername: cfg.host, minVersion: "TLSv1.2" });
    await new Promise<void>((ok, fail) => {
      const timer = setTimeout(() => fail(new Error("imap_connect_timeout")), TIMEOUT_MS);
      sock.once("secureConnect", () => {
        clearTimeout(timer);
        ok();
      });
      sock.once("error", (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        fail(new Error(`imap_connect_${(e.code ?? "error").toLowerCase()}`));
      });
    }).catch((e) => {
      sock.destroy();
      throw e;
    });
    const s = new Session(sock);
    await s.until((t) => /^\* OK/m.test(t));
    return s;
  }

  private async until(done: (text: string) => boolean): Promise<string> {
    const end = Date.now() + TIMEOUT_MS;
    for (;;) {
      const text = this.buf.toString("latin1");
      if (done(text)) {
        this.buf = Buffer.alloc(0);
        return text;
      }
      if (this.failed) throw new Error(`imap_${this.failed.toLowerCase()}`);
      if (Date.now() > end) throw new Error("imap_timeout");
      await new Promise<void>((ok) => {
        this.waiters.push(ok);
        setTimeout(ok, 1_000);
      });
    }
  }

  async run(command: string, label: string): Promise<string> {
    const tag = `A${++this.seq}`;
    this.sock.write(`${tag} ${command}\r\n`);
    const text = await this.until((t) => new RegExp(`^${tag} (OK|NO|BAD)`, "m").test(t));
    if (!new RegExp(`^${tag} OK`, "m").test(text)) throw new Error(`imap_${label}_refused`);
    return text;
  }

  close(): void {
    try {
      this.sock.write(`A${++this.seq} LOGOUT\r\n`);
    } catch {
      /* closing anyway */
    }
    this.sock.end();
  }
}

const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const imapDate = (d: Date) => `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

/** The message literal of a `UID FETCH … (BODY.PEEK[])` answer. */
export function fetchedLiteral(response: string): string {
  const m = /\{(\d+)\}\r\n/.exec(response);
  if (!m) return "";
  const start = m.index + m[0].length;
  return response.slice(start, start + Number(m[1]));
}

/** UIDs from a `* SEARCH` answer, newest first, bounded. */
export function searchUids(response: string, max = MAX_REPORTS_PER_RUN): number[] {
  return (/^\* SEARCH([\d ]*)$/m.exec(response)?.[1] ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a)
    .slice(0, max);
}

/** Reads recent delivery reports about OUR messages. Never throws. */
export async function readRecentDeliveryReports(input: {
  readonly now?: Date;
  readonly config?: BounceReaderConfig | null;
} = {}): Promise<BounceReadResult> {
  const cfg = input.config === undefined ? bounceReaderConfigFromEnv() : input.config;
  if (!cfg) return { status: "not_configured" };
  const since = new Date((input.now ?? new Date()).getTime() - BOUNCE_LOOKBACK_DAYS * 86_400_000);
  let s: Session | null = null;
  try {
    s = await Session.open(cfg);
    await s.run(`LOGIN ${quote(cfg.user)} ${quote(cfg.pass)}`, "login");
    await s.run("EXAMINE INBOX", "examine");
    const found = await s.run(
      `UID SEARCH SINCE ${imapDate(since)} OR OR FROM "mailer-daemon" FROM "postmaster" HEADER Content-Type "delivery-status"`,
      "search",
    );
    const uids = searchUids(found);
    const facts: DsnFact[] = [];
    let scanned = 0;
    for (const uid of uids) {
      const size = Number(/RFC822\.SIZE (\d+)/.exec(await s.run(`UID FETCH ${uid} (RFC822.SIZE)`, "size"))?.[1] ?? "0");
      if (!size || size > MAX_MESSAGE_BYTES) continue;
      const raw = fetchedLiteral(await s.run(`UID FETCH ${uid} (BODY.PEEK[])`, "fetch"));
      scanned += 1;
      const fact = parseDeliveryReport(raw, cfg.ourDomain);
      if (fact) facts.push(fact);
    }
    return { status: "ok", scanned, facts };
  } catch (e) {
    const reason = e instanceof Error && /^imap_[a-z0-9_]{1,40}$/.test(e.message) ? e.message : "imap_error";
    return { status: "failed", reason };
  } finally {
    s?.close();
  }
}
