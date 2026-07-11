// LabourMarket.ai self-hosted transcription service — thin authenticated
// HTTP wrapper around whisper.cpp. Zero npm dependencies (node:http only).
//
// Endpoints:
//   GET  /healthz         → 200 {"ok":true}            (unauthenticated, reveals nothing)
//   POST /v1/transcribe   → 200 {"transcript",...}     (Bearer-token, bounded, idempotent)
//
// Security invariants:
//   - constant-time bearer comparison; 401 on any mismatch
//   - hard body cap (default 25 MB) enforced while streaming
//   - duration cap (default 600 s) enforced via ffprobe BEFORE transcription
//   - closed MIME set; everything is transcoded to 16 kHz mono WAV first
//   - transcript / audio content is NEVER logged (only sizes, codes, ms)
//   - tmp files always deleted; idempotency cache holds transcripts only,
//     keyed by (idempotency-key, body sha256), best-effort, bounded
//   - in-memory per-token rate limit (default 10 req / 60 s)

import { createServer } from "node:http";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8085);
const TOKEN = process.env.TRANSCRIBE_TOKEN || "";
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || "/models/ggml-model.bin";
const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 25 * 1024 * 1024);
const MAX_DURATION_S = Number(process.env.MAX_DURATION_SECONDS || 600);
const WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS || 300_000);
const THREADS = Number(process.env.WHISPER_THREADS || 4);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 10);
const CACHE_DIR = process.env.IDEMPOTENCY_CACHE_DIR || join(tmpdir(), "transcribe-cache");
const CACHE_MAX_ENTRIES = 500;

const ALLOWED_MIME = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav",
]);
// Languages the product offers; "auto" lets whisper detect within the model's support.
const ALLOWED_LANG = new Set(["auto", "lt", "en", "ru", "nl", "de", "pl", "lv", "et", "da", "no", "sv", "fi"]);

if (!TOKEN || TOKEN.length < 32) {
  console.error("[transcribe] FATAL: TRANSCRIBE_TOKEN missing or shorter than 32 chars");
  process.exit(1);
}

const rateBuckets = new Map(); // tokenHash -> number[] (epoch ms of recent requests)

function authorized(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return false;
  const given = Buffer.from(h.slice(7));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

function rateLimited() {
  const now = Date.now();
  const hits = (rateBuckets.get("t") || []).filter((t) => now - t < 60_000);
  if (hits.length >= RATE_LIMIT) { rateBuckets.set("t", hits); return true; }
  hits.push(now);
  rateBuckets.set("t", hits);
  return false;
}

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
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

async function cachePrune() {
  try {
    const entries = await readdir(CACHE_DIR);
    if (entries.length <= CACHE_MAX_ENTRIES) return;
    const stats = await Promise.all(entries.map(async (e) => ({ e, m: (await stat(join(CACHE_DIR, e))).mtimeMs })));
    stats.sort((a, b) => a.m - b.m);
    for (const { e } of stats.slice(0, entries.length - CACHE_MAX_ENTRIES)) {
      await rm(join(CACHE_DIR, e), { force: true });
    }
  } catch { /* best-effort */ }
}

async function handleTranscribe(req, res) {
  if (!authorized(req)) return json(res, 401, { error: "unauthorized", code: "unauthorized" });
  if (rateLimited()) return json(res, 429, { error: "rate limited", code: "rate_limited" });

  const mime = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return json(res, 415, { error: "unsupported media type", code: "bad_mime" });

  const url = new URL(req.url, "http://localhost");
  const lang = (url.searchParams.get("language") || "auto").toLowerCase();
  if (!ALLOWED_LANG.has(lang)) return json(res, 400, { error: "unsupported language", code: "bad_language" });

  const idem = String(req.headers["x-idempotency-key"] || "").slice(0, 128);

  let body;
  try {
    body = await readBody(req, MAX_BODY_BYTES);
  } catch (e) {
    return json(res, 413, { error: "body too large", code: "too_large" });
  }
  if (body.length < 128) return json(res, 400, { error: "empty audio", code: "empty" });

  const bodySha = createHash("sha256").update(body).digest("hex");
  const cacheKey = idem ? createHash("sha256").update(`${idem}:${bodySha}`).digest("hex") : null;
  if (cacheKey) {
    try {
      const cached = await readFile(join(CACHE_DIR, cacheKey), "utf8");
      return json(res, 200, { ...JSON.parse(cached), cached: true });
    } catch { /* miss */ }
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
      return json(res, 400, { error: "audio could not be decoded", code: "undecodable" });
    }
    const duration = await probeDurationSeconds(wav).catch(() => null);
    if (duration == null) return json(res, 400, { error: "audio could not be read", code: "unreadable" });
    if (duration > MAX_DURATION_S) return json(res, 413, { error: "audio too long", code: "too_long" });

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
      return json(res, 502, { error: "transcription failed", code: "engine_failed" });
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
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(join(CACHE_DIR, cacheKey), JSON.stringify(result)).catch(() => {});
      cachePrune();
    }
    console.log(`[transcribe] ok bytes=${body.length} durS=${result.durationSeconds} ms=${result.processingMs}`);
    return json(res, 200, result);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true });
    if (req.method === "POST" && req.url.startsWith("/v1/transcribe")) return await handleTranscribe(req, res);
    return json(res, 404, { error: "not found", code: "not_found" });
  } catch (e) {
    console.error(`[transcribe] unhandled ${e?.message || e}`);
    if (!res.headersSent) json(res, 500, { error: "internal error", code: "internal" });
  }
});

server.requestTimeout = WHISPER_TIMEOUT_MS + 120_000;
server.headersTimeout = 30_000;
server.listen(PORT, () => console.log(`[transcribe] listening on :${PORT}`));
