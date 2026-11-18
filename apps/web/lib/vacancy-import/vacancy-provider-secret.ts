import "server-only";

/**
 * VACANCY PROVIDER SECRET — where a key-requiring provider's credential is
 * read from, and the ONLY place it is read.
 *
 * Every JobTech endpoint is keyless, so until 2026-09-22 nothing in the
 * runner sourced a credential at all: `apiKey` existed on the import request
 * and the adapter refused a key-requiring endpoint without one, but no
 * caller ever supplied one. NAV's feed (a signed JWT bearer token) is the
 * first provider that needs the plumbing, so it is added here as ONE
 * conventional env NAME per provider, derived the same way the kill-switch
 * names are:
 *
 *   VACANCY_SOURCE_<KEY>_API_TOKEN     e.g. VACANCY_SOURCE_NAV_API_TOKEN
 *
 * Rules, all deliberate:
 *   - the VALUE is returned to the runner and handed straight to the adapter,
 *     which sends it as a request header. It is never logged, never written
 *     to a row, never part of `requestRef`, and this module exposes no
 *     "is it set?" helper that would tempt a log line to say more than it
 *     should;
 *   - an absent or blank variable is `null`. The adapter then answers
 *     `api_key_required` and makes NO request — there is no anonymous
 *     fallback for a key-requiring endpoint;
 *   - PROVISIONING the value is an owner gate (a new secret), recorded in the
 *     provider's activation gate document; this module cannot provision.
 *
 * Reading env here is intentional and allowed: this module lives OUTSIDE
 * lib/vacancy-sources (the pure, env-free layer). Server-only.
 */
import { providerEnvSuffix } from "./vacancy-kill-switch";

export function providerApiTokenEnvName(providerKey: string): string {
  return `VACANCY_SOURCE_${providerEnvSuffix(providerKey)}_API_TOKEN`;
}

/**
 * The provisioned token for one provider, or null when none is set. Pure
 * over an explicit env snapshot so it is testable without process.env.
 */
export function readProviderApiToken(
  providerKey: string,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const raw = env[providerApiTokenEnvName(providerKey)];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Runtime read against the live process env. */
export function providerApiToken(providerKey: string): string | null {
  return readProviderApiToken(providerKey, process.env);
}
