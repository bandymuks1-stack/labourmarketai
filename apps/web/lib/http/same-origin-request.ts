import { requestPublicOrigin } from "@/lib/mcp/public-origin";

/**
 * Same-origin check for cookie-authenticated POST routes (2026-10-17).
 *
 * The old check compared the browser's `Origin` with `new URL(req.url).host`.
 * On Vercel those matched. On the self-hosted `next start` behind nginx,
 * `req.url` carries the BIND host (`0.0.0.0:3000`, measured on the VPS on
 * 2026-10-17: a POST with `Origin: https://labourmarket.ai` answered 403, one
 * with `Origin: http://0.0.0.0:3000` passed), so every browser write that
 * went through such a check was refused — the chat transcript stopped
 * persisting the moment production left Vercel.
 *
 * The host a request is really for is the one the MCP door already resolves
 * (`requestPublicOrigin`: X-Forwarded-Host / Host, accepted only when it is
 * one of ours, otherwise the canonical origin). Comparing the Origin with
 * THAT keeps the protection (a cross-site page still cannot post with the
 * person's cookies) and makes it true on any host the app is served from.
 *
 * `Sec-Fetch-Site` keeps the first word, exactly as before: any value other
 * than `same-origin` is refused before any header parsing; a missing header
 * (older clients, curl) falls through to the Origin comparison.
 */
export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (origin === null) return site === "same-origin";
  try {
    return new URL(origin).host === new URL(requestPublicOrigin(req)).host;
  } catch {
    return false;
  }
}
