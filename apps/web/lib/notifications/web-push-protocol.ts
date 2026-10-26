/**
 * WEB PUSH PROTOCOL (COM-3 push channel) — the two pieces of standard
 * cryptography a push message needs, on Node's own `crypto`, no dependency:
 *
 *   · RFC 8291 message encryption ("aes128gcm" content coding, RFC 8188):
 *     the push service relays bytes it cannot read; only the subscribed
 *     browser can decrypt them.
 *   · RFC 8292 VAPID: a short-lived ES256 token proving the message comes
 *     from the application server that owns the public key the browser
 *     subscribed with.
 *
 * WHY NOT A LIBRARY. The whole protocol is ~150 lines of HKDF + ECDH +
 * AES-GCM + one JWT, and RFC 8291 Appendix A publishes a full test vector,
 * which `web-push-protocol.test.ts` reproduces byte for byte. One fewer
 * supply-chain dependency on a path that holds a signing key.
 *
 * KEYS. The VAPID private key is an OWNER-ENTERED secret read from the
 * server environment at send time (`web-push-config.ts`). It is never
 * generated into, logged by or committed to this repository.
 *
 * PURE apart from randomness (ephemeral key, salt), both injectable so the
 * RFC vector is testable. No network here: `web-push-dispatch.ts` sends.
 */
import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";

export function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function bufferToBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function hmac(key: Uint8Array, data: Uint8Array): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** HKDF (RFC 5869) with a single output block — every length here is ≤ 32. */
function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Buffer {
  const prk = hmac(salt, ikm);
  return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

/** An uncompressed P-256 point: 0x04 || X(32) || Y(32). */
export function isP256PublicKey(bytes: Uint8Array): boolean {
  return bytes.length === 65 && bytes[0] === 0x04;
}

/**
 * The raw P-256 private scalar as exactly 32 bytes, or null.
 *
 * A scalar whose leading byte is zero is the same key with that byte dropped:
 * Node's `createECDH().getPrivateKey()` and several key generators emit it
 * unpadded (~1 key in 256 comes out 31 bytes). Rejecting it would leave a valid
 * owner-entered key silently OFF, so it is left-padded here, once, for both the
 * config check and the signer.
 */
export function vapidPrivateKeyBytes(privateKey: string): Buffer | null {
  const raw = base64UrlToBuffer(privateKey);
  if (raw.length === 0 || raw.length > 32) return null;
  if (raw.length === 32) return raw;
  return Buffer.concat([Buffer.alloc(32 - raw.length), raw]);
}

/** True only when the private scalar really derives the given public point —
 *  padding makes any short string decodable, so a pair check is what keeps a
 *  truncated or mismatched key OFF. */
export function isVapidKeyPair(publicKey: string, privateKey: string): boolean {
  const pub = base64UrlToBuffer(publicKey);
  const priv = vapidPrivateKeyBytes(privateKey);
  if (!isP256PublicKey(pub) || !priv) return false;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}

export interface PushSubscriptionKeys {
  /** Browser's P-256 public key, base64url (65 bytes uncompressed). */
  readonly p256dh: string;
  /** Browser's authentication secret, base64url (16 bytes). */
  readonly auth: string;
}

export interface EncryptOptions {
  /** Test seam: the application server's ephemeral private key (32 bytes). */
  readonly ephemeralPrivateKey?: Uint8Array;
  /** Test seam: the 16-byte salt. */
  readonly salt?: Uint8Array;
  /** Record size advertised in the header (RFC 8188); default 4096. */
  readonly recordSize?: number;
}

/** Push services must accept at least 4096 bytes of body (RFC 8030 §7.2). */
export const WEB_PUSH_MAX_PLAINTEXT = 3993;

/**
 * Encrypt one push message (single record) for one subscription.
 * Returns the complete request body: header || ciphertext || tag.
 */
export function encryptWebPushPayload(
  plaintext: Uint8Array,
  keys: PushSubscriptionKeys,
  options: EncryptOptions = {},
): Buffer {
  const uaPublic = base64UrlToBuffer(keys.p256dh);
  const authSecret = base64UrlToBuffer(keys.auth);
  if (!isP256PublicKey(uaPublic)) throw new Error("invalid_p256dh");
  if (authSecret.length !== 16) throw new Error("invalid_auth");
  if (plaintext.length > WEB_PUSH_MAX_PLAINTEXT) throw new Error("payload_too_large");

  const ecdh = createECDH("prime256v1");
  if (options.ephemeralPrivateKey) ecdh.setPrivateKey(Buffer.from(options.ephemeralPrivateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  // RFC 8291 §3.3: combine the ECDH secret with the auth secret.
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // RFC 8188 §2.2: content-encryption key and nonce.
  const salt = options.salt ? Buffer.from(options.salt) : randomBytes(16);
  if (salt.length !== 16) throw new Error("invalid_salt");
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12);

  // Single, last record: plaintext || 0x02 (no padding).
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(options.recordSize ?? 4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/**
 * The inverse, for tests only (a browser does this in production): decrypt
 * a single-record aes128gcm body with the subscriber's private key.
 */
export function decryptWebPushPayloadForTest(
  message: Uint8Array,
  uaPrivateKey: Uint8Array,
  authSecret: Uint8Array,
): Buffer {
  const buf = Buffer.from(message);
  const salt = buf.subarray(0, 16);
  const idLen = buf.readUInt8(20);
  const asPublic = buf.subarray(21, 21 + idLen);
  const payload = buf.subarray(21 + idLen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(uaPrivateKey));
  const uaPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(payload.subarray(payload.length - 16));
  const plain = Buffer.concat([decipher.update(payload.subarray(0, payload.length - 16)), decipher.final()]);
  // Strip the record delimiter (0x02) and any zero padding before it.
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error("bad_delimiter");
  return plain.subarray(0, end);
}

/** Build the ES256 signing key from the raw VAPID key pair (base64url). */
export function vapidSigningKey(publicKey: string, privateKey: string): KeyObject {
  const pub = base64UrlToBuffer(publicKey);
  const priv = vapidPrivateKeyBytes(privateKey);
  if (!isP256PublicKey(pub) || !priv) throw new Error("invalid_vapid_keys");
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: bufferToBase64Url(priv),
      x: bufferToBase64Url(pub.subarray(1, 33)),
      y: bufferToBase64Url(pub.subarray(33, 65)),
    },
    format: "jwk",
  });
}

/** VAPID tokens live at most 24 h (RFC 8292 §2); we use 12 h. */
export const VAPID_TOKEN_SECONDS = 12 * 60 * 60;

/**
 * The `Authorization` header value for one push request (RFC 8292 §3):
 * `vapid t=<ES256 JWT>, k=<public key>`. `aud` is the push service origin,
 * so a token for one service is useless at another.
 */
export function vapidAuthorization(input: {
  readonly endpoint: string;
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
  /** Test seam: seconds since the epoch. */
  readonly nowSeconds?: number;
}): string {
  const aud = new URL(input.endpoint).origin;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = bufferToBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bufferToBase64Url(
    Buffer.from(JSON.stringify({ aud, exp: now + VAPID_TOKEN_SECONDS, sub: input.subject })),
  );
  const signingInput = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: vapidSigningKey(input.publicKey, input.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${signingInput}.${bufferToBase64Url(signature)}, k=${input.publicKey}`;
}

/**
 * The push services a browser may hand us — the only hosts the server will
 * ever POST to. A subscription is client-supplied input; without this list
 * the "send a notification" path would be a server-side request to any URL
 * a signed-in person chose (SSRF). Matched on the exact host or a dot-suffix.
 */
export const WEB_PUSH_SERVICE_HOSTS: readonly string[] = [
  "fcm.googleapis.com", // Chrome, Chromium, Android, Opera, Samsung Internet
  "updates.push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari (web.push.apple.com)
  "notify.windows.com", // Edge (wns2-*.notify.windows.com)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return WEB_PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** Shape check of a browser subscription before it is stored or used. */
export function isValidSubscription(input: {
  readonly endpoint: unknown;
  readonly p256dh: unknown;
  readonly auth: unknown;
}): input is { endpoint: string; p256dh: string; auth: string } {
  if (typeof input.endpoint !== "string" || !isAllowedPushEndpoint(input.endpoint)) return false;
  if (typeof input.p256dh !== "string" || !B64URL.test(input.p256dh)) return false;
  if (typeof input.auth !== "string" || !B64URL.test(input.auth)) return false;
  return isP256PublicKey(base64UrlToBuffer(input.p256dh)) && base64UrlToBuffer(input.auth).length === 16;
}
