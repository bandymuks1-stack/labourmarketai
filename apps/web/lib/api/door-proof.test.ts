import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B1b door proof. Pins three things:
 *   1. the proof string is byte-identical to what the database gate computes
 *      (the vector below is the one scripts/db-proof/oauth-door-gate.sh feeds
 *      to `door_gate.oauth_gate()` and accepts there);
 *   2. the proof goes ONLY to the Data API of our project, never to Auth,
 *      Storage, Functions or another origin;
 *   3. in the resolver, ONLY a verified third-party OAuth identity gets the
 *      proof — a first-party bearer client is built with exactly the options
 *      it had before, and a rejected token never gets a proof.
 *
 * Only the auth-server seams are stubbed (as in oauth-client-door-only.test.ts).
 */

const seams = vi.hoisted(() => ({
  bearerAuthResult: { data: { user: { id: "user-1" } as unknown }, error: null as unknown },
  lastOptions: undefined as undefined | { global?: { headers?: Record<string, string>; fetch?: unknown } },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url: string, _key: string, options: typeof seams.lastOptions) => {
    seams.lastOptions = options;
    return { auth: { getUser: async () => seams.bearerAuthResult } };
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } })),
}));
vi.mock("@/lib/env", () => ({
  requireSupabaseClientEnv: () => ({ url: "https://stub.supabase.invalid", anonKey: "stub-anon-key" }),
}));

import { resolveApiIdentity } from "./api-identity";
import {
  DOOR_PROOF_HEADER,
  doorKeyFrom,
  doorProofFor,
  doorProofMessage,
  resetServerDoorKeyForTests,
  withDoorProof,
} from "./door-proof";

// ── Shared vector (also in scripts/db-proof/oauth-door-gate.sh) ─────────────
const TEST_KEY_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const CLAIMS = {
  sub: "11111111-2222-4333-8444-555555555555",
  role: "authenticated",
  aud: "authenticated",
  session_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  client_id: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
  iat: 1735815600,
  exp: 1735819200,
};
const EXPECTED_MESSAGE =
  "lm-door/v1|9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d|11111111-2222-4333-8444-555555555555|aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee|1735815600|1735819200";
const EXPECTED_PROOF = "v1.k1.751b74fc5462511e16655b582730336feea30903556869573bb81d95192e7cd6";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: unknown) => `${b64({ alg: "HS256" })}.${b64(claims)}.c2lnbmF0dXJl`;
const KEY = doorKeyFrom("k1", TEST_KEY_HEX)!;

describe("the proof string", () => {
  it("matches the vector the SQL gate accepts", () => {
    expect(doorProofMessage(CLAIMS)).toBe(EXPECTED_MESSAGE);
    expect(doorProofFor(jwt(CLAIMS), KEY)).toBe(EXPECTED_PROOF);
  });

  it("changes with every bound claim (no proof is reusable for another token)", () => {
    const others = [
      { ...CLAIMS, client_id: "other-client" },
      { ...CLAIMS, sub: "22222222-2222-4333-8444-555555555555" },
      { ...CLAIMS, session_id: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      { ...CLAIMS, iat: CLAIMS.iat + 3600, exp: CLAIMS.exp + 3600 }, // a refreshed token
    ];
    for (const c of others) expect(doorProofFor(jwt(c), KEY)).not.toBe(EXPECTED_PROOF);
  });

  it.each([
    ["no client_id", { ...CLAIMS, client_id: undefined }],
    ["client_id with a pipe", { ...CLAIMS, client_id: "a|b" }],
    ["no session_id", { ...CLAIMS, session_id: undefined }],
    ["non-uuid sub", { ...CLAIMS, sub: "x" }],
    ["fractional iat", { ...CLAIMS, iat: 1.5 }],
    ["string exp", { ...CLAIMS, exp: "1735819200" }],
  ])("claims with %s cannot form a proof", (_label, claims) => {
    expect(doorProofMessage(claims)).toBeNull();
    expect(doorProofFor(jwt(claims), KEY)).toBeNull();
  });

  it("an unusable key is no key", () => {
    expect(doorKeyFrom(undefined, TEST_KEY_HEX)).toBeNull();
    expect(doorKeyFrom("k1", undefined)).toBeNull();
    expect(doorKeyFrom("K1", TEST_KEY_HEX)).toBeNull();
    expect(doorKeyFrom("k1", "abcd")).toBeNull();
    expect(doorKeyFrom(" k1 ", ` ${TEST_KEY_HEX.toUpperCase()} `)?.keyId).toBe("k1");
  });
});

describe("withDoorProof sends the proof to the Data API only", () => {
  const seen: { url: string; headers: Headers }[] = [];
  const base = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input instanceof Request ? input.url : input), headers: new Headers(init?.headers) });
    return new Response("{}");
  };
  const wrapped = withDoorProof(base, "https://stub.supabase.invalid", () => EXPECTED_PROOF);

  beforeEach(() => {
    seen.length = 0;
  });

  it("adds it to /rest/v1 tables and rpc, keeping the other headers", async () => {
    await wrapped("https://stub.supabase.invalid/rest/v1/workers?select=id", {
      headers: new Headers({ apikey: "k", Authorization: "Bearer t" }),
    });
    await wrapped(new URL("https://stub.supabase.invalid/rest/v1/rpc/some_fn"), { method: "POST" });
    expect(seen.map((s) => s.headers.get(DOOR_PROOF_HEADER))).toEqual([EXPECTED_PROOF, EXPECTED_PROOF]);
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer t");
    expect(seen[0]!.headers.get("apikey")).toBe("k");
  });

  it.each([
    "https://stub.supabase.invalid/auth/v1/user",
    "https://stub.supabase.invalid/storage/v1/object/sign/bucket/x",
    "https://stub.supabase.invalid/functions/v1/f",
    "https://stub.supabase.invalid/rest/v1", // not a resource path
    "https://elsewhere.invalid/rest/v1/workers",
  ])("never adds it to %s", async (url) => {
    await wrapped(url, { headers: { Authorization: "Bearer t" } });
    expect(seen[0]!.headers.get(DOOR_PROOF_HEADER)).toBeNull();
  });

  it("adds nothing while the proof is unset", async () => {
    await withDoorProof(base, "https://stub.supabase.invalid", () => null)(
      "https://stub.supabase.invalid/rest/v1/workers",
    );
    expect(seen[0]!.headers.get(DOOR_PROOF_HEADER)).toBeNull();
  });
});

describe("the resolver wires the proof only for a verified third-party identity", () => {
  let seq = 0;
  const bearer = (token: string) => {
    seq += 1;
    return new Request("https://app.invalid/api/mcp", {
      headers: { authorization: `Bearer ${token}`, "x-forwarded-for": `door-proof-${seq}` },
    });
  };
  const OAUTH = jwt(CLAIMS);
  const FIRST_PARTY = jwt({ ...CLAIMS, client_id: undefined });

  async function proofSentToRest(): Promise<string | null> {
    const fetchOpt = seams.lastOptions?.global?.fetch as
      | ((input: string, init?: RequestInit) => Promise<Response>)
      | undefined;
    if (!fetchOpt) return "NO-FETCH-OPTION";
    const original = globalThis.fetch;
    let sent: string | null = null;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      sent = new Headers(init?.headers).get(DOOR_PROOF_HEADER);
      return new Response("[]");
    }) as typeof fetch;
    try {
      await fetchOpt("https://stub.supabase.invalid/rest/v1/workers");
    } finally {
      globalThis.fetch = original;
    }
    return sent;
  }

  beforeEach(() => {
    seams.bearerAuthResult = { data: { user: { id: "user-1" } }, error: null };
    seams.lastOptions = undefined;
    process.env.LM_DOOR_KEY_ID = "k1";
    process.env.LM_DOOR_SECRET = TEST_KEY_HEX;
    resetServerDoorKeyForTests();
  });

  it("a verified OAuth token: Data API calls carry the proof", async () => {
    const r = await resolveApiIdentity(bearer(OAUTH));
    expect(r.ok && r.identity.oauthClientId).toBe(CLAIMS.client_id);
    expect(await proofSentToRest()).toBe(EXPECTED_PROOF);
  });

  it("a first-party bearer: the client options are exactly the pre-B1b ones", async () => {
    const r = await resolveApiIdentity(bearer(FIRST_PARTY));
    expect(r.ok).toBe(true);
    expect(seams.lastOptions?.global).toEqual({ headers: { Authorization: `Bearer ${FIRST_PARTY}` } });
  });

  it("a token the auth server rejects never gets a proof", async () => {
    seams.bearerAuthResult = { data: { user: null }, error: { status: 401, name: "AuthApiError" } };
    const r = await resolveApiIdentity(bearer(OAUTH));
    expect(r).toEqual({ ok: false, reason: "invalid-bearer" });
    expect(await proofSentToRest()).toBeNull();
  });

  it("no key configured: no proof machinery at all", async () => {
    delete process.env.LM_DOOR_KEY_ID;
    delete process.env.LM_DOOR_SECRET;
    resetServerDoorKeyForTests();
    const r = await resolveApiIdentity(bearer(OAUTH));
    expect(r.ok).toBe(true);
    expect(seams.lastOptions?.global).toEqual({ headers: { Authorization: `Bearer ${OAUTH}` } });
  });

  it("a cookie session never builds a bearer client", async () => {
    seams.lastOptions = undefined;
    const r = await resolveApiIdentity(new Request("https://app.invalid/api/mcp"));
    expect(r).toEqual({ ok: false, reason: "no-credentials" });
    expect(seams.lastOptions).toBeUndefined();
  });
});
