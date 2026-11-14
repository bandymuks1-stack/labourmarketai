import "server-only";

import { constantTimeEquals } from "./supply-feed-auth";

/**
 * OPERATOR ALERTS TRIGGER AUTH — the one place the scheduled trigger proves it is the scheduler.
 *
 * The trigger is a GitHub Actions schedule (`.github/workflows/operator-alerts-cadence.yml`), which
 * reaches the app over the internet: nginx 404s `/api/cron/*` from outside, so this door lives under
 * `/api/internal/` with its OWN secret. Deliberately not `CRON_SECRET`: that one stays on the VPS
 * and authorises every local cron route (privacy erasure among them); a leaked copy in GitHub would
 * widen all of them. A leak of this token can only make the sweep run early, and the sweep is
 * idempotent per application, stage and recipient.
 *
 * FAIL CLOSED. While `OPERATOR_ALERTS_TRIGGER_TOKEN` is unset or shorter than 32 characters the answer
 * is `not_configured` and the route refuses. A machine secret is not a user identity, so this lives
 * beside — not inside — `lib/api/api-identity.ts` (api-auth-boundary guard).
 */
export type OperatorAlertsAuthResult = "ok" | "not_configured" | "unauthorized";

const MIN_TOKEN_LENGTH = 32;

export function authorizeOperatorAlertsTrigger(request: Request): OperatorAlertsAuthResult {
  const secret = (process.env.OPERATOR_ALERTS_TRIGGER_TOKEN ?? "").trim();
  if (secret.length < MIN_TOKEN_LENGTH) return "not_configured";
  const header = request.headers.get("authorization");
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return "unauthorized";
  return constantTimeEquals(header.slice("Bearer ".length), secret) ? "ok" : "unauthorized";
}
