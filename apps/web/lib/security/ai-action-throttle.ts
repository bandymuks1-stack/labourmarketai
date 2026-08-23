import "server-only";

/**
 * Throttle for PUBLIC (unauthenticated) server actions that invoke the AI
 * runtime — value train 2, Wagon A.
 *
 * WHY: the three marketing-route AI actions (match preview, worker intake,
 * company need) are `"use server"` actions POST-reachable without auth. Today
 * the AI runtime is dormant (empty egress-grant table), so they cost nothing —
 * but the moment the owner activates a provider they become unmetered anonymous
 * spend. The 2026-08-17 audit already closed this for the company-need PERSIST
 * step; this closes it for the model call itself, on every public AI action.
 *
 * FAIL-CLOSED, deliberately stricter than the intake limiter's catch: when
 * `headers()` is unavailable (outside a request scope) the caller is counted
 * against the shared "unknown-client" bucket rather than waved through. An AI
 * call nobody can attribute must still be metered.
 *
 * Same honest limits as lib/security/rate-limit.ts: in-memory, per-instance —
 * a brake on naive abuse, not a distributed quota.
 */
import { headers } from "next/headers";
import { clientKeyFromHeaders, rateLimit } from "./rate-limit";

export async function aiActionRateLimited(opts: {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
}): Promise<boolean> {
  let key = "unknown-client";
  try {
    key = clientKeyFromHeaders(await headers());
  } catch {
    // Outside a request scope — shared bucket, never a free pass.
  }
  return rateLimit({ ...opts, key }).limited;
}
