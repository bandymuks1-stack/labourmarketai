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
 *
 * ONE MAP PER PROCESS, NOT PER MODULE COPY (production 2026-11-02, J-15 walk
 * run 41478483202). The save runs as a server action called from a client
 * component; the claim runs in the layout's server render. Next bundles those
 * two into different webpack layers, each with its OWN copy of this module, so
 * a module-level map let the save forget the person in one copy while the
 * render kept throttling them in the other: the walk's worker saved Sweden and
 * the next visits never asked the vacancy store at all. The map lives on
 * `globalThis` under a registered symbol (the same remedy as
 * lib/api/bearer-caller-scope.ts), so every copy reads and writes one map.
 */

export const JOB_ALERT_READ_TIME_TTL_MS = 30 * 60 * 1000;

const STORE_KEY = Symbol.for("labourmarket.job-alert-throttle.v1");

type GlobalWithThrottle = typeof globalThis & { [STORE_KEY]?: Map<string, number> };

function lastRun(): Map<string, number> {
  const g = globalThis as GlobalWithThrottle;
  g[STORE_KEY] ??= new Map<string, number>();
  return g[STORE_KEY];
}

/** True (and the window starts now) when this person may be evaluated. */
export function claimJobAlertEvaluation(profileId: string, now: number = Date.now()): boolean {
  const runs = lastRun();
  const last = runs.get(profileId) ?? 0;
  if (now - last < JOB_ALERT_READ_TIME_TTL_MS) return false;
  runs.set(profileId, now);
  return true;
}

/** The person's alert criteria changed: their next visit evaluates again. */
export function forgetJobAlertEvaluation(profileId: string): void {
  lastRun().delete(profileId);
}
