import "server-only";
import { createHmac } from "node:crypto";

/**
 * DOOR PROOF (B1b) — how the connector door proves to the database that an
 * OAuth-client token arrived THROUGH OUR SERVER.
 *
 * ## Why
 *
 * The MCP door does not exchange tokens: it hands the caller's own Supabase
 * JWT to PostgREST (`api-identity.ts`, `bearer-caller-scope.ts`). So anything
 * keyed on the token alone (RLS on `client_id`, a token hook changing `role`)
 * would break the door exactly as much as it stops a third-party client that
 * calls `/rest/v1` directly with the same token. The difference between the
 * two is WHO sends the request — and only our server knows `LM_DOOR_SECRET`.
 *
 * ## What
 *
 *   x-lm-door: v1.<kid>.<hex HMAC-SHA256(secret, message)>
 *   message  = "lm-door/v1|" + client_id + "|" + sub + "|" + session_id
 *              + "|" + iat + "|" + exp
 *
 * Bound to ONE access token: a proof that leaked (a log line, a proxy) works
 * only together with that very token and only until it expires; a refreshed
 * token (new iat/exp) needs a new proof. The database recomputes the same
 * message from PostgREST's verified `request.jwt.claims`
 * (`door_gate.oauth_gate()`, migration 20261026090000) — byte-for-byte the
 * same string, which `door-proof.test.ts` pins with a vector shared with the
 * SQL proof.
 *
 * ## Where it is sent
 *
 * ONLY to the Data API (`<project>/rest/v1/...`), ONLY on the supabase-js
 * client of a verified third-party OAuth identity. Never to Auth, Storage or
 * Functions; never on a cookie or first-party client (those are built exactly
 * as before). The value never reaches the caller: it travels server → Supabase.
 *
 * ## Failure behaviour
 *
 * No key configured, or claims that cannot form a message → no header. With
 * the database gate in `log` that is a logged line; in `enforce` the door's
 * own Data API calls for that token are refused (fail closed). That is why
 * `log` must show `proof_ok` for real connector traffic before `enforce`.
 */

export const DOOR_PROOF_HEADER = "x-lm-door";

const KID_RX = /^[a-z0-9]{1,16}$/;
/** Exactly 32 bytes, as `door_gate_private.generate_key` emits. */
const SECRET_HEX_RX = /^[0-9a-f]{64}$/;
/** Same rule as `tokenClientOf` and the SQL gate. Excludes `|`. */
const CLIENT_ID_RX = /^[A-Za-z0-9._:-]{1,200}$/;
/** Supabase `sub` / `session_id` are UUIDs; the SQL gate uses the same rule. */
const UUIDISH_RX = /^[0-9A-Fa-f-]{36}$/;

export type DoorKey = { readonly keyId: string; readonly secret: Buffer };

/** Parse the key from its two env values; anything unusable → null (no proof). */
export function doorKeyFrom(keyId: string | undefined, secretHex: string | undefined): DoorKey | null {
  const id = keyId?.trim();
  const hex = secretHex?.trim().toLowerCase();
  if (!id || !hex || !KID_RX.test(id) || !SECRET_HEX_RX.test(hex)) return null;
  return { keyId: id, secret: Buffer.from(hex, "hex") };
}

let cachedKey: DoorKey | null | undefined;

/** The server's door key (`LM_DOOR_KEY_ID` + `LM_DOOR_SECRET`; validated at
 *  boot by `lib/env.ts`). Read once per process. */
export function serverDoorKey(): DoorKey | null {
  if (cachedKey === undefined) {
    cachedKey = doorKeyFrom(process.env.LM_DOOR_KEY_ID, process.env.LM_DOOR_SECRET);
  }
  return cachedKey;
}

/** Tests only. */
export function resetServerDoorKeyForTests(): void {
  cachedKey = undefined;
}

function isEpochSeconds(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 999_999_999_999;
}

/** The exact string both sides MAC, or null when the claims cannot form one. */
export function doorProofMessage(claims: unknown): string | null {
  if (claims === null || typeof claims !== "object" || Array.isArray(claims)) return null;
  const c = claims as Record<string, unknown>;
  const { client_id: clientId, sub, session_id: sessionId, iat, exp } = c;
  if (typeof clientId !== "string" || !CLIENT_ID_RX.test(clientId)) return null;
  if (typeof sub !== "string" || !UUIDISH_RX.test(sub)) return null;
  if (typeof sessionId !== "string" || !UUIDISH_RX.test(sessionId)) return null;
  if (!isEpochSeconds(iat) || !isEpochSeconds(exp)) return null;
  return `lm-door/v1|${clientId}|${sub}|${sessionId}|${iat}|${exp}`;
}

function claimsOf(token: string): unknown {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * The header value for a token the auth server has ALREADY verified. Call it
 * only after `auth.getUser(token)` succeeded — a proof is a statement that
 * this server accepted the token.
 */
export function doorProofFor(token: string, key: DoorKey): string | null {
  const message = doorProofMessage(claimsOf(token));
  if (message === null) return null;
  const mac = createHmac("sha256", key.secret).update(message, "utf8").digest("hex");
  return `v1.${key.keyId}.${mac}`;
}

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * A `fetch` for supabase-js that adds the proof to Data API requests of the
 * project at `supabaseUrl` — and to nothing else. `proof()` is read per
 * request, so the value can be set after verification; null → no header.
 */
export function withDoorProof(baseFetch: FetchFn, supabaseUrl: string, proof: () => string | null): FetchFn {
  const origin = new URL(supabaseUrl).origin;
  return (input, init) => {
    const value = proof();
    if (value === null) return baseFetch(input, init);
    let target: URL;
    try {
      target = new URL(urlOf(input));
    } catch {
      return baseFetch(input, init);
    }
    if (target.origin !== origin || !target.pathname.startsWith("/rest/v1/")) {
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(DOOR_PROOF_HEADER, value);
    return baseFetch(input, { ...init, headers });
  };
}
