import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Conversation confirmation tokens (Phase B).
 *
 * A confirmation card for an `important_write` / `strong_irreversible` action
 * carries a server-issued token. The token is:
 *   - TAMPER-PROOF: HMAC over its payload; any edit invalidates it.
 *   - BOUND to the exact action + input + user: a token minted for
 *     "decline booking X" can never execute "accept booking Y", and one user's
 *     token can never run as another user.
 *   - FRESH: it expires after a short TTL (stale cards are rejected).
 *   - ONE-TIME per state transition: it embeds a `stateFingerprint` captured
 *     when the card was shown; at execution the server re-derives the current
 *     fingerprint and rejects the token if the state moved on (a replay after
 *     the action already ran, or a stale card whose underlying row changed).
 *
 * The module is PURE (node:crypto only) — the secret is injected by the server
 * wrapper, so it is fully unit-testable and never reaches the client.
 */

export type ConfirmationPayload = {
  /** Registry action id the token authorizes. */
  readonly actionId: string;
  /** sha256 of the canonical input the card was shown for. */
  readonly inputHash: string;
  /** The acting user id (auth.uid()). */
  readonly userId: string;
  /** Opaque fingerprint of the relevant server state at issue time. */
  readonly stateFingerprint: string;
  /** Issue time (epoch ms). */
  readonly issuedAtMs: number;
};

export type VerifyInput = {
  readonly actionId: string;
  readonly input: unknown;
  readonly userId: string;
  readonly currentStateFingerprint: string;
  readonly nowMs: number;
  /** Max token age in ms (default 5 min). */
  readonly ttlMs?: number;
};

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "malformed" | "bad_signature" | "expired" | "action_mismatch"
        | "input_mismatch" | "user_mismatch" | "stale_state";
    };

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Canonical, stable JSON for hashing (sorted keys, no incidental whitespace). */
export function canonicalInputHash(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Mint a confirmation token. */
export function issueConfirmationToken(
  secret: string,
  payload: ConfirmationPayload,
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

/** Verify a token against the live execution context. */
export function verifyConfirmationToken(
  secret: string,
  token: string,
  ctx: VerifyInput,
): VerifyResult {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Constant-time signature check.
  const expected = sign(secret, body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: ConfirmationPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload?.actionId !== "string" ||
    typeof payload?.inputHash !== "string" ||
    typeof payload?.userId !== "string" ||
    typeof payload?.stateFingerprint !== "string" ||
    typeof payload?.issuedAtMs !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const ttl = ctx.ttlMs ?? DEFAULT_TTL_MS;
  if (ctx.nowMs - payload.issuedAtMs > ttl || payload.issuedAtMs > ctx.nowMs + 5000) {
    return { ok: false, reason: "expired" };
  }
  if (payload.actionId !== ctx.actionId) return { ok: false, reason: "action_mismatch" };
  if (payload.userId !== ctx.userId) return { ok: false, reason: "user_mismatch" };
  if (payload.inputHash !== canonicalInputHash(ctx.input)) {
    return { ok: false, reason: "input_mismatch" };
  }
  // One-time-per-transition: the state must not have moved since the card was
  // shown (rejects replay-after-execution and stale confirmation cards).
  if (payload.stateFingerprint !== ctx.currentStateFingerprint) {
    return { ok: false, reason: "stale_state" };
  }
  return { ok: true };
}
