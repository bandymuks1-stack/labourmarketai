import { describe, expect, it } from "vitest";
import {
  issueConfirmationToken,
  verifyConfirmationToken,
  canonicalInputHash,
  type ConfirmationPayload,
} from "@/lib/conversation/confirmation-token";

const SECRET = "test-secret-not-a-real-key";
const NOW = 1_800_000_000_000;

function mint(over: Partial<ConfirmationPayload> = {}, input: unknown = { bookingId: "b1", decision: "accepted" }) {
  const payload: ConfirmationPayload = {
    actionId: "worker.respond-booking",
    inputHash: canonicalInputHash(input),
    userId: "u1",
    stateFingerprint: "proposed",
    issuedAtMs: NOW,
    ...over,
  };
  return issueConfirmationToken(SECRET, payload);
}

const baseCtx = {
  actionId: "worker.respond-booking",
  input: { bookingId: "b1", decision: "accepted" },
  userId: "u1",
  currentStateFingerprint: "proposed",
  nowMs: NOW + 1000,
};

describe("confirmation token", () => {
  it("accepts a fresh, matching token", () => {
    expect(verifyConfirmationToken(SECRET, mint(), baseCtx)).toEqual({ ok: true });
  });

  it("rejects a tampered signature", () => {
    const t = mint();
    const bad = t.slice(0, -2) + (t.endsWith("aa") ? "bb" : "aa");
    expect(verifyConfirmationToken(SECRET, bad, baseCtx).ok).toBe(false);
  });

  it("rejects a token minted with a different secret", () => {
    const t = issueConfirmationToken("other-secret", {
      actionId: "worker.respond-booking",
      inputHash: canonicalInputHash(baseCtx.input),
      userId: "u1",
      stateFingerprint: "proposed",
      issuedAtMs: NOW,
    });
    expect(verifyConfirmationToken(SECRET, t, baseCtx)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an expired token (older than TTL)", () => {
    expect(
      verifyConfirmationToken(SECRET, mint(), { ...baseCtx, nowMs: NOW + 6 * 60 * 1000 }),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a future-dated token (clock skew abuse)", () => {
    expect(
      verifyConfirmationToken(SECRET, mint({ issuedAtMs: NOW + 60_000 }), baseCtx),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token for a different action", () => {
    expect(
      verifyConfirmationToken(SECRET, mint(), { ...baseCtx, actionId: "worker.express-interest" }),
    ).toEqual({ ok: false, reason: "action_mismatch" });
  });

  it("rejects another user's token (cross-user)", () => {
    expect(
      verifyConfirmationToken(SECRET, mint(), { ...baseCtx, userId: "u2" }),
    ).toEqual({ ok: false, reason: "user_mismatch" });
  });

  it("rejects a token whose input was swapped (accept X -> accept Y)", () => {
    expect(
      verifyConfirmationToken(SECRET, mint(), {
        ...baseCtx,
        input: { bookingId: "b2", decision: "accepted" },
      }),
    ).toEqual({ ok: false, reason: "input_mismatch" });
  });

  it("rejects a replay after the state moved on (one-time per transition)", () => {
    // Card shown while booking was "proposed"; by execution it is "accepted".
    expect(
      verifyConfirmationToken(SECRET, mint(), { ...baseCtx, currentStateFingerprint: "accepted" }),
    ).toEqual({ ok: false, reason: "stale_state" });
  });

  it("rejects malformed tokens", () => {
    expect(verifyConfirmationToken(SECRET, "garbage", baseCtx).ok).toBe(false);
    expect(verifyConfirmationToken(SECRET, "", baseCtx).ok).toBe(false);
    expect(verifyConfirmationToken(SECRET, ".sig", baseCtx).ok).toBe(false);
  });

  it("canonicalInputHash is order-independent for object keys", () => {
    expect(canonicalInputHash({ a: 1, b: 2 })).toBe(canonicalInputHash({ b: 2, a: 1 }));
    expect(canonicalInputHash({ a: 1 })).not.toBe(canonicalInputHash({ a: 2 }));
  });
});
