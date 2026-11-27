/**
 * ZERO PAID API BUDGET (owner order 2026-10-27).
 *
 * "Kol projektai neturi realaus pelno, nenaudok mokamų AI API ar naujų mokamų
 * paslaugų." Until the owner explicitly opens it, no request may reach a
 * metered provider — not as the first choice, not as a fallback after the free
 * tiers are exhausted, and not through the translation secondaries. A free
 * quota that runs out degrades to the honest off-state; it never rolls over
 * onto a bill.
 *
 * One switch, OFF unless it is exactly "true":
 *   AI_PAID_PROVIDERS_ALLOWED=true   — owner decision, set on the VPS only.
 *
 * The cost class comes from the provider's own profile (`provider-chain.ts`,
 * `run-core.ts` secondaries): `free_local` and `free_tier` pass, `paid` is
 * refused. An unknown class is refused too — a provider nobody classified is
 * not proven free.
 */

export const ZERO_PAID_BUDGET_REASON =
  "zero paid API budget — metered providers stay off until the owner sets AI_PAID_PROVIDERS_ALLOWED=true";

/** True only when the owner explicitly allowed metered providers. */
export function paidProvidersAllowed(
  value: string | undefined = process.env.AI_PAID_PROVIDERS_ALLOWED,
): boolean {
  return value?.trim() === "true";
}

/** True when a provider of this cost class may not run under the budget. */
export function blockedByZeroPaidBudget(costClass: string, allowPaid: boolean): boolean {
  if (costClass === "free_local" || costClass === "free_tier") return false;
  return !allowPaid;
}
