import "server-only";

/**
 * VACANCY IMPORT KILL SWITCH — the immediate, production-safe stop for every
 * public-vacancy provider. Modelled directly on the Eurostat kill switch so
 * an operator has ONE mental model for stopping an external source, not two.
 *
 * Three independent gates, evaluated in this order. Any one of them stops
 * everything before a single request is made:
 *
 *   1. GLOBAL kill — VACANCY_IMPORT_KILL_SWITCH="on" stops every provider at
 *      once. This is the button to press when something is wrong and you do
 *      not yet know which source caused it.
 *   2. PER-PROVIDER enable — VACANCY_SOURCE_<KEY>_ENABLED must be explicitly
 *      on. Absent or anything else = OFF (fail-closed), so shipping this code
 *      leaves every provider dormant in production until a deliberate env
 *      flip. Deploying the pipeline is not the same act as switching it on.
 *   3. PER-PROVIDER kill — VACANCY_SOURCE_<KEY>_KILL_SWITCH="on" stops one
 *      provider without touching the others.
 *
 * Disabling is NOT rollback: nothing already stored is deleted. And the env
 * switch is only half the gate — a provider that is env-enabled but not
 * activated in lib/intelligence/source-governance.ts still imports nothing,
 * because the import boundary refuses it. Both must be true. That dual gate
 * is deliberate: an env var is an operator action, activation is an owner
 * decision, and neither one alone should be able to start an import.
 *
 * Reading env here is intentional and allowed: this module lives OUTSIDE
 * lib/vacancy-sources (the pure, env-free layer). Server-only. Never logs a
 * variable's value — only whether it was on.
 */
import type { VacancyProviderKey } from "@/lib/vacancy-sources/vacancy-contract";

export type VacancyBlockedReason =
  | "global_kill_switch_engaged"
  | "provider_kill_switch_engaged"
  | "provider_disabled";

export interface VacancySwitchState {
  readonly providerKey: string;
  /** True only when no kill is engaged AND the provider is explicitly on. */
  readonly operational: boolean;
  readonly globalKillEngaged: boolean;
  readonly providerKillEngaged: boolean;
  readonly providerEnabled: boolean;
  readonly blockedReason: VacancyBlockedReason | null;
}

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "on";
}

/** `arbetsformedlingen` → `ARBETSFORMEDLINGEN`. Non-alphanumerics become
 *  underscores so a hyphenated future key still yields a legal env name. */
export function providerEnvSuffix(providerKey: string): string {
  return providerKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function providerEnabledEnvName(providerKey: string): string {
  return `VACANCY_SOURCE_${providerEnvSuffix(providerKey)}_ENABLED`;
}

export function providerKillEnvName(providerKey: string): string {
  return `VACANCY_SOURCE_${providerEnvSuffix(providerKey)}_KILL_SWITCH`;
}

export const GLOBAL_KILL_ENV_NAME = "VACANCY_IMPORT_KILL_SWITCH";

/**
 * Evaluate the switch from an explicit env snapshot — pure over its input, so
 * every branch is unit-testable without touching process.env.
 */
export function evaluateVacancySwitch(
  providerKey: string,
  env: Readonly<Record<string, string | undefined>>,
): VacancySwitchState {
  const globalKillEngaged = isOn(env[GLOBAL_KILL_ENV_NAME]);
  const providerKillEngaged = isOn(env[providerKillEnvName(providerKey)]);
  const providerEnabled = isOn(env[providerEnabledEnvName(providerKey)]);

  const base = {
    providerKey,
    globalKillEngaged,
    providerKillEngaged,
    providerEnabled,
  };

  if (globalKillEngaged) {
    return {
      ...base,
      operational: false,
      blockedReason: "global_kill_switch_engaged",
    };
  }
  if (providerKillEngaged) {
    return {
      ...base,
      operational: false,
      blockedReason: "provider_kill_switch_engaged",
    };
  }
  if (!providerEnabled) {
    return { ...base, operational: false, blockedReason: "provider_disabled" };
  }
  return { ...base, operational: true, blockedReason: null };
}

/** Runtime evaluation against the live process env. */
export function vacancySwitchState(
  providerKey: VacancyProviderKey | string,
): VacancySwitchState {
  return evaluateVacancySwitch(providerKey, process.env);
}

/** Guard used before any request or write. Throws a stable, secret-free
 *  error so callers fail loudly and safely. */
export function assertVacancyProviderOperational(
  providerKey: VacancyProviderKey | string,
): void {
  const state = vacancySwitchState(providerKey);
  if (!state.operational) {
    throw new Error(`vacancy_import_blocked:${state.blockedReason}`);
  }
}
