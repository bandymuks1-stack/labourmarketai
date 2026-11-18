/**
 * The readable text of ONE raw RFC 5322 message, for the read-only QA mailbox
 * reader (`tests/e2e/prod-qa-imap.ts`). Every text part is decoded by its own
 * declared `Content-Transfer-Encoding` — quoted-printable, base64, or
 * 7bit / 8bit / binary taken as is — so a link survives whatever encoding the
 * mail provider chose. Multipart bodies are walked recursively; non-text parts
 * (attachments, images) are skipped. Pure: no I/O.
 *
 * `raw` is the message as the IMAP literal carries it: one character per byte
 * (latin1), so byte-exact decoding is possible before reading it as UTF-8.
 */

type Part = { readonly headers: Map<string, string>; readonly body: string };

function splitPart(raw: string): Part {
  const m = /\r?\n\r?\n/.exec(raw);
  const head = m ? raw.slice(0, m.index) : raw;
  const body = m ? raw.slice(m.index + m[0].length) : "";
  const headers = new Map<string, string>();
  // Unfold continuation lines, then read "Name: value" pairs (last one wins is
  // irrelevant here: the headers used below occur once per part).
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return { headers, body };
}

function param(value: string, name: string): string | null {
  const m = new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i").exec(value);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function decodeQuotedPrintable(text: string): string {
  return text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function decodeBody(body: string, encoding: string): string {
  const enc = encoding.toLowerCase();
  if (enc === "base64") return Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64").toString("utf8");
  const bytes = enc === "quoted-printable" ? decodeQuotedPrintable(body) : body;
  return Buffer.from(bytes, "latin1").toString("utf8");
}

export function mimeText(raw: string, depth = 0): string {
  const { headers, body } = splitPart(raw);
  const type = headers.get("content-type") ?? "text/plain";
  if (/^multipart\//i.test(type) && depth < 8) {
    const boundary = param(type, "boundary");
    if (!boundary) return "";
    const marker = `--${boundary}`;
    return body
      .split(marker)
      .slice(1)
      .filter((chunk) => !chunk.startsWith("--"))
      .map((chunk) => mimeText(chunk.replace(/^\r?\n/, ""), depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  if (!/^text\//i.test(type)) return "";
  return decodeBody(body, headers.get("content-transfer-encoding") ?? "7bit");
}
