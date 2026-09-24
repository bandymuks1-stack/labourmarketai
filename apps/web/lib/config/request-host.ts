/**
 * The request's own `Host` header, where a request context exists.
 *
 * ONE reader for the two rules that judge a host server-side: the telemetry
 * origin rule (`lib/telemetry/actions.ts` — a local Host is refused) and the
 * outbound host policy (`lib/config/outbound-host-policy.ts` — a production
 * Host is the second evidence of production). Both are keyed on the header
 * because the environment variable can go missing silently and the header
 * cannot: production traffic always carries the production host.
 *
 * NEVER THROWS. `headers()` is only available inside a request scope; a
 * script, a build step, a cron without a request or a test gets `null`, and
 * every caller treats `null` as "no evidence" — not as production, not as
 * local. A header failure must never blank the owner's funnel nor lift a
 * production refusal that `VERCEL_ENV` still engages on its own.
 *
 * Server-only on purpose: `next/headers` must never reach a client bundle,
 * and the pure rules this feeds stay free of it so they remain unit-testable
 * and client-shareable.
 */
import "server-only";
import { headers } from "next/headers";

export async function readRequestHost(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("host");
  } catch {
    return null;
  }
}
