import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintUploadToken } from "./upload-token";

/**
 * The REAL services/transcribe/server.mjs, booted as a child process (no
 * whisper binary needed: every assertion here is decided BEFORE the engine
 * runs - auth, origin, CORS, replay, limits). Pins the HTTP contract the
 * browser upload depends on, so the app's token and the service verifier can
 * never drift apart silently.
 */
const PORT = 39000 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "contract-test-secret-0123456789abcdef0123456789";
const ORIGIN = "https://app.example.test";
const SERVER = join(__dirname, "..", "..", "..", "..", "services", "transcribe", "server.mjs");

let child: ChildProcess;

async function waitUp(): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("transcribe service did not start");
}

const audio = () => new Uint8Array(4096);
const token = (over: Partial<Parameters<typeof mintUploadToken>[0]> = {}) =>
  mintUploadToken({ secret: SECRET, profileId: "profile-1", maxBytes: 25 * 1024 * 1024, ...over }).token;

async function post(tok: string, origin: string | null) {
  return fetch(`${BASE}/v1/transcribe?language=lt`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tok}`,
      "content-type": "audio/webm",
      ...(origin ? { origin } : {}),
    },
    body: audio(),
  });
}

beforeAll(async () => {
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      TRANSCRIBE_TOKEN: SECRET,
      ALLOWED_ORIGINS: ORIGIN,
      WHISPER_BIN: "definitely-not-installed",
    },
    stdio: "ignore",
  });
  await waitUp();
}, 15_000);

afterAll(() => {
  child?.kill();
});

describe("transcription service HTTP contract (real server, decided before the engine)", () => {
  it("health reveals nothing but ok", async () => {
    const r = await fetch(`${BASE}/healthz`);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("preflight: exact allow-listed origin only, no wildcard, no credentials", async () => {
    const ok = await fetch(`${BASE}/v1/transcribe`, { method: "OPTIONS", headers: { origin: ORIGIN } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(ok.headers.get("access-control-allow-credentials")).toBeNull();
    expect(ok.headers.get("access-control-allow-headers")).toMatch(/authorization/);
    const bad = await fetch(`${BASE}/v1/transcribe`, { method: "OPTIONS", headers: { origin: "https://evil.example.test" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("no credential -> 401", async () => {
    const r = await fetch(`${BASE}/v1/transcribe`, { method: "POST", headers: { "content-type": "audio/webm", origin: ORIGIN }, body: audio() });
    expect(r.status).toBe(401);
  });

  it("an upload token from a non-allow-listed (or absent) origin is refused 403", async () => {
    const r1 = await post(token(), "https://evil.example.test");
    expect(r1.status).toBe(403);
    expect((await r1.json()).code).toBe("origin_not_allowed");
    const r2 = await post(token(), null);
    expect(r2.status).toBe(403);
  });

  it("a forged / tampered / expired token is refused 401", async () => {
    const good = token();
    const forged = good.slice(0, -2) + (good.endsWith("AA") ? "BB" : "AA");
    expect((await post(forged, ORIGIN)).status).toBe(401);
    const expired = token({ nowMs: Date.now() - 10 * 60_000, ttlSeconds: 60 });
    const r = await post(expired, ORIGIN);
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe("token_expired");
  });

  it("a valid token passes auth ONCE; replay is refused as token_used", async () => {
    const t = token();
    const first = await post(t, ORIGIN);
    // auth passed: whatever happens next is the (absent) engine, never 401/403
    expect([401, 403]).not.toContain(first.status);
    expect(first.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const again = await post(t, ORIGIN);
    expect(again.status).toBe(401);
    expect((await again.json()).code).toBe("token_used");
  });

  it("the token's byte cap can only LOWER the service cap", async () => {
    const t = token({ maxBytes: 1024 });
    const r = await post(t, ORIGIN);
    expect(r.status).toBe(413);
    expect((await r.json()).code).toBe("too_large");
  });

  it("an unsupported audio type is refused 415 before any engine work", async () => {
    const r = await fetch(`${BASE}/v1/transcribe?language=lt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token()}`, "content-type": "text/plain", origin: ORIGIN },
      body: "x",
    });
    expect(r.status).toBe(415);
  });
});
