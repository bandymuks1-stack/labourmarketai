import "server-only";

/**
 * EUROSTAT KILL SWITCH — the immediate, production-safe stop for the
 * Eurostat integration. When engaged it prevents, in this order and before
 * any work happens:
 *
 *   1. new official-API requests (the adapter refuses to construct a URL),
 *   2. new import sessions (the importer refuses to start),
 *   3. new observation persistence (the writer refuses to insert).
 *
 * It NEVER deletes existing evidence — disabling is not rollback. Two
 * independent engage paths, either of which stops everything:
 *
 *   - env kill switch: EUROSTAT_KILL_SWITCH="on" (checked at runtime, so an
 *     owner can stop the integration by setting one Vercel env var with no
 *     redeploy of logic);
 *   - the code default: EUROSTAT_SOURCE_ENABLED must be explicitly "on" for
 *     the integration to run at all. Absent / anything else = OFF
 *     (fail-closed). Shipping with it unset keeps Eurostat dormant in
 *     production even after this code deploys — activation is a deliberate
 *     env flip, mirroring the dual gate.
 *
 * Reading env here is intentional and allowed: this module lives OUTSIDE
 * lib/intelligence (which is the pure, env-free layer). Server-only.
 */

export type EurostatSwitchState = {
  /** True only when the source is explicitly enabled AND not killed. */
  readonly operational: boolean;
  /** True when the env kill switch is engaged. */
  readonly killEngaged: boolean;
  /** True when the source enable flag is explicitly on. */
  readonly sourceEnabled: boolean;
  /** i18n/stable reason code when not operational. */
  readonly blockedReason:
    | "kill_switch_engaged"
    | "source_disabled"
    | null;
};

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "on";
}

/**
 * Evaluate the switch from an explicit env snapshot (pure over its input —
 * the caller passes process.env so this stays unit-testable).
 */
export function evaluateEurostatSwitch(env: {
  EUROSTAT_KILL_SWITCH?: string;
  EUROSTAT_SOURCE_ENABLED?: string;
}): EurostatSwitchState {
  const killEngaged = isOn(env.EUROSTAT_KILL_SWITCH);
  const sourceEnabled = isOn(env.EUROSTAT_SOURCE_ENABLED);
  if (killEngaged) {
    return {
      operational: false,
      killEngaged,
      sourceEnabled,
      blockedReason: "kill_switch_engaged",
    };
  }
  if (!sourceEnabled) {
    return {
      operational: false,
      killEngaged,
      sourceEnabled,
      blockedReason: "source_disabled",
    };
  }
  return { operational: true, killEngaged, sourceEnabled, blockedReason: null };
}

/** Runtime evaluation against the live process env. */
export function eurostatSwitchState(): EurostatSwitchState {
  return evaluateEurostatSwitch({
    EUROSTAT_KILL_SWITCH: process.env.EUROSTAT_KILL_SWITCH,
    EUROSTAT_SOURCE_ENABLED: process.env.EUROSTAT_SOURCE_ENABLED,
  });
}

/** Convenience guard used before any request / session / write. Throws a
 *  stable, secret-free error so callers fail loudly and safely. */
export function assertEurostatOperational(): void {
  const state = eurostatSwitchState();
  if (!state.operational) {
    throw new Error(`eurostat_blocked:${state.blockedReason}`);
  }
}
