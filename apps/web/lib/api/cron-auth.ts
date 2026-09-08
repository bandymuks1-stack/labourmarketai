import "server-only";

/**
 * CRON AUTH (completion v1) — the one place a scheduled-job request proves it
 * came from the platform's own scheduler.
 *
 * A cron secret is NOT a user identity: `lib/api/api-identity.ts` resolves
 * PEOPLE (cookie sessions and Supabase bearer tokens) and must stay the only
 * parser of user Authorization headers. Vercel cron, however, sends
 * `Authorization: Bearer <CRON_SECRET>` — a shared machine secret with no
 * person behind it. Conflating the two resolvers would let a cron secret
 * masquerade as a user path (or vice versa), so the machine check lives
 * here, beside — not inside — the identity boundary. Route files still never
 * parse the header themselves (api-auth-boundary guard): they call this.
 *
 * Fail-closed by construction: while CRON_SECRET is unset the answer is
 * `not_configured` — the route refuses, because a secretless comparison
 * would turn a scheduled job into an open unauthenticated trigger.
 */
export type CronAuthResult = "ok" | "not_configured" | "unauthorized";

export function authorizeCronRequest(request: Request): CronAuthResult {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return "not_configured";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}` ? "ok" : "unauthorized";
}
