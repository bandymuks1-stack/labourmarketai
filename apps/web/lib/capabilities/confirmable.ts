import "server-only";

import { createHash } from "node:crypto";

import { env } from "@/lib/env";
import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import { spendConfirmationForRequest } from "@/lib/security/confirmation-spend";
import { confirmationKeyMaterial } from "@/lib/security/confirmation-key-material";

/**
 * THE capability confirmation wiring (G4 tail wagon 1) — the ONE way a
 * capability draft mints a one-time token and its confirm verifies it.
 * Extracted from the journal pair so express-interest (and every next
 * bridged write) reuses the SAME semantics instead of growing a parallel
 * confirmation implementation: same domain-separated secret, same canonical
 * input hash, same state-fingerprint binding, same TTL and replay rules
 * (all inherited from lib/conversation/confirmation-token).
 */

/**
 * Domain-separated signing secret for CAPABILITY confirmation tokens. Same
 * derivation pattern as the conversation dispatcher's, different purpose
 * string — a token minted for one surface can never be replayed on the other.
 */
export function capabilityTokenSecret(): string {
  // Same rule as the conversation signer: production requires the dedicated
  // key and refuses the service-role fallback.
  const verdict = confirmationKeyMaterial({
    dedicated: env.CONVERSATION_TOKEN_SECRET,
    serviceRole: env.SUPABASE_SERVICE_ROLE_KEY,
    production: process.env.NODE_ENV === "production",
  });
  if (!verdict.ok) {
    throw new Error(
      `capability confirmation tokens cannot be signed: ${verdict.reason} ` +
        "Refusing to sign with a hardcoded fallback.",
    );
  }
  return createHash("sha256").update(`capability-confirmation:v1:${verdict.material}`).digest("hex");
}

/** Mint the one-time token a draft returns. `input` must be the NORMALIZED
 *  draft shape (null-vs-absent decided — see the journal pair's
 *  normalizedDraftForHash lesson) so the confirm side hashes identically. */
export function mintCapabilityConfirmation(opts: {
  actionId: string;
  input: Record<string, unknown>;
  userId: string;
  stateFingerprint: string;
}): string {
  return issueConfirmationToken(capabilityTokenSecret(), {
    actionId: opts.actionId,
    inputHash: canonicalInputHash(opts.input),
    userId: opts.userId,
    stateFingerprint: opts.stateFingerprint,
    issuedAtMs: Date.now(),
  });
}

/** Verify a confirm call's token against the SAME normalized input, caller,
 *  and freshly recomputed state fingerprint — and SPEND it.
 *
 *  A state fingerprint refuses a replay only once the write has moved the
 *  state; two confirms arriving together both read the old state. A genuine
 *  token is therefore spent atomically (`public.confirmation_spends`, primary
 *  key) before the caller's write runs: of any number of submissions of one
 *  token exactly one passes, the rest answer `stale_state`. The client is the
 *  request's own (`createClient()` — the verified bearer caller inside the MCP
 *  door's scope), so the spend is RLS-bound to the same person. */
export async function verifyCapabilityConfirmation(opts: {
  actionId: string;
  token: string;
  input: Record<string, unknown>;
  userId: string;
  currentStateFingerprint: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const verdict = verifyConfirmationToken(capabilityTokenSecret(), opts.token, {
    actionId: opts.actionId,
    input: opts.input,
    userId: opts.userId,
    currentStateFingerprint: opts.currentStateFingerprint,
    nowMs: Date.now(),
  });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  const spend = await spendConfirmationForRequest(opts.token, opts.actionId);
  if (spend === "already_spent") return { ok: false, reason: "stale_state" };
  if (spend === "error") return { ok: false, reason: "spend_failed" };
  return { ok: true };
}
