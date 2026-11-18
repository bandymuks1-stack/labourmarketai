/**
 * WEB PUSH CONFIG — one flag and three owner-entered settings.
 *
 *   WEB_PUSH_ENABLED            "true" turns the channel on. ANY other value,
 *                               or no value, is OFF — the default.
 *   WEB_PUSH_VAPID_PUBLIC_KEY   base64url, 65-byte uncompressed P-256 point.
 *   WEB_PUSH_VAPID_PRIVATE_KEY  base64url, 32 bytes (a dropped leading zero is padded back; it must derive the public key). SECRET: entered by the
 *                               owner on the server with hidden input
 *                               (docs/ops/VPS_PRODUCTION_RUNBOOK.md §9.5);
 *                               never generated into, logged by or committed
 *                               to this repository.
 *   WEB_PUSH_VAPID_SUBJECT      "mailto:…" or "https://…" — the contact a push
 *                               service may use about this sender (RFC 8292).
 *
 * `active` needs ALL FOUR, and well-formed. A half-configured channel is OFF
 * and says which part is missing (names only, never a value), so the opt-in
 * stays hidden instead of offering a subscription the server cannot serve.
 *
 * Read at call time (no module-level cache): a value the owner sets on the
 * server takes effect after the restart that `lm-env-set.sh --restart` does,
 * with no rebuild.
 */
import { base64UrlToBuffer, isP256PublicKey, isVapidKeyPair } from "./web-push-protocol";

export type WebPushMissing =
  | "WEB_PUSH_ENABLED"
  | "WEB_PUSH_VAPID_PUBLIC_KEY"
  | "WEB_PUSH_VAPID_PRIVATE_KEY"
  | "WEB_PUSH_VAPID_SUBJECT";

export type WebPushStatus =
  | {
      readonly active: true;
      readonly publicKey: string;
      readonly privateKey: string;
      readonly subject: string;
    }
  | { readonly active: false; readonly missing: readonly WebPushMissing[] };

const B64URL = /^[A-Za-z0-9_-]+$/;

function clean(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export function webPushStatus(env: Record<string, string | undefined> = process.env): WebPushStatus {
  const missing: WebPushMissing[] = [];
  if (clean(env.WEB_PUSH_ENABLED) !== "true") missing.push("WEB_PUSH_ENABLED");
  const publicKey = clean(env.WEB_PUSH_VAPID_PUBLIC_KEY);
  if (!B64URL.test(publicKey) || !isP256PublicKey(base64UrlToBuffer(publicKey))) {
    missing.push("WEB_PUSH_VAPID_PUBLIC_KEY");
  }
  const privateKey = clean(env.WEB_PUSH_VAPID_PRIVATE_KEY);
  if (!B64URL.test(privateKey) || !isVapidKeyPair(publicKey, privateKey)) {
    missing.push("WEB_PUSH_VAPID_PRIVATE_KEY");
  }
  const subject = clean(env.WEB_PUSH_VAPID_SUBJECT);
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) missing.push("WEB_PUSH_VAPID_SUBJECT");
  if (missing.length > 0) return { active: false, missing };
  return { active: true, publicKey, privateKey, subject };
}

/** What a page may know: whether to show the opt-in, and the PUBLIC key the
 *  browser subscribes with. Never the private key or the subject. */
export function webPushClientConfig(
  env: Record<string, string | undefined> = process.env,
): { readonly active: boolean; readonly publicKey: string | null } {
  const s = webPushStatus(env);
  return s.active ? { active: true, publicKey: s.publicKey } : { active: false, publicKey: null };
}
