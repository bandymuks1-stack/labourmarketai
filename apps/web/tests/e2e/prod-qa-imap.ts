import { connect, type TLSSocket } from "node:tls";

import { mimeText } from "../../lib/testing/mime-text";

/**
 * READ-ONLY reader for the ONE synthetic QA mailbox (owner decision D-4,
 * 2026-11-01). Used only by production walks that must prove a mail really
 * arrives (password reset, alerts).
 *
 * - Credentials come only from the environment (`PROD_QA_IMAP_HOST`,
 *   `PROD_QA_IMAP_USER`, `PROD_QA_IMAP_PASS`; GitHub `production-qa`
 *   environment secrets). Nothing here prints them.
 * - The mailbox is opened with EXAMINE — the IMAP read-only select — and
 *   bodies are fetched with BODY.PEEK, so no flag, folder or message changes.
 * - Only mail addressed to an allowlisted synthetic address is ever read
 *   (`assertSyntheticAddress`); a real person's address is refused before any
 *   connection is made.
 * - The mailbox host refuses plus addresses (owner D-4 result 2026-11-02), so
 *   the mailbox's own address `qa.invited@labourmarket.ai` is allowlisted by
 *   exact equality beside the qa.<name>+<tag> pattern.
 */

const SYNTHETIC = /^qa\.[a-z0-9]+\+[a-z0-9]+@labourmarket\.ai$/;
export const QA_MAILBOX_ADDRESS = "qa.invited@labourmarket.ai";

export function assertSyntheticAddress(address: string): void {
  if (address !== QA_MAILBOX_ADDRESS && !SYNTHETIC.test(address))
    throw new Error("refused: the QA mailbox reader reads only qa.invited@ or qa.<name>+<tag>@labourmarket.ai mail");
}

export function imapConfigured(): boolean {
  return Boolean(process.env.PROD_QA_IMAP_HOST && process.env.PROD_QA_IMAP_USER && process.env.PROD_QA_IMAP_PASS);
}

/** One IMAP session: tagged commands, literal-aware response collection. */
class Session {
  private buf = Buffer.alloc(0);
  private waiters: Array<() => void> = [];
  private seq = 0;
  /** A socket error after connect, as a code only (never a host or message). */
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
  }

  static async open(): Promise<Session> {
    const host = process.env.PROD_QA_IMAP_HOST as string;
    const sock = connect({ host, port: Number(process.env.PROD_QA_IMAP_PORT ?? 993), servername: host });
    // Node's own messages name the host and the certificate's names, and test
    // errors land in public artefacts: only the error code is kept.
    try {
      await new Promise<void>((ok, fail) => {
        sock.once("secureConnect", () => ok());
        sock.once("error", fail);
      });
    } catch (err) {
      sock.destroy();
      throw new Error(`IMAP: connection failed (${(err as NodeJS.ErrnoException).code ?? "error"})`);
    }
    const s = new Session(sock);
    await s.until((text) => /^\* OK/m.test(text));
    return s;
  }

  private async until(done: (text: string) => boolean, ms = 30_000): Promise<string> {
    const end = Date.now() + ms;
    for (;;) {
      if (this.failed) throw new Error(`IMAP: connection lost (${this.failed})`);
      const text = this.buf.toString("latin1");
      if (done(text)) {
        this.buf = Buffer.alloc(0);
        return text;
      }
      if (Date.now() > end) throw new Error("IMAP: no answer in time");
      await new Promise<void>((ok) => {
        this.waiters.push(ok);
        setTimeout(ok, 1_000);
      });
    }
  }

  /** Sends one command; resolves with the whole response, throws unless OK. */
  async run(command: string): Promise<string> {
    const tag = `A${++this.seq}`;
    this.sock.write(`${tag} ${command}\r\n`);
    const text = await this.until((t) => new RegExp(`^${tag} (OK|NO|BAD)`, "m").test(t));
    if (!new RegExp(`^${tag} OK`, "m").test(text)) throw new Error(`IMAP ${command.split(" ")[0]} refused`);
    return text;
  }

  close(): void {
    this.sock.end();
  }
}

const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The message literal of a `UID FETCH … (BODY.PEEK[])` answer: `{n}\r\n`
 *  then exactly n bytes (one latin1 character per byte). */
function fetchedMessage(response: string): string {
  const m = /\{(\d+)\}\r\n/.exec(response);
  if (!m) return "";
  const start = m.index + m[0].length;
  return response.slice(start, start + Number(m[1]));
}

/** The next UID the mailbox will give — read before triggering a mail, so
 *  only mail that arrived AFTER the trigger is considered. */
export async function nextUid(): Promise<number> {
  const s = await Session.open();
  try {
    await s.run(`LOGIN ${quote(process.env.PROD_QA_IMAP_USER as string)} ${quote(process.env.PROD_QA_IMAP_PASS as string)}`);
    const text = await s.run("EXAMINE INBOX");
    return Number(/UIDNEXT (\d+)/.exec(text)?.[1] ?? "1");
  } finally {
    s.close();
  }
}

/**
 * Waits (polling, read-only) for a mail to `address` with UID >= `sinceUid`
 * and returns its first link that `pick` accepts. Throws when none arrives.
 */
export async function waitForMailLink(
  address: string,
  sinceUid: number,
  pick: (url: string) => boolean,
  timeoutMs = 180_000,
): Promise<{ uid: number; link: string; seconds: number }> {
  assertSyntheticAddress(address);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const s = await Session.open();
    try {
      await s.run(`LOGIN ${quote(process.env.PROD_QA_IMAP_USER as string)} ${quote(process.env.PROD_QA_IMAP_PASS as string)}`);
      await s.run("EXAMINE INBOX");
      const found = await s.run(`UID SEARCH UID ${sinceUid}:* TO ${quote(address)}`);
      const uids = (/^\* SEARCH([\d ]*)$/m.exec(found)?.[1] ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .filter((u) => u >= sinceUid)
        .sort((a, b) => b - a);
      for (const uid of uids) {
        // The WHOLE message (headers too), each text part decoded by its own
        // Content-Transfer-Encoding — never one encoding assumed for all.
        const body = mimeText(fetchedMessage(await s.run(`UID FETCH ${uid} (BODY.PEEK[])`)));
        const link = (body.match(/https?:\/\/[^\s"'<>]+/g) ?? []).map((u) => u.replace(/&amp;/g, "&")).find(pick);
        if (link) return { uid, link, seconds: Math.round((Date.now() - started) / 1000) };
      }
    } finally {
      s.close();
    }
    await new Promise((ok) => setTimeout(ok, 10_000));
  }
  throw new Error(`no mail to the synthetic address arrived within ${Math.round(timeoutMs / 1000)} s`);
}
