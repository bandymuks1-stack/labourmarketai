# Voice transcription: production runbook (V1, 2026-10-08)

DEFERRED (owner decision 2026-10-08): production transcription is a later implementation stage. Do not deploy or purchase a service now, and do not treat the missing host as a current product failure. This runbook is kept for that later stage.

Status: the voice journal's contract is built and tested (`docs/VOICE_DOOR_ADAPTER_V1.md`,
`services/transcribe`). What is missing is an always-on HTTPS host. Without
`VOICE_TRANSCRIBE_URL` + `VOICE_TRANSCRIBE_TOKEN` on Vercel Production the voice
surface shows its honest not-configured state (capability COM-6).

## Option analysis (cost for the EXISTING contract)

| Option | Fits the contract? | Cost | Verdict |
|---|---|---|---|
| Vercel Functions / Sandbox | No. No ffmpeg or whisper binary, ephemeral filesystem, model reload per call, 300 s budget; direct browser upload of up to 25 MB is the contract and the host must be one long-lived origin. | usage billed | Rejected |
| Supabase Edge Functions | No. ~2 s CPU, 150 MB memory. | n/a | Rejected |
| In-browser wasm whisper | Changes the contract (no server transcript, no replay/rate/caps). Owner said do not redesign. | $0 | Rejected |
| Hosted STT API | Violates "audio never leaves our infrastructure" and the no-new-paid-AI rule. | per minute | Rejected |
| Free third-party container hosts (HF Spaces, etc.) | Audio leaves our control, sleeps when idle. | $0 | Rejected |
| **Existing paid Hostinger KVM VPS with spare capacity** | Yes. Always-on Linux, Docker, own IP. | **$0 incremental** | **Preferred** |
| Oracle Cloud Always Free (ARM, up to 4 OCPU / 24 GB) | Yes (whisper.cpp builds on arm64). Needs a new account with card verification. | $0 | Fallback |
| Any new paid VPS | Yes. | ~EUR 4-8 per month | Last resort |

Hardware: model `small` needs ~1.2 GB RAM working set and 2 or more vCPU. For
Lithuanian quality use `medium` (about 2.8 GB RAM, slower). Measure the real-time
factor on the chosen host before relying on 10 minutes (see below).

## One-step-list for the owner (existing VPS)

1. DNS: add an `A` record `transcribe.labourmarket.ai` pointing at the VPS IP (Vercel DNS if the zone lives there).
   Free alternative with no DNS change: use `<ip-with-dashes>.sslip.io` as the hostname.
2. On the VM (Docker + compose plugin installed, ports 80/443 free):
   ```sh
   git clone https://github.com/bandymuks1-stack/labourmarketai.git && cd labourmarketai/services/transcribe/deploy
   export TRANSCRIBE_HOSTNAME=transcribe.labourmarket.ai
   sh bootstrap.sh                               # writes .env with a CSPRNG token (not printed)
   docker compose -f docker-compose.prod.yml up -d --build   # first build downloads whisper.cpp + model
   ```
3. Hand the token to the agent through the owner channel only (read it on the VM from `deploy/.env`; never paste it in chat or commit it).
4. Agent sets Vercel Production env `VOICE_TRANSCRIBE_URL=https://<hostname>` and `VOICE_TRANSCRIBE_TOKEN`, redeploys.

## What gets verified afterwards (technical proof, no human mic)

```sh
TRANSCRIBE_URL=https://<hostname> TRANSCRIBE_TOKEN=<token> AUDIO_FILE=speech.wav \
  node services/transcribe/deploy/verify-live.mjs
```
It proves: TLS health, no-auth and wrong-token refused, signed token from another
origin refused (403), CORS preflight only for the app origin, single-use replay
refused, and (with `AUDIO_FILE`) a real transcript plus the measured real-time factor.
Then: production session-token mint, upload of a synthetic speech fixture, transcript
into the chat preview/confirm path (rolled-back DB proof). Physical microphone and
speech remain HUMAN PROOF, only after this passes.

## Realtime factor

Record `wall / durationSeconds` from `verify-live.mjs`. If a 600 s file exceeds
`WHISPER_TIMEOUT_MS` (default 300 000; the browser waits 330 s), raise
`WHISPER_THREADS`, use a smaller model, or lower `VOICE_MAX_SECONDS`. Do not
advertise 10 minutes before this is measured.

## Rollback

Remove the two Vercel env vars (voice returns to its honest unavailable state), or
`docker compose -f docker-compose.prod.yml down` on the VM.
