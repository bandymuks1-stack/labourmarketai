/**
 * The read-time job-alert throttle (stream N): one evaluation per person per
 * window per warm instance. A best-effort cost cap only — the store's dedupe
 * key, not this map, is what keeps an alert exactly-once.
 *
 * A person who has just CHANGED what an alert is computed from (their work
 * card: preferred countries, salary) is forgotten here, so their next visit
 * evaluates at once. Without that, the first dashboard render after
 * onboarding — before any country is stated — spent the window, and a worker
 * who then stated where they want to work heard about nothing for 30 minutes.
 *
 * No IO and no imports, so the work-card domain core can call it without
 * pulling in the notification emitters.
 */

export const JOB_ALERT_READ_TIME_TTL_MS = 30 * 60 * 1000;

const lastRun = new Map<string, number>();

/** True (and the window starts now) when this person may be evaluated. */
export function claimJobAlertEvaluation(profileId: string, now: number = Date.now()): boolean {
  const last = lastRun.get(profileId) ?? 0;
  if (now - last < JOB_ALERT_READ_TIME_TTL_MS) return false;
  lastRun.set(profileId, now);
  return true;
}

/** The person's alert criteria changed: their next visit evaluates again. */
export function forgetJobAlertEvaluation(profileId: string): void {
  lastRun.delete(profileId);
}
