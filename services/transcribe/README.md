# LabourMarket.ai Transcription Service (self-hosted whisper.cpp)

Owner-controlled speech-to-text for the Voice Work Journal. Audio never
leaves LabourMarket.ai-controlled infrastructure — this service is the ONLY
processing destination, there is no third-party STT provider.

## What it is

- whisper.cpp (`whisper-cli`) + ffmpeg + a zero-dependency Node wrapper
  ([server.mjs](server.mjs)) in one Docker image.
- Bearer-token server-to-server API (the browser NEVER talks to it and never
  holds the token — the web app proxies).
- Bounded: 25 MB body cap (streamed), 10 min duration cap (ffprobe-verified),
  closed MIME set, per-token rate limit, request timeout, idempotency cache.
- Honest: no transcript or audio content is ever logged; tmp files are always
  deleted; unavailable = the web app shows its honest "not configured" state.

## API contract

### `GET /healthz`
Unauthenticated liveness. `200 {"ok":true}` — reveals nothing else.

### `POST /v1/transcribe?language=<auto|lt|en|ru|nl|de|pl|lv|et|da|no|sv|fi>`
- Headers: `Authorization: Bearer <TRANSCRIBE_TOKEN>`,
  `Content-Type: audio/webm|audio/ogg|audio/mp4|audio/mpeg|audio/wav`,
  optional `X-Idempotency-Key: <=128 chars` (same key + same bytes → cached
  result, `"cached":true`).
- Body: raw audio bytes (max 25 MB).
- `200`: `{"transcript": "...", "language": "lt", "durationSeconds": 42.5,
  "model": "ggml-model.bin", "processingMs": 8100}`
- Errors: `401 unauthorized · 415 bad_mime · 400 bad_language/undecodable/
  unreadable/empty · 413 too_large/too_long · 429 rate_limited ·
  502 engine_failed · 500 internal` — always `{"error","code"}`.

Language support is model-dependent: `small` handles EN/DE/NL/RU well and LT
acceptably; use `medium` or `large-v3-turbo` for better LT quality.

## Deploy (owner action — any Docker host)

```bash
cd services/transcribe
cp .env.example .env            # set TRANSCRIBE_TOKEN (openssl rand -hex 32)
docker compose up -d --build    # first build downloads the model (~466 MB for small)
curl -s http://127.0.0.1:8085/healthz   # → {"ok":true}
# smoke (any short audio file):
curl -s -X POST "http://127.0.0.1:8085/v1/transcribe?language=lt" \
  -H "Authorization: Bearer $TRANSCRIBE_TOKEN" \
  -H "Content-Type: audio/wav" --data-binary @sample.wav
```

Expose ONLY via a TLS reverse proxy (e.g. Caddy `transcribe.labourmarket.ai {
reverse_proxy 127.0.0.1:8085 }`). Never open :8085 to the internet raw.

### Web app wiring (after deploy)

Set in the web app environment (Vercel):
- `VOICE_TRANSCRIBE_URL=https://transcribe.<host>` (server-only, no NEXT_PUBLIC)
- `VOICE_TRANSCRIBE_TOKEN=<same secret>` (server-only)

Until both are set the journal voice UI shows its honest
"transcription server not configured" state — nothing is faked.

## Resource requirements

| Model | Disk (model) | RAM working set | ~speed on 4 vCPU |
|---|---|---|---|
| small | 466 MB | ~1.2 GB | ~0.5× realtime |
| medium | 1.5 GB | ~2.8 GB | ~1.5× realtime |
| large-v3-turbo | 1.6 GB | ~3.5 GB | ~1× realtime |

Minimum host: 2 vCPU / 4 GB RAM / 5 GB disk (small). Recommended for LT
quality: 4 vCPU / 8 GB RAM (medium).

## Rollback

```bash
docker compose down            # stops the service; web app degrades honestly
# previous image: docker compose up -d (compose keeps the last built image
# unless --build is passed; tag releases if you need multi-version rollback)
```

Removing the two `VOICE_TRANSCRIBE_*` env vars from the web app fully
disables the feature path (honest unavailable state) without touching this
host.

## Boundaries

- No storage: audio exists only in tmpfs for the life of one request.
- No outbound calls: the service talks to nobody.
- No third-party APIs, no telemetry.
- The idempotency cache stores transcripts (not audio) in tmpfs, pruned at
  500 entries, lost on restart — by design.
