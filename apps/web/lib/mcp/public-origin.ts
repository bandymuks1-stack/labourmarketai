import { outboundLinkOrigin } from "@/lib/domain/canonical";
import { env } from "@/lib/env";

/**
 * THE ORIGIN AN OAUTH CLIENT IS TOLD ABOUT (2026-10-17).
 *
 * `new URL(req.url).origin` is what the MCP door and the RFC 9728 document
 * used. On Vercel that was the public origin. On a self-hosted `next start`
 * it is the BIND host: the hosting session's isolated container answered
 * `WWW-Authenticate: Bearer resource_metadata="http://0.0.0.0:3000/…"` and
 * `resource: "http://0.0.0.0:3000"`. A client that followed either would
 * never find the authorization server, and Claude's rule — `resource` must
 * equal the URL the person entered — could never hold.
 *
 * The rule here is the one the repository already applies to links that
 * leave the platform (`outboundLinkOrigin`, 2026-09-19): the request's
 * `X-Forwarded-Host` / `Host` is used ONLY when it is one of ours (the
 * canonical apex, the Vercel production alias, a preview deployment, or a
 * local development host); any other host — including a bind address the
 * server believes in and anything an attacker can put in a header — yields
 * the canonical origin. A self-hosted staging under its own public hostname
 * names itself through the optional `PUBLIC_ORIGIN` environment variable,
 * which wins when set.
 *
 * Why not `CANONICAL_ORIGIN` always: a local stack and a preview must
 * advertise themselves, or the conformance spec and every custom-connector
 * test against them would point at production.
 */
export function requestPublicOrigin(req: Request): string {
  const configured = env.PUBLIC_ORIGIN?.replace(/\/$/, "");
  if (configured) return configured;
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const rawHost = forwardedHost || req.headers.get("host") || new URL(req.url).host;
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || new URL(req.url).protocol.replace(/:$/, "");
  return outboundLinkOrigin(withoutDefaultPort(rawHost, proto), proto);
}

/**
 * `Host: labourmarket.ai:443` (nginx `$http_host`, some proxies) must not
 * become `https://labourmarket.ai:443`: the person typed no port, and Claude
 * compares `resource` with the URL exactly. The scheme's default port is
 * dropped; any other port (a local 3100, a preview 8443) is kept.
 */
function withoutDefaultPort(host: string, proto: string): string {
  const h = host.trim().toLowerCase();
  const defaultPort = proto === "https" ? ":443" : proto === "http" ? ":80" : null;
  if (defaultPort && h.endsWith(defaultPort) && !h.startsWith("[")) return h.slice(0, -defaultPort.length);
  return h;
}
