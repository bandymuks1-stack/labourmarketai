import "server-only";

import { createHash } from "node:crypto";

import { env } from "@/lib/env";
import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";

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
  const material = env.CONVERSATION_TOKEN_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) {
    throw new Error(
      "capability confirmation tokens cannot be signed: set CONVERSATION_TOKEN_SECRET " +
        "(or SUPABASE_SERVICE_ROLE_KEY). Refusing to sign with a hardcoded fallback.",
    );
  }
  return createHash("sha256").update(`capability-confirmation:v1:${material}`).digest("hex");
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
 *  and freshly recomputed state fingerprint. */
export function verifyCapabilityConfirmation(opts: {
  actionId: string;
  token: string;
  input: Record<string, unknown>;
  userId: string;
  currentStateFingerprint: string;
}): { ok: true } | { ok: false; reason: string } {
  const verdict = verifyConfirmationToken(capabilityTokenSecret(), opts.token, {
    actionId: opts.actionId,
    input: opts.input,
    userId: opts.userId,
    currentStateFingerprint: opts.currentStateFingerprint,
    nowMs: Date.now(),
  });
  return verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason };
}
