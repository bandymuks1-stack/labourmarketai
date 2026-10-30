#!/usr/bin/env node
// Technical proof against a LIVE host. Never prints the token or a transcript.
//   TRANSCRIBE_URL=https://host TRANSCRIBE_TOKEN=... [PROOF_ORIGIN=https://labourmarket.ai] \
//   [AUDIO_FILE=speech.wav] node verify-live.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { signUploadToken } from "../upload-auth.mjs";

const base = (process.env.TRANSCRIBE_URL ?? "").replace(/\/$/, "");
const secret = process.env.TRANSCRIBE_TOKEN ?? "";
const origin = process.env.PROOF_ORIGIN ?? "https://labourmarket.ai";
if (!(base.startsWith("https://") || base.startsWith("http://127.0.0.1")) || secret.length < 32) {
  console.error("set TRANSCRIBE_URL (https) and TRANSCRIBE_TOKEN (32+ chars)");
  process.exit(2);
}
const mint = () =>
  signUploadToken(secret, {
    v: 1, scope: "transcribe", sub: "verify-live", jti: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 120, max: 25 * 1024 * 1024,
  });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const post = (headers, body = new Uint8Array(2048)) =>
  fetch(`${base}/v1/transcribe?language=en`, { method: "POST", headers: { "content-type": "audio/wav", ...headers }, body });

let r = await fetch(`${base}/healthz`);
check("healthz 200 over TLS", r.status === 200);
r = await post({});
check("no auth refused (401)", r.status === 401, `got ${r.status}`);
r = await post({ authorization: "Bearer wrong" });
check("wrong bearer refused (401)", r.status === 401, `got ${r.status}`);
r = await post({ authorization: `Bearer ${mint()}`, origin: "https://evil.example" });
check("signed token from other origin refused (403)", r.status === 403, `got ${r.status}`);
r = await fetch(`${base}/v1/transcribe`, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
check("preflight from other origin has no ACAO", !r.headers.get("access-control-allow-origin"));
r = await fetch(`${base}/v1/transcribe`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } });
check("preflight from app origin allowed", r.headers.get("access-control-allow-origin") === origin);
const tok = mint();
r = await post({ authorization: `Bearer ${tok}`, origin });
check("allowed origin passes auth (not 401/403)", r.status !== 401 && r.status !== 403, `got ${r.status}`);
r = await post({ authorization: `Bearer ${tok}`, origin });
check("replayed single-use token refused (401)", r.status === 401, `got ${r.status}`);

if (process.env.AUDIO_FILE) {
  const audio = readFileSync(process.env.AUDIO_FILE);
  const t0 = Date.now();
  r = await post({ authorization: `Bearer ${mint()}`, origin }, audio);
  const j = await r.json().catch(() => ({}));
  const wall = (Date.now() - t0) / 1000;
  check("real audio transcribed", r.status === 200 && typeof j.transcript === "string" && j.transcript.trim().length > 0,
    `status=${r.status} chars=${(j.transcript ?? "").length} audio=${j.durationSeconds}s wall=${wall.toFixed(1)}s realtimeFactor=${j.durationSeconds ? (wall / j.durationSeconds).toFixed(2) : "n/a"}`);
}
process.exitCode = results.every(Boolean) ? 0 : 1;
