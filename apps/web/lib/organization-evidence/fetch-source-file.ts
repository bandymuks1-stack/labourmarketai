import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { SOURCE_FILE_MAX_BYTES } from "./read-source-file";

/**
 * A SOURCE FILE BY REFERENCE — the bytes behind a ChatGPT file argument
 * (`openai/fileParams`: `{ download_url, file_id, file_name?, mime_type? }`).
 *
 * The MCP door reads at most 64 KB of request body, so a workbook can never
 * ride inside a tool call; the host hands over a short-lived signed URL
 * instead. Fetching a URL a client chose is an SSRF surface, so this module is
 * deliberately narrow, and it only FETCHES — parsing, fingerprinting, staging
 * and every authorization decision stay in the evidence core.
 *
 *   • https only, no credentials in the URL, no IP-literal host, no port other
 *     than 443;
 *   • every address the name resolves to must be public (no loopback, private,
 *     link-local, CGNAT or metadata ranges) — checked on the resolved addresses;
 *   • redirects are refused, not followed (a redirect is a second, unchecked URL);
 *   • the body is streamed against the SAME byte ceiling the upload path
 *     enforces, and the whole read has a deadline.
 */

const FETCH_TIMEOUT_MS = 20_000;

export type FetchSourceFileResult =
  | { readonly kind: "ok"; readonly bytes: Buffer }
  | { readonly kind: "refused"; readonly reason: "bad_url" | "private_address" | "redirect" | "http_error" | "too_large" | "unreachable" };

/** True when an IPv4/IPv6 literal is NOT a public unicast address. */
export function isNonPublicAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = address.toLowerCase();
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("::ffff:")) return isNonPublicAddress(s.slice(7));
    return s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb") || s.startsWith("ff");
  }
  return true;
}

/** Pure URL screen, before any network. */
export function screenSourceUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.port !== "" && url.port !== "443") return null;
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) return null;
  if (!url.hostname.includes(".")) return null;
  return url;
}

export async function fetchSourceFile(rawUrl: string): Promise<FetchSourceFileResult> {
  const url = screenSourceUrl(rawUrl);
  if (!url) return { kind: "refused", reason: "bad_url" };

  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((a) => isNonPublicAddress(a.address))) {
      return { kind: "refused", reason: "private_address" };
    }
  } catch {
    return { kind: "refused", reason: "unreachable" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { accept: "*/*" } });
    if (res.status >= 300 && res.status < 400) return { kind: "refused", reason: "redirect" };
    if (!res.ok || !res.body) return { kind: "refused", reason: "http_error" };
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > SOURCE_FILE_MAX_BYTES) return { kind: "refused", reason: "too_large" };

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > SOURCE_FILE_MAX_BYTES) {
        await reader.cancel();
        return { kind: "refused", reason: "too_large" };
      }
      chunks.push(value);
    }
    return { kind: "ok", bytes: Buffer.concat(chunks) };
  } catch {
    return { kind: "refused", reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
