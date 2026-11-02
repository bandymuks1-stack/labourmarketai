import { createECDH, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  base64UrlToBuffer,
  decryptWebPushPayloadForTest,
  encryptWebPushPayload,
  isAllowedPushEndpoint,
  isValidSubscription,
  vapidAuthorization,
  vapidPrivateKeyBytes,
  VAPID_TOKEN_SECONDS,
} from "./web-push-protocol";
import { webPushStatus } from "./web-push-config";

// RFC 8291 Appendix A — the published end-to-end example.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("RFC 8291 message encryption", () => {
  it("reproduces the RFC 8291 Appendix A message byte for byte", () => {
    const out = encryptWebPushPayload(
      Buffer.from(RFC.plaintext, "utf8"),
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      { ephemeralPrivateKey: base64UrlToBuffer(RFC.asPrivate), salt: base64UrlToBuffer(RFC.salt) },
    );
    expect(out.toString("base64url")).toBe(RFC.message);
  });

  it("a fresh message (random key and salt) decrypts with the subscriber's key", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.alloc(16, 7);
    const msg = encryptWebPushPayload(Buffer.from('{"title":"x"}'), {
      p256dh: ua.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    });
    expect(decryptWebPushPayloadForTest(msg, ua.getPrivateKey(), auth).toString()).toBe('{"title":"x"}');
  });

  it("refuses a malformed key, auth secret or an oversized payload", () => {
    expect(() => encryptWebPushPayload(Buffer.from("x"), { p256dh: "AAAA", auth: RFC.auth })).toThrow("invalid_p256dh");
    expect(() => encryptWebPushPayload(Buffer.from("x"), { p256dh: RFC.uaPublic, auth: "AAAA" })).toThrow("invalid_auth");
    expect(() =>
      encryptWebPushPayload(Buffer.alloc(5000), { p256dh: RFC.uaPublic, auth: RFC.auth }),
    ).toThrow("payload_too_large");
  });
});

describe("RFC 8292 VAPID", () => {
  const keys = createECDH("prime256v1");
  keys.generateKeys();
  const publicKey = keys.getPublicKey().toString("base64url");
  const privateKey = keys.getPrivateKey().toString("base64url");

  it("signs an ES256 token for the push service origin, valid ≤ 24 h", () => {
    const header = vapidAuthorization({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      subject: "mailto:ops@example.com",
      publicKey,
      privateKey,
      nowSeconds: 1_000_000,
    });
    expect(header).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    const token = header.slice("vapid t=".length, header.indexOf(", k="));
    const [h, c, s] = token.split(".");
    const claims = JSON.parse(Buffer.from(c!, "base64url").toString());
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_000_000 + VAPID_TOKEN_SECONDS, sub: "mailto:ops@example.com" });
    expect(VAPID_TOKEN_SECONDS).toBeLessThanOrEqual(24 * 60 * 60);
    const pub = base64UrlToBuffer(publicKey);
    const ok = verify(
      "sha256",
      Buffer.from(`${h}.${c}`),
      {
        key: createPublicKey({
          key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") },
          format: "jwk",
        }),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(s!, "base64url"),
    );
    expect(ok).toBe(true);
    expect(header.endsWith(`k=${publicKey}`)).toBe(true);
  });

  it("refuses malformed VAPID keys", () => {
    expect(() =>
      vapidAuthorization({ endpoint: "https://fcm.googleapis.com/x", subject: "mailto:a@b.c", publicKey: "AAAA", privateKey }),
    ).toThrow("invalid_vapid_keys");
  });
});

describe("only real push services are ever called (no SSRF)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QF8abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/x",
    "https://evil.example/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example/x",
    "https://user:pass@fcm.googleapis.com/x",
    "https://127.0.0.1/x",
    "https://localhost/x",
    "https://169.254.169.254/latest/meta-data",
    "not a url",
    `https://fcm.googleapis.com/${"a".repeat(2100)}`,
  ])("refuses %s", (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
  });

  it("validates the whole subscription shape", () => {
    expect(isValidSubscription({ endpoint: "https://fcm.googleapis.com/x", p256dh: RFC.uaPublic, auth: RFC.auth })).toBe(true);
    expect(isValidSubscription({ endpoint: "https://fcm.googleapis.com/x", p256dh: RFC.auth, auth: RFC.auth })).toBe(false);
    expect(isValidSubscription({ endpoint: "https://fcm.googleapis.com/x", p256dh: RFC.uaPublic, auth: "a+b/" })).toBe(false);
    expect(isValidSubscription({ endpoint: 42, p256dh: RFC.uaPublic, auth: RFC.auth })).toBe(false);
  });
});

describe("a VAPID private key with a leading zero byte is the same key", () => {
  // Node's createECDH().getPrivateKey() drops a leading 0x00 (~1 key in 256),
  // which made CI flaky and would have left a valid owner key silently OFF.
  const padded = Buffer.concat([Buffer.from([0]), Buffer.alloc(31, 7)]);
  const keys = createECDH("prime256v1");
  keys.setPrivateKey(padded);
  const publicKey = keys.getPublicKey().toString("base64url");
  const unpadded = padded.subarray(1).toString("base64url");

  it("left-pads 31 bytes to the same 32-byte scalar; rejects empty and over-long", () => {
    expect(vapidPrivateKeyBytes(unpadded)?.equals(padded)).toBe(true);
    expect(vapidPrivateKeyBytes(padded.toString("base64url"))?.equals(padded)).toBe(true);
    expect(vapidPrivateKeyBytes("")).toBeNull();
    expect(vapidPrivateKeyBytes(Buffer.alloc(33, 1).toString("base64url"))).toBeNull();
  });

  it("signs with the unpadded form and the config treats it as present", () => {
    const header = vapidAuthorization({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      subject: "mailto:ops@example.com",
      publicKey,
      privateKey: unpadded,
      nowSeconds: 1_000_000,
    });
    expect(header).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    const status = webPushStatus({
      WEB_PUSH_ENABLED: "true",
      WEB_PUSH_VAPID_PUBLIC_KEY: publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: unpadded,
      WEB_PUSH_VAPID_SUBJECT: "mailto:ops@example.com",
    });
    expect(status.active).toBe(true);
  });
});
