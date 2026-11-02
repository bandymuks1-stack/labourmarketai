import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/lib/http/same-origin-request";
import { clientKeyFromHeaders, rateLimit } from "@/lib/security/rate-limit";
import {
  browserFamily,
  CLIENT_ERROR_MAX_BYTES,
  sanitizeClientErrorReport,
} from "@/lib/telemetry/client-error-report";

/**
 * BROWSER CRASH REPORTS (2026-10-18 incident) — the receiving end.
 *
 * One sanitised line per report into the server log (the VPS container log:
 * `docker logs labourmarket-prod 2>&1 | grep '\[client-error\]'`). NOTHING is
 * written to the database — it is over its free quota, and a crash report is
 * operational signal, not product data.
 *
 * Public by necessity (a crash can happen before or without a session), so
 * it is bounded on every side: same-origin only, a 2 KB body, an in-memory
 * per-client window, and the authoritative sanitiser
 * (lib/telemetry/client-error-report.ts) — no IP, cookie, query string or
 * typed text is ever logged. Always answers 204: a reporter must never be
 * able to learn anything, or make the page wait.
 */

export const dynamic = "force-dynamic";

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) return NO_CONTENT();
  const limited = rateLimit({
    name: "client-errors",
    key: clientKeyFromHeaders(request.headers),
    limit: 20,
    windowMs: 60_000,
  });
  if (limited.limited) return NO_CONTENT();

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > CLIENT_ERROR_MAX_BYTES) return NO_CONTENT();
    raw = JSON.parse(text);
  } catch {
    return NO_CONTENT();
  }
  const report = sanitizeClientErrorReport(raw);
  if (!report) return NO_CONTENT();

  console.warn(
    "[client-error]",
    JSON.stringify({
      ...report,
      // The server's own view wins where it has one: the build it serves and
      // the browser family from the request itself (family + major only).
      browser: browserFamily(request.headers.get("user-agent") ?? "") ?? report.browser,
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? report.build,
    }),
  );
  return NO_CONTENT();
}
