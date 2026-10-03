import "server-only";

/**
 * Server-side master switch for billing recovery WRITES (scheduled sweep and the
 * self-service refresh). Default OFF and fail closed: only the literal string
 * "true" enables it; unset, blank, "1", "TRUE" or anything else is OFF.
 *
 * Three independent controls, deliberately not the same thing:
 *   - CRON_SECRET                          who may call the cron route (auth);
 *   - BILLING_RECOVERY_SCHEDULE_ENABLED    whether the GitHub workflow calls it (cadence);
 *   - BILLING_RECOVERY_ENABLED (this one)  whether recovery may write at all (capability).
 * A valid CRON_SECRET alone never permits a live recovery write.
 */
export function isBillingRecoveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.BILLING_RECOVERY_ENABLED ?? "").trim() === "true";
}
