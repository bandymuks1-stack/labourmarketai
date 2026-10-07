/**
 * Notification-email fan-out guard (trial-readiness cost guardrail).
 *
 * Hard, in-process ceilings applied immediately before a REAL provider send:
 *   - NOTIFICATION_EMAIL_MAX_PER_RUN_WINDOW  (default 500 per rolling 24h per
 *     server instance) — bounds one cron sweep / one warm instance;
 *   - NOTIFICATION_EMAIL_MAX_PER_RECIPIENT_DAY (default 5 per rolling 24h per
 *     recipient per instance).
 * Refused sends are NOT lost work: the durable bell notification already
 * exists; only the optional email copy is skipped (outcome `rate_limited`).
 *
 * HONEST LIMITS: state is per server instance (serverless cold starts reset
 * it), so this is a backstop against runaway loops/fan-out, not an exact
 * accounting. A durable per-organization-per-day email cap needs an email
 * send ledger (new table = migration, owner approval); notification recipients
 * are profiles, not organizations, so no org key exists at this layer. The
 * upstream sweeps are independently bounded (weekly digest: 500 recipients,
 * email only on explicit opt-in; job alerts: 2000 workers scanned).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_PER_RUN_WINDOW = 500;
export const DEFAULT_MAX_PER_RECIPIENT_DAY = 5;

function envInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1_000_000, Math.max(0, Math.floor(n))) : fallback;
}

let globalSends: number[] = [];
const perRecipient = new Map<string, number[]>();

function prune(list: number[], now: number): number[] {
  const cutoff = now - DAY_MS;
  return list.filter((t) => t > cutoff);
}

/** Reserve one send slot. false = refuse (ceiling reached). */
export function reserveEmailSendSlot(
  recipientKey: string,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const maxRun = envInt(env.NOTIFICATION_EMAIL_MAX_PER_RUN_WINDOW, DEFAULT_MAX_PER_RUN_WINDOW);
  const maxRecipient = envInt(
    env.NOTIFICATION_EMAIL_MAX_PER_RECIPIENT_DAY,
    DEFAULT_MAX_PER_RECIPIENT_DAY,
  );
  globalSends = prune(globalSends, now);
  const mine = prune(perRecipient.get(recipientKey) ?? [], now);
  if (globalSends.length >= maxRun || mine.length >= maxRecipient) {
    perRecipient.set(recipientKey, mine);
    return false;
  }
  globalSends.push(now);
  mine.push(now);
  perRecipient.set(recipientKey, mine);
  // Bound the map itself.
  if (perRecipient.size > 20_000) {
    for (const [k, v] of perRecipient) {
      if (prune(v, now).length === 0) perRecipient.delete(k);
    }
  }
  return true;
}

export function __resetEmailSendGuardForTests(): void {
  globalSends = [];
  perRecipient.clear();
}
