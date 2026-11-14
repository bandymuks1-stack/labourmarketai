/**
 * DELIVERY STATUS NOTIFICATIONS (bounces) — the pure reader (owner correction 2026-11-13 item 6).
 *
 * Input: one raw message from OUR sender mailbox (the envelope sender of every invitation mail,
 * so returned mail lands there). Output: the facts the database needs to mark OUR message —
 *   { messageId: our own `<uuid@domain>` Message-ID, action: failed | delivered | delayed,
 *     status: RFC 3463 code like 5.1.1 or null }
 * — or null when the message is not a delivery report about one of our messages.
 *
 * Recognised:
 *   - RFC 3464 `multipart/report; report-type=delivery-status` (Postfix, Exim, Hostinger, Gmail…):
 *     the `message/delivery-status` part gives Action and Status; the returned headers
 *     (`text/rfc822-headers` or `message/rfc822`) give the original Message-ID.
 *   - Non-standard bounces (plain text "Mail delivery failed" from MAILER-DAEMON / postmaster):
 *     only when they quote one of OUR Message-IDs; action `failed`, status from a "5.x.x" code.
 *
 * Privacy: the recipient address, the diagnostic text and the quoted body are read in memory only
 * to locate those three codes and are never returned. Pure: no I/O.
 */

export type DsnAction = "failed" | "delivered" | "delayed";

export type DsnFact = {
  readonly messageId: string;
  readonly action: DsnAction;
  readonly status: string | null;
};

type Part = { readonly headers: Map<string, string>; readonly body: string };

function splitPart(raw: string): Part {
  const m = /\r?\n\r?\n/.exec(raw);
  const head = m ? raw.slice(0, m.index) : raw;
  const body = m ? raw.slice(m.index + m[0].length) : "";
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) {
      const name = line.slice(0, i).trim().toLowerCase();
      if (!headers.has(name)) headers.set(name, line.slice(i + 1).trim());
    }
  }
  return { headers, body };
}

function param(value: string, name: string): string | null {
  const m = new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i").exec(value);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function decode(body: string, encoding: string | undefined): string {
  const enc = (encoding ?? "").toLowerCase();
  if (enc === "base64") return Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64").toString("latin1");
  if (enc === "quoted-printable") {
    return body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  }
  return body;
}

/** Every leaf part (multiparts walked recursively, depth-bounded). */
function leaves(part: Part, depth = 0): Part[] {
  const type = part.headers.get("content-type") ?? "text/plain";
  const boundary = /^multipart\//i.test(type) ? param(type, "boundary") : null;
  if (!boundary || depth > 5) return [part];
  const chunks = part.body.split(`--${boundary}`).slice(1);
  const out: Part[] = [];
  for (const chunk of chunks) {
    if (chunk.startsWith("--")) break;
    out.push(...leaves(splitPart(chunk.replace(/^\r?\n/, "")), depth + 1));
  }
  return out;
}

/** Our own Message-IDs only: `<uuid@domain>` as smtp.ts generates them. */
const OUR_MESSAGE_ID = /<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[A-Za-z0-9.-]{1,80}>/i;
const STATUS = /\b([245]\.\d{1,3}\.\d{1,3})\b/;

function ourMessageIdIn(text: string, domain?: string): string | null {
  const re = new RegExp(OUR_MESSAGE_ID.source, "gi");
  for (const m of text.matchAll(re)) {
    const id = m[0];
    if (!domain || id.toLowerCase().endsWith(`@${domain.toLowerCase()}>`)) return id.toLowerCase();
  }
  return null;
}

function originalMessageId(parts: Part[], domain?: string): string | null {
  for (const p of parts) {
    const type = (p.headers.get("content-type") ?? "").toLowerCase();
    if (type.startsWith("text/rfc822-headers") || type.startsWith("message/rfc822")) {
      const inner = splitPart(decode(p.body, p.headers.get("content-transfer-encoding")));
      const id = inner.headers.get("message-id");
      if (id) {
        const ours = ourMessageIdIn(id, domain);
        if (ours) return ours;
      }
    }
  }
  return null;
}

/** RFC 3464 per-recipient block: the most severe action wins (failed > delayed > delivered). */
function deliveryStatus(parts: Part[]): { action: DsnAction; status: string | null } | null {
  const rank: Record<DsnAction, number> = { failed: 3, delayed: 2, delivered: 1 };
  let best: { action: DsnAction; status: string | null } | null = null;
  for (const p of parts) {
    if (!(p.headers.get("content-type") ?? "").toLowerCase().startsWith("message/delivery-status")) continue;
    const text = decode(p.body, p.headers.get("content-transfer-encoding")).replace(/\r?\n[ \t]+/g, " ");
    for (const block of text.split(/\r?\n\r?\n/)) {
      const action = /^action:\s*(failed|delayed|delivered|relayed|expanded)\b/im.exec(block)?.[1]?.toLowerCase();
      if (!action) continue;
      const a: DsnAction = action === "failed" ? "failed" : action === "delayed" ? "delayed" : "delivered";
      const status = STATUS.exec(/^status:\s*(.*)$/im.exec(block)?.[1] ?? "")?.[1] ?? null;
      if (!best || rank[a] > rank[best.action]) best = { action: a, status };
    }
  }
  return best;
}

const BOUNCE_SENDER = /(mailer-daemon|postmaster|mail delivery (sub)?system)/i;
const BOUNCE_SUBJECT = /(undeliver|delivery (status|failure|has failed)|failure notice|returned mail|mail delivery failed|not delivered)/i;

/**
 * The delivery fact a raw message reports about one of OUR messages, or null.
 * `ourDomain` (e.g. "labourmarket.ai") restricts matches to Message-IDs we generated.
 */
export function parseDeliveryReport(raw: string, ourDomain?: string): DsnFact | null {
  if (!raw || raw.length > 2_000_000) return null;
  const top = splitPart(raw);
  const type = (top.headers.get("content-type") ?? "").toLowerCase();
  const parts = leaves(top);

  if (type.startsWith("multipart/report") && /delivery-status/i.test(param(type, "report-type") ?? "")) {
    const ds = deliveryStatus(parts);
    const id =
      originalMessageId(parts, ourDomain) ??
      ourMessageIdIn(parts.map((p) => decode(p.body, p.headers.get("content-transfer-encoding"))).join("\n"), ourDomain);
    if (ds && id) return { messageId: id, action: ds.action, status: ds.status };
    return null;
  }

  // Non-standard bounce: must look like one AND quote our Message-ID.
  const from = top.headers.get("from") ?? "";
  const subject = top.headers.get("subject") ?? "";
  if (!BOUNCE_SENDER.test(from) && !BOUNCE_SUBJECT.test(subject)) return null;
  const text = parts.map((p) => decode(p.body, p.headers.get("content-transfer-encoding"))).join("\n");
  const id = ourMessageIdIn(text, ourDomain);
  if (!id) return null;
  return { messageId: id, action: "failed", status: STATUS.exec(text)?.[1] ?? null };
}
