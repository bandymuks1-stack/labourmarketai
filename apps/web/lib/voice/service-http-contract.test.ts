import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
// The service gets its OWN temp dir, so the no-persistence check lists a small, private directory
// (a shared OS temp dir can hold thousands of unrelated entries and is slow to list under load).
const SERVICE_TMP = join(tmpdir(), `lmai-contract-tmp-${PORT}`);
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
let subjectSeq = 0;
const token = (over: Partial<Parameters<typeof mintUploadToken>[0]> = {}) =>
  mintUploadToken({
    secret: SECRET,
    profileId: `profile-${(subjectSeq += 1)}`,
    maxBytes: 25 * 1024 * 1024,
    ...over,
  }).token;
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const SERVICE_CAP = 25 * 1024 * 1024;

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
  mkdirSync(SERVICE_TMP, { recursive: true });
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      TRANSCRIBE_TOKEN: SECRET,
      ALLOWED_ORIGINS: ORIGIN,
      WHISPER_BIN: "definitely-not-installed",
      RATE_LIMIT_PER_MINUTE: "5",
      TMPDIR: SERVICE_TMP,
      TMP: SERVICE_TMP,
      TEMP: SERVICE_TMP,
      IDEMPOTENCY_CACHE_DIR: join(tmpdir(), `lmai-contract-cache-${PORT}`),
    },
    stdio: "ignore",
  });
  await waitUp();
}, 15_000);

afterAll(() => {
  child?.kill();
  rmSync(SERVICE_TMP, { recursive: true, force: true });
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

  it("rate limit: the sixth request in a minute for ONE subject is 429, another subject is unaffected", async () => {
    const one = mintUploadToken({ secret: SECRET, profileId: "limited-subject", maxBytes: SERVICE_CAP });
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const t = mintUploadToken({ secret: SECRET, profileId: "limited-subject", maxBytes: SERVICE_CAP }).token;
      codes.push((await post(t, ORIGIN)).status);
    }
    expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
    expect(codes.slice(5)).toEqual([429, 429]);
    expect(one.token).toBeTruthy();
    expect((await post(token(), ORIGIN)).status).not.toBe(429);
  });

  it("25 MB boundary: cap+1 bytes is 413 too_large with a readable body; exactly the cap passes the size gate", async () => {
    const over = await fetch(`${BASE}/v1/transcribe?language=lt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token()}`, "content-type": "audio/webm", origin: ORIGIN },
      body: new Uint8Array(SERVICE_CAP + 1),
    });
    expect(over.status).toBe(413);
    expect((await over.json()).code).toBe("too_large");
    const exact = await fetch(`${BASE}/v1/transcribe?language=lt`, {
      method: "POST",
      headers: { authorization: `Bearer ${token()}`, "content-type": "audio/webm", origin: ORIGIN },
      body: new Uint8Array(SERVICE_CAP),
    });
    // past the size gate: the (absent / zero-byte) media is refused as undecodable, never 413
    expect(exact.status).not.toBe(413);
    expect(["undecodable", "unreadable", "engine_failed"]).toContain((await exact.json()).code);
  }, 60_000);

  it("transcription failure is an honest 5xx/4xx code, never a 200 with empty text", async () => {
    const r = await post(token(), ORIGIN);
    const body = await r.json();
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(typeof body.code).toBe("string");
  });

  it("no raw-audio persistence: no work directory is left in the temp dir after requests", async () => {
    await post(token(), ORIGIN);
    await post(token(), ORIGIN);
    // The reply is sent from inside the handler's try block and the work dir is removed in its
    // `finally`, so the client can legitimately see the response a few ms BEFORE the removal
    // completes. Persistence would mean it never goes away: poll for up to 5 s.
    let leftovers: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      leftovers = readdirSync(SERVICE_TMP).filter((n) => n.startsWith("tr-"));
      if (leftovers.length === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(leftovers).toEqual([]);
  });

  it.skipIf(!hasFfmpeg)("10-minute boundary: 601 s of audio is 413 too_long, 600 s passes to the engine", async () => {
    const wav = (seconds: number) => {
      const rate = 8000;
      const n = seconds * rate;
      const buf = Buffer.alloc(44 + n * 2);
      buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
      buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
      buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36);
      buf.writeUInt32LE(n * 2, 40);
      return buf;
    };
    const send = (sec: number) =>
      fetch(`${BASE}/v1/transcribe?language=lt`, {
        method: "POST",
        headers: { authorization: `Bearer ${token()}`, "content-type": "audio/wav", origin: ORIGIN },
        body: wav(sec),
      });
    const long = await send(601);
    expect(long.status).toBe(413);
    expect((await long.json()).code).toBe("too_long");
    const ok = await send(600);
    expect((await ok.json()).code).toBe("engine_failed"); // whisper is deliberately absent
  }, 120_000);
});
