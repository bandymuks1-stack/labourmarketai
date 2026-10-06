import { describe, expect, it } from "vitest";

import {
  UPLOAD_TOKEN_TTL_SECONDS,
  mintUploadToken,
  opaqueSubject,
} from "./upload-token";
// The SERVICE's verifier. Importing it here pins the two implementations to
// the same wire format: a token minted by the web app must verify there.
import * as svc from "../../../../services/transcribe/upload-auth.mjs";

const SECRET = "s".repeat(48);
const PROFILE = "11111111-1111-4111-8111-111111111111";
const NOW = 1_800_000_000_000;

const mint = (o: Partial<Parameters<typeof mintUploadToken>[0]> = {}) =>
  mintUploadToken({
    secret: SECRET,
    profileId: PROFILE,
    maxBytes: 25 * 1024 * 1024,
    nowMs: NOW,
    ...o,
  });

describe("upload token - minted by the web app, verified by the service", () => {
  it("POSITIVE: a minted token verifies in the service module with the same claims", () => {
    const { token, claims } = mint();
    const v = svc.verifyUploadToken(SECRET, token, NOW);
    expect(v.ok).toBe(true);
    expect(v.claims).toEqual(claims);
    expect(claims.scope).toBe("transcribe");
    expect(claims.exp - Math.floor(NOW / 1000)).toBe(UPLOAD_TOKEN_TTL_SECONDS);
  });

  it("the token never carries the profile id (opaque subject)", () => {
    const { token, claims } = mint();
    expect(token).not.toContain(PROFILE);
    expect(JSON.stringify(claims)).not.toContain(PROFILE);
    expect(claims.sub).toBe(opaqueSubject(SECRET, PROFILE));
    expect(claims.sub).not.toBe(
      opaqueSubject(SECRET, "22222222-2222-4222-8222-222222222222"),
    );
    expect(claims.sub).not.toBe(opaqueSubject("t".repeat(48), PROFILE));
  });

  it("NEGATIVE: a wrong secret, a tampered payload and a tampered signature are all refused", () => {
    const { token } = mint();
    expect(svc.verifyUploadToken("x".repeat(48), token, NOW)).toEqual({
      ok: false,
      code: "bad_signature",
    });
    const [p, body, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body, "base64url").toString()),
        max: 10 ** 12,
      }),
    ).toString("base64url");
    expect(
      svc.verifyUploadToken(SECRET, `${p}.${forgedBody}.${sig}`, NOW),
    ).toEqual({ ok: false, code: "bad_signature" });
    expect(
      svc.verifyUploadToken(SECRET, `${p}.${body}.${sig.slice(0, -2)}AA`, NOW)
        .ok,
    ).toBe(false);
  });

  it("ADVERSARIAL: junk is malformed, never a crash", () => {
    for (const t of [
      "",
      "v1",
      "v1..",
      "v2.a.b",
      "a.b.c",
      "v1.%%%.%%%",
      undefined,
      null,
      42,
      {},
    ]) {
      const r = svc.verifyUploadToken(SECRET, t as never, NOW);
      expect(r.ok).toBe(false);
    }
  });

  it("expiry is hard; a far-future token is refused even with a valid signature", () => {
    const { token } = mint();
    expect(
      svc.verifyUploadToken(
        SECRET,
        token,
        NOW + (UPLOAD_TOKEN_TTL_SECONDS + 1) * 1000,
      ),
    ).toEqual({ ok: false, code: "expired" });
    const forged = svc.signUploadToken(SECRET, {
      v: 1,
      scope: "transcribe",
      sub: "x",
      jti: "j",
      max: 1,
      exp: Math.floor(NOW / 1000) + 86_400,
    });
    expect(svc.verifyUploadToken(SECRET, forged, NOW)).toEqual({
      ok: false,
      code: "too_long_lived",
    });
  });

  it("scope is enforced: a validly signed token for another scope is refused", () => {
    const other = svc.signUploadToken(SECRET, {
      v: 1,
      scope: "admin",
      sub: "x",
      jti: "j",
      max: 1,
      exp: Math.floor(NOW / 1000) + 60,
    });
    expect(svc.verifyUploadToken(SECRET, other, NOW)).toEqual({
      ok: false,
      code: "bad_scope",
    });
  });

  it("a token cannot outlive 300 s however it is minted", () => {
    const { claims } = mint({ ttlSeconds: 99_999 });
    expect(claims.exp - Math.floor(NOW / 1000)).toBe(300);
  });

  it("each mint is unique (jti) so single-use can be enforced", () => {
    const a = mintUploadToken({
      secret: SECRET,
      profileId: PROFILE,
      maxBytes: 1,
      nowMs: NOW,
    });
    const b = mintUploadToken({
      secret: SECRET,
      profileId: PROFILE,
      maxBytes: 1,
      nowMs: NOW,
    });
    expect(a.claims.jti).not.toBe(b.claims.jti);
  });
});

describe("service helpers - replay, byte cap, CORS, rate limit, cache TTL", () => {
  it("SINGLE USE: the second consume of a jti is a replay; entries expire", () => {
    const guard = svc.createReplayGuard();
    const claims = { jti: "abc", exp: Math.floor(NOW / 1000) + 60 };
    expect(guard.consume(claims, NOW)).toBe(true);
    expect(guard.consume(claims, NOW + 1000)).toBe(false);
    // after expiry the entry is pruned (memory stays bounded)
    guard.consume(
      { jti: "other", exp: Math.floor(NOW / 1000) + 600 },
      NOW + 120_000,
    );
    expect(guard.size()).toBe(1);
  });

  it("the byte cap in a token can only LOWER the service cap", () => {
    expect(svc.effectiveByteCap(25_000_000, { max: 1_000_000 })).toBe(
      1_000_000,
    );
    expect(svc.effectiveByteCap(25_000_000, { max: 10 ** 12 })).toBe(
      25_000_000,
    );
    expect(svc.effectiveByteCap(25_000_000, { max: -5 })).toBe(25_000_000);
    expect(svc.effectiveByteCap(25_000_000, {})).toBe(25_000_000);
  });

  it("CORS: exact origins only; a wildcard in the allow-list is dropped; no origin = server-to-server", () => {
    const allowed = svc.parseAllowedOrigins(
      "https://labourmarket.ai/, *, https://www.labourmarket.ai",
    );
    expect(allowed).toEqual([
      "https://labourmarket.ai",
      "https://www.labourmarket.ai",
    ]);
    const ok = svc.corsFor("https://labourmarket.ai", allowed);
    expect(ok.allowed).toBe(true);
    expect(ok.headers["access-control-allow-origin"]).toBe(
      "https://labourmarket.ai",
    );
    expect(ok.headers["access-control-allow-headers"]).toContain(
      "authorization",
    );
    const bad = svc.corsFor("https://evil.example", allowed);
    expect(bad.allowed).toBe(false);
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    expect(
      svc.corsFor("https://labourmarket.ai.evil.example", allowed).allowed,
    ).toBe(false);
    expect(svc.corsFor(undefined, allowed)).toEqual({
      present: false,
      allowed: true,
      headers: {},
    });
    expect(svc.parseAllowedOrigins("")).toEqual([]);
    expect(svc.corsFor("https://labourmarket.ai", []).allowed).toBe(false);
  });

  it("per-subject rate limit: limited after N hits in the window, independent per subject", () => {
    const lim = svc.createSubjectLimiter(3, 60_000);
    expect([1, 2, 3].map(() => lim.hit("a", NOW))).toEqual([
      false,
      false,
      false,
    ]);
    expect(lim.hit("a", NOW)).toBe(true);
    expect(lim.hit("b", NOW)).toBe(false);
    expect(lim.hit("a", NOW + 61_000)).toBe(false);
  });

  it("transcript-cache retention is BOUNDED: default 10 min, hard max 1 h, never unbounded", () => {
    expect(svc.cacheTtlSeconds(undefined)).toBe(600);
    expect(svc.cacheTtlSeconds("0")).toBe(600);
    expect(svc.cacheTtlSeconds("-5")).toBe(600);
    expect(svc.cacheTtlSeconds("abc")).toBe(600);
    expect(svc.cacheTtlSeconds("120")).toBe(120);
    expect(svc.cacheTtlSeconds("99999999")).toBe(3600);
  });
});
