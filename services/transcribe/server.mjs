// LabourMarket.ai self-hosted transcription service — thin authenticated
// HTTP wrapper around whisper.cpp. Zero npm dependencies (node:http only).
//
// Endpoints:
//   GET     /healthz         → 200 {"ok":true}            (unauthenticated, reveals nothing)
//   OPTIONS /v1/transcribe   → 204 (CORS preflight; exact allow-listed origins only)
//   POST    /v1/transcribe   → 200 {"transcript",...}     (authenticated, bounded)
//
// Two ways to authenticate POST /v1/transcribe:
//   1. MASTER bearer (TRANSCRIBE_TOKEN) — server-to-server / operator use only.
//   2. UPLOAD TOKEN (v1.<payload>.<hmac>) — minted by the LabourMarket.ai web app
//      after it authenticated the worker; SHORT-LIVED, SINGLE-USE, size-bounded,
//      opaque subject. This is what the BROWSER sends: the advertised 25 MB /
//      10 min recording cannot pass through the web platform's ~4.5 MB function
//      body cap, so the browser uploads here directly. See upload-auth.mjs.
//
// Security invariants:
//   - constant-time comparisons; 401 on any mismatch
//   - token auth REQUIRES an exact allow-listed browser Origin (ALLOWED_ORIGINS);
//     there is never a wildcard
//   - hard body cap (default 25 MB, a token can only LOWER it) enforced while streaming
//   - duration cap (default 600 s) enforced via ffprobe BEFORE transcription
//   - closed MIME set; everything is transcoded to 16 kHz mono WAV first
//   - transcript / audio content is NEVER logged (only sizes, codes, ms)
//   - RAW AUDIO IS NEVER PERSISTED: tmp files always deleted in `finally`
//   - the optional idempotency cache holds TRANSCRIPT TEXT ONLY, only when a client
//     sends X-Idempotency-Key (the web app never does), and is TTL-BOUNDED
//     (default 600 s, hard max 3600 s), purged at start-up and every minute
//   - per-subject rate limit for tokens, global limit for the master bearer

import { createServer } from "node:http";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, rm, readdir, stat, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cacheTtlSeconds,
  corsFor,
  createReplayGuard,
  createSubjectLimiter,
  effectiveByteCap,
  parseAllowedOrigins,
  verifyUploadToken,
} from "./upload-auth.mjs";

const PORT = Number(process.env.PORT || 8085);
const TOKEN = process.env.TRANSCRIBE_TOKEN || "";
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || "/models/ggml-model.bin";
const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 25 * 1024 * 1024);
const MAX_DURATION_S = Number(process.env.MAX_DURATION_SECONDS || 600);
const WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS || 300_000);
const THREADS = Number(process.env.WHISPER_THREADS || 4);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 10);
// The idempotency cache holds transcript text, so it must NOT default to the
// shared, world-writable OS temp directory (CodeQL js/insecure-temporary-file).
// Default: a private directory beside the service, created mode 0700. If it is
// not writable the cache simply misses (it is an optimisation, never a dependency).
const CACHE_DIR = process.env.IDEMPOTENCY_CACHE_DIR || join(process.cwd(), ".idempotency-cache");
const CACHE_MAX_ENTRIES = 500;
const CACHE_TTL_S = cacheTtlSeconds(process.env.IDEMPOTENCY_CACHE_TTL_SECONDS);
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

const ALLOWED_MIME = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav",
]);
// Languages the product offers; "auto" lets whisper detect within the model's support.
const ALLOWED_LANG = new Set(["auto", "lt", "en", "ru", "nl", "de", "pl", "lv", "et", "da", "no", "sv", "fi"]);

if (!TOKEN || TOKEN.length < 32) {
  console.error("[transcribe] FATAL: TRANSCRIBE_TOKEN missing or shorter than 32 chars");
  process.exit(1);
}
if (TOKEN.startsWith("v1.")) {
  console.error("[transcribe] FATAL: TRANSCRIBE_TOKEN must not start with the upload-token prefix 'v1.'");
  process.exit(1);
}

const rateBuckets = new Map(); // master: number[] (epoch ms of recent requests)
const subjectLimiter = createSubjectLimiter(RATE_LIMIT);
const replayGuard = createReplayGuard();

/** Authenticate a POST. Returns { ok, kind, claims? } or { ok:false, status, code }. */
function authenticate(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return { ok: false, status: 401, code: "unauthorized" };
  const given = h.slice(7);
  if (given.startsWith("v1.")) {
    const v = verifyUploadToken(TOKEN, given);
    if (!v.ok) {
      return { ok: false, status: 401, code: v.code === "expired" ? "token_expired" : "unauthorized" };
    }
    return { ok: true, kind: "token", claims: v.claims };
  }
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, kind: "master" };
  return { ok: false, status: 401, code: "unauthorized" };
}

function masterRateLimited() {
  const now = Date.now();
  const hits = (rateBuckets.get("t") || []).filter((t) => now - t < 60_000);
  if (hits.length >= RATE_LIMIT) { rateBuckets.set("t", hits); return true; }
  hits.push(now);
  rateBuckets.set("t", hits);
  return false;
}

function json(res, code, body, extra = {}) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s), ...extra });
  res.end(s);
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > cap) { req.destroy(); reject(new Error("too_large")); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr).slice(0, 500) }));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function probeDurationSeconds(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ], 20_000);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error("unreadable_audio");
  return d;
}

/** Remove every cached transcript older than the TTL, then enforce the entry cap. */
async function cachePrune() {
  try {
    const entries = await readdir(CACHE_DIR);
    const now = Date.now();
    const stats = await Promise.all(
      entries.map(async (e) => ({ e, m: (await stat(join(CACHE_DIR, e)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })),
    );
    for (const { e, m } of stats) {
      if (now - m > CACHE_TTL_S * 1000) await rm(join(CACHE_DIR, e), { force: true });
    }
    const live = stats.filter(({ m }) => now - m <= CACHE_TTL_S * 1000);
    if (live.length > CACHE_MAX_ENTRIES) {
      live.sort((a, b) => a.m - b.m);
      for (const { e } of live.slice(0, live.length - CACHE_MAX_ENTRIES)) {
        await rm(join(CACHE_DIR, e), { force: true });
      }
    }
  } catch { /* best-effort */ }
}

async function handleTranscribe(req, res) {
  const cors = corsFor(req.headers.origin, ALLOWED_ORIGINS);
  const reply = (code, body) => json(res, code, body, cors.headers);

  const auth = authenticate(req);
  if (!auth.ok) return reply(auth.status, { error: auth.code, code: auth.code });

  if (auth.kind === "token") {
    // A browser token is only honoured from an exact allow-listed origin.
    if (!cors.present || !cors.allowed) return reply(403, { error: "origin not allowed", code: "origin_not_allowed" });
    if (subjectLimiter.hit(auth.claims.sub)) return reply(429, { error: "rate limited", code: "rate_limited" });
    if (!replayGuard.consume(auth.claims)) return reply(401, { error: "token already used", code: "token_used" });
  } else if (masterRateLimited()) {
    return reply(429, { error: "rate limited", code: "rate_limited" });
  }

  const mime = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return reply(415, { error: "unsupported media type", code: "bad_mime" });

  const url = new URL(req.url, "http://localhost");
  const lang = (url.searchParams.get("language") || "auto").toLowerCase();
  if (!ALLOWED_LANG.has(lang)) return reply(400, { error: "unsupported language", code: "bad_language" });

  const idem = String(req.headers["x-idempotency-key"] || "").slice(0, 128);
  const cap = auth.kind === "token" ? effectiveByteCap(MAX_BODY_BYTES, auth.claims) : MAX_BODY_BYTES;

  // A declared oversize body is refused BEFORE reading it, so the client gets
  // a real 413 (destroying the socket mid-upload reads as "service unreachable").
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > cap) {
    // Answer first, then DRAIN (bounded) what the client is still sending: a
    // server that closes mid-upload makes the browser report a network error
    // instead of this 413. The drain is capped so a lying Content-Length
    // cannot hold the socket.
    let drained = 0;
    req.on("data", (c) => {
      drained += c.length;
      if (drained > cap * 2) req.destroy();
    });
    req.on("error", () => {});
    return reply(413, { error: "body too large", code: "too_large" });
  }

  let body;
  try {
    body = await readBody(req, cap);
  } catch (e) {
    return reply(413, { error: "body too large", code: "too_large" });
  }
  if (body.length < 128) return reply(400, { error: "empty audio", code: "empty" });

  const bodySha = createHash("sha256").update(body).digest("hex");
  const cacheKey = idem ? createHash("sha256").update(`${idem}:${bodySha}`).digest("hex") : null;
  if (cacheKey) {
    // One handle for both the age check and the read: stat-then-read on the
    // path is a check/use race (CodeQL js/file-system-race). fstat on the open
    // handle always describes the bytes we then read.
    let handle = null;
    try {
      const file = join(CACHE_DIR, cacheKey);
      handle = await open(file, "r");
      const age = Date.now() - (await handle.stat()).mtimeMs;
      if (age > CACHE_TTL_S * 1000) {
        await handle.close();
        handle = null;
        await rm(file, { force: true });
      } else {
        const cached = await handle.readFile("utf8");
        await handle.close();
        handle = null;
        return reply(200, { ...JSON.parse(cached), cached: true });
      }
    } catch { /* miss */ } finally {
      if (handle) await handle.close().catch(() => {});
    }
  }

  const started = Date.now();
  const work = join(tmpdir(), `tr-${randomUUID()}`);
  await mkdir(work, { recursive: true });
  const src = join(work, "src");
  const wav = join(work, "audio.wav");
  try {
    await writeFile(src, body);
    try {
      await run("ffmpeg", ["-y", "-i", src, "-ac", "1", "-ar", "16000", "-f", "wav", wav], 60_000);
    } catch {
      return reply(400, { error: "audio could not be decoded", code: "undecodable" });
    }
    const duration = await probeDurationSeconds(wav).catch(() => null);
    if (duration == null) return reply(400, { error: "audio could not be read", code: "unreadable" });
    if (duration > MAX_DURATION_S) return reply(413, { error: "audio too long", code: "too_long" });

    const args = [
      "-m", MODEL_PATH, "-f", wav, "-t", String(THREADS),
      "--output-txt", "--output-file", join(work, "out"),
      "--no-prints",
    ];
    if (lang !== "auto") args.push("-l", lang);
    else args.push("-l", "auto");

    try {
      await run(WHISPER_BIN, args, WHISPER_TIMEOUT_MS);
    } catch (e) {
      console.error(`[transcribe] whisper failed code=${e.code ?? "?"} signal=${e.signal ?? "?"}`);
      return reply(502, { error: "transcription failed", code: "engine_failed" });
    }

    const transcript = (await readFile(join(work, "out.txt"), "utf8").catch(() => "")).trim();
    const result = {
      transcript,
      language: lang,
      durationSeconds: Math.round(duration * 10) / 10,
      model: MODEL_PATH.split("/").pop(),
      processingMs: Date.now() - started,
    };
    if (cacheKey) {
      await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
      await writeFile(join(CACHE_DIR, cacheKey), JSON.stringify(result)).catch(() => {});
      cachePrune();
    }
    console.log(`[transcribe] ok kind=${auth.kind} bytes=${body.length} durS=${result.durationSeconds} ms=${result.processingMs}`);
    return reply(200, result);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function handlePreflight(req, res) {
  const cors = corsFor(req.headers.origin, ALLOWED_ORIGINS);
  if (!cors.present || !cors.allowed) return json(res, 403, { error: "origin not allowed", code: "origin_not_allowed" }, cors.headers);
  res.writeHead(204, cors.headers);
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true });
    if (req.method === "OPTIONS" && req.url.startsWith("/v1/transcribe")) return handlePreflight(req, res);
    if (req.method === "POST" && req.url.startsWith("/v1/transcribe")) return await handleTranscribe(req, res);
    return json(res, 404, { error: "not found", code: "not_found" });
  } catch (e) {
    console.error(`[transcribe] unhandled ${e?.message || e}`);
    if (!res.headersSent) json(res, 500, { error: "internal error", code: "internal" });
  }
});

server.requestTimeout = WHISPER_TIMEOUT_MS + 120_000;
server.headersTimeout = 30_000;
server.listen(PORT, () => {
  console.log(`[transcribe] listening on :${PORT} origins=${ALLOWED_ORIGINS.length} cacheTtlS=${CACHE_TTL_S}`);
  cachePrune();
  setInterval(cachePrune, 60_000).unref();
});
