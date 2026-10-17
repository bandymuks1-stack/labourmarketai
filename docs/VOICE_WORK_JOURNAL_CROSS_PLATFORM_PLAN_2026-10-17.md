# Voice Work Journal — cross-platform implementation plan (2026-10-17)

| Field | Value |
|---|---|
| Owner direction | 2026-10-17: voice-based Work Journal entry creation is an **essential cross-platform feature**, not a web-only experiment. Prepare a concrete plan for recording, multilingual transcription, structured work extraction, user confirmation and Work Journal persistence. Reuse existing infrastructure; evaluate free / open-source speech models first; no paid AI API and no new infrastructure without approval; **one** voice workflow with shared business logic and authorization, never one per application |
| What this document is | the plan, with every reuse named by file, every new piece justified by what does not exist, the model evaluation with sources, the slices as PRs with their tests, and the owner decisions. Nothing here is built; nothing is activated |
| Binding context | `docs/VOICE_DOOR_ADAPTER_V1.md` (owner decision U-26; voice is an input door over the one action spine), `docs/PLATFORM_DOCTRINE.md` §7 (no fake AI), decision 0023 (Living CV infers, never narrows), decision 0024 (one memory), `docs/OWNER_TARGET_ARCHITECTURE_V1.md` §1.9 / M-1…M-9 (no second write path, no client-only endpoint) |
| Companions | `docs/integrations/EXTERNAL_LLM_CLIENTS_PROGRAMME_2026-10-17.md` §E (feature matrix row), `docs/mobile/MOBILE_BETA_MERGE_ROLLBACK_AND_DEVICE_EVIDENCE_2026-10-17.md` §5, PR #2198 (STT deploy bundle + runbook, open) |

## 1. What already exists — and is reused as is

The voice chain was designed and built once (`VOICE_DOOR_ADAPTER_V1.md`); the
web is its first client. Read from the tree on 2026-10-17:

| Stage | Existing piece | Where | Reuse on the phone |
|---|---|---|---|
| Capture states and limits | the pure capture model: capability detection, MIME choice, failure classes (`permission_denied`, `no_device`, `device_busy`, `unsupported`, `service_unavailable`, `policy_blocked`, …), size/duration limits (25 MB / 10 min), the closed language set `SPEECH_LANGUAGES` (lt, en, ru, nl, de, pl, lv, et, da, no, sv, fi) + `auto` | `apps/web/lib/voice/capture-model.ts` | **move the pure parts to `packages/client-core`** (no DOM, no Next import — the boundary guard already forbids them) so web and phone share the same states, limits, language set and failure classes |
| Signed single-use upload token | `mintUploadToken` — HMAC, 120 s TTL, single-use `jti`, byte cap, **opaque subject** (never a profile id) | `apps/web/lib/voice/upload-token.ts` | unchanged |
| Token minting door | `createVoiceUploadSession()` — a **cookie** server action: signed-in user → `workers` row → mint; `isVoiceTranscriptionConfigured()` honesty | `apps/web/lib/voice/transcribe-action.ts` | the LOGIC is reused; the DOOR is widened (§3, V-1): the phone is a bearer client and cannot call a server action |
| Speech-to-text service | self-hosted **whisper.cpp** (`whisper-cli` + ffmpeg + a zero-dependency Node wrapper): bearer master token or v1 upload token, exact-origin CORS, replay refusal, per-subject rate limit, 25 MB / 10 min caps, closed MIME set, TTL cache; audio deleted when the text is ready; **no third-party STT** | `services/transcribe/` (Dockerfile, `server.mjs`, `upload-auth.mjs`), deploy bundle + runbook in PR #2198 | unchanged contract; one additive rule for native clients (§3, V-1b); model upgrade (§4) |
| Direct upload with progress | browser → service, bytes never through a Server Action (5 MB cap) | `apps/web/lib/voice/upload-client.ts` | same transport on the phone (`fetch` with the audio file body) |
| Review before anything happens | editable transcript, language, disclosure version | `components/app/voice/voice-capture-panel.tsx`, `voice-journal-recorder.tsx` | same contract, native screen |
| **Structured work extraction** | deterministic: `deriveIntakeWorkTime(notes, today)` / `intakeWorkTimeFields` parse hours, spans and breaks out of the text in every supported language; applied by **both** the chat executor and the MCP capability (`registry.ts:773`) | `apps/web/lib/journal/intake-work-time.ts` | **already shared** — it runs on the server inside the draft, so the phone gets it for free |
| Optional AI structuring | `work-journal` agent (rawText → structured draft; never asserts quality, never invoices) behind the egress-gated runtime, per-task cost ceiling, daily / per-org caps, `ai_runs` audit | `apps/web/lib/ai/registry/agents/work-journal.ts`, `lib/ai/runtime/*` | available, **off by default for voice** (§5 decision V-D3): deterministic extraction first; a paid model call per entry is an owner decision |
| **Draft → confirm** | `journal.create_draft` validates `workerLogWorkSchema` — the SAME contract as the web chat work-log form, including the optional `voice: { language, disclosureVersion }` provenance — returns the exact preview + a one-time HMAC token (bound to caller, input, state fingerprint, 5-min TTL, single-use spend); `journal.confirm` performs the one canonical write | `apps/web/lib/capabilities/registry.ts` (`journal.create_draft` / `journal.confirm`), `lib/conversation/worker-schemas.ts`, `lib/capabilities/confirmable.ts` | **already shared and bearer-reachable**: the phone already calls exactly these two tools for typed entries (`apps/mobile/src/screens/journal-composer.tsx`) |
| Persistence + provenance | `createJournalEntryCore` — append-only, hash-chained, pipeline-awaited; voice provenance stored as `journal_entry_metrics` rows (`input_origin=voice`, `voice_language`, `voice_disclosure_version`, `source=worker_input`); a **self-declared label**, never a verification | `apps/web/lib/journal/journal-write-core.ts`, `lib/conversation/worker-executors.ts:259` | unchanged core. **Gap verified 2026-10-17:** the MCP capability ACCEPTS `voice` (it validates `workerLogWorkSchema`) but does not forward it — `registry.ts` builds `site_name`, `project_id` and the intake fields only, so a phone or assistant entry would lose its voice label. V-2 forwards it the way the chat executor does |
| Spoken "yes" is not a confirmation | `voice-turn-policy.ts`: a bare affirmation from a voice turn is refused before routing; the on-screen card and its press confirm | `apps/web/lib/conversation/voice-turn-policy.ts` | same rule, same place (server) — the phone's confirm is the existing button |
| Guards | boundary guard (voice modules import no action spine / data client), voice-work-journal guard (no second write path), security headers (`microphone=(self)`) | `apps/web/lib/guards/voice-door-adapter-boundary.test.ts`, `voice-work-journal.test.ts`, `security-headers.test.ts` | extended, not replaced |
| Phone transport | one capability client over `POST /api/mcp` with the person's own session (bearer); refuses a key that bypasses RLS | `packages/client-core/src/transport.ts` | unchanged |

What does **not** exist: a bearer-reachable way to obtain an upload token; a
rule in the STT service for a client that sends no browser `Origin`; any
microphone, recorder or STT client on the phone (the APK requests `INTERNET`
and `VIBRATE` only); a production STT host (PR #2198 is prepared, not
deployed); a model better than `small` on that host.

## 2. The one workflow (identical on web, Android, iOS)

```
[client]  mic → local recording (opus/webm on web, m4a/aac on the phone; ≤ 25 MB, ≤ 10 min)
          → ask the server for an upload session        → voice.upload_session.create  (bearer or cookie, same capability)
          → upload the bytes DIRECTLY to the STT service with the single-use token
          → receive { transcript, language, durationSeconds, model }
          → the person READS and EDITS the text; chooses/confirms the language
[server]  journal.create_draft({ workDate, notes: <reviewed text>, siteName?, engagementContextId?, voice: { language, disclosureVersion } })
          → deterministic extraction (hours, spans, breaks) + engagement resolution + the exact preview + one-time token
[client]  shows the preview card; the person PRESSES confirm (a spoken "yes" is refused server-side)
[server]  journal.confirm({ confirmationToken }) → createJournalEntryCore → journal_entries + journal_entry_metrics (input_origin=voice, voice_language, voice_disclosure_version)
```

Nothing in this chain is new business logic. The only new server piece is
the upload-session capability; everything after the transcript is the typed
path. Voice grants **zero** extra authority: the token mints only for a
signed-in person with a `workers` row, the STT service never sees who they
are (opaque subject), and the write is the same confirm-gated write.

## 3. Slices — small, reversible PRs, each with its tests

| Slice | Change | Files | Tests that ship with it | Class |
|---|---|---|---|---|
| **V-0 shared voice model** | move the pure parts of `capture-model.ts` (failure classes, limits, `SPEECH_LANGUAGES`, hand-off encoding) into `packages/client-core/src/voice/`; web re-exports from there | `packages/client-core/src/voice/*`, `apps/web/lib/voice/capture-model.ts` (re-export) | existing voice unit tests pass unchanged; client-core test for the language set and limits; boundary guard still green | GREEN |
| **V-1 upload-session capability** | `voice.upload_session.create` in the registry: `kind: "execute"` (mints a token; no data written; added to the single-step allowlist with the reason "mints a 120 s single-use upload credential, nothing persists"), input `{ maxBytes?: number }`, output `{ uploadUrl, token, expiresAt, maxBytes, languages, serviceConfigured }`; refuses by name when the service is not configured (`service_unavailable`), when the caller has no `workers` row, and under the per-person mint rate limit; `createVoiceUploadSession()` (web) becomes a thin wrapper over the same core so there is ONE door | `lib/capabilities/voice-capabilities.ts`, `registry.ts`, `lib/voice/transcribe-action.ts`, `lib/guards/mcp-execute-allowlist.test.ts` | capability tests (exposure + annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: false`; no token in logs; refusals by name; opaque subject); fingerprint register row; `voice-work-journal.test.ts` extended: the capability is the only minter | GREEN |
| **V-1b native clients at the STT service** | `services/transcribe`: a v1 upload token whose claims carry `client: "native"` is accepted **without** a browser `Origin` header; browser tokens keep the exact-origin rule. The app sets `client` from the caller surface (cookie → `web`, bearer → `native`). Bounded exactly as today (TTL, single use, byte cap, per-subject rate) | `services/transcribe/upload-auth.mjs`, `server.mjs`, `lib/voice/upload-token.ts` | the service's own contract tests (auth/CORS/replay/limits before the engine) + the new case; app-side token test | GREEN (service code; deploy is the hosting lane) |
| **V-2 provenance through the capability** | `journal.create_draft` → `journal.confirm` forwards `voice` into the executor fields the chat path already uses (`input_origin=voice`, `voice_language`, `voice_disclosure_version` → the same three `journal_entry_metrics` rows); today the field is accepted and silently dropped (verified). No new write, no schema change | `registry.ts`, `capabilities.test.ts` | red-before/green-after: confirm with `voice` set and assert the three fields reach `createJournalEntryCore`; the preview names the origin | GREEN |
| **V-3 phone recorder + review + draft** | `expo-audio` recording (new dependency; `RECORD_AUDIO` on Android, `NSMicrophoneUsageDescription` on iOS — store declarations updated in `app.json`, pinned by `mobile-release-config.test.ts`); the capture states from V-0; a Review screen (editable text, language chooser from the shared set, the disclosure shown once per device); hand-off into the EXISTING `journal-composer` with `notes` prefilled and `voice` provenance set → same draft → same confirm card | `apps/mobile/app/(shell)/journal.tsx` (one door: "Speak"), `src/screens/voice-capture.tsx`, `src/screens/journal-composer.tsx` (prefill + `voice` field), `app.json`, six-locale copy in `src/i18n/messages.ts` | mobile typecheck; Maestro `voice-journal-journey.yaml` (dispatch-only, production-qa): permission → record 3 s of a bundled sample → upload → transcript visible → edit → draft → confirm → the entry carries `input_origin=voice`; honest states: denied permission, service not configured, offline | GREEN |
| **V-4 model upgrade on the STT host** | the Dockerfile's `WHISPER_MODEL` build arg: `large-v3-turbo` (§4); CPU thread and timeout settings; the README's language table re-measured | `services/transcribe/Dockerfile`, `README.md`, runbook in #2198 | the live verifier from #2198 (`healthz`, a 5 s sample in LT and PL, latency recorded) | GREEN code; **deploy = owner + hosting lane** |
| **V-5 one proof** | the web voice walk re-run and the V-3 Maestro journey on real devices, recorded in the mobile plan §4.1 | docs only | — | — |

Order: V-0 → V-1 + V-1b → V-2 → V-3 (needs V-1 on a reachable origin) → V-4 →
V-5. V-0, V-1, V-1b, V-2 are web/server-only and can merge before any
hosting decision; nothing in them changes behaviour for a person until the
STT host exists (the capability answers `service_unavailable`, the web keeps
its honest not-configured state, the phone shows the same).

Explicitly NOT planned: a second transcription path per app, on-device OS
dictation as the primary engine (§4.3), a spoken confirmation, voice for
agencies/employers before the worker path is proven (the `workers`-row gate
stays), TTS, a voice "assistant" (direction item 8 of the LLM programme
keeps assistants text-only; a dictated sentence in Claude or ChatGPT reaches
the same tools through their own microphones).

## 4. Speech models — free and open first

Requirements: the six active product locales plus the twelve the service
already lists, **Lithuanian and Polish being the hard cases**; self-hosted on
CPU (no GPU is provisioned); licence compatible with a commercial product;
one engine so the service stays small.

### 4.1 Candidates (sources fetched 2026-10-17)

| Model | Licence | Languages | Lithuanian / Polish | Runs on | Verdict |
|---|---|---|---|---|---|
| **whisper.cpp `small`** (today) | MIT | 99 | weak LT (a third-party benchmark reports WER ≈ 66 % LT, ≈ 15 % PL — not peer-reviewed) | CPU, 466 MB | keep only as the fallback for low-memory hosts |
| **whisper `large-v3-turbo`** (ggml, whisper.cpp ≥ 1.7.2) | MIT | 99 | strong (the same benchmark: large-v3 ≈ 22 % LT, ≈ 5 % PL; turbo keeps the encoder and cuts the decoder to 4 layers) | CPU: q5_0 ≈ 574 MB, roughly real-time on 4 vCPU for ≤ 10-min clips | **first choice: a build-arg change on the existing image, no new service** |
| **NVIDIA parakeet-tdt-0.6b-v3** | CC-BY-4.0 (repackagers; **confirm on the NVIDIA model card before relying on it**) | 25 European incl. lt, pl, lv, et, ru, uk, de, nl, da, no, sv, fi | best reported LT (≈ 20 %), PL ≈ 7 %; automatic language detection | needs NeMo or an ONNX/CTranslate2 export — a second runtime | **evaluation track**: measure on the same LT/PL samples; adopt only if it beats turbo clearly, as a model swap behind the same HTTP contract |
| NVIDIA canary-1b-v2 | permissive per NVIDIA (exact licence not confirmed) | the same 25 | likely similar to parakeet; also translates | heavier (1 B) | not first |
| Voxtral (Mistral), Moonshine, Vosk | Apache-2.0 / MIT / Apache-2.0 | en, fr, de, es, it, pt, nl, hi (Voxtral); English (Moonshine); no Lithuanian model (Vosk) | **no LT** | — | excluded for this product |
| Meta MMS / SeamlessM4T | CC-BY-NC-4.0 | many | yes | — | **excluded: non-commercial licence** |
| Paid APIs (OpenAI, Deepgram, Google, Azure, ElevenLabs) | — | — | — | — | **excluded by direction** (no paid AI API; audio would leave owner-controlled infrastructure — the service's own promise) |

Sources: the parakeet-tdt-0.6b-v3 model card and the Canary/Parakeet v2/v3
paper (arXiv 2509.14128); the whisper-large-v3-turbo model card (MIT); the
third-party WER benchmark is quoted as indicative only.

### 4.2 Recommendation

1. **V-4 now:** `WHISPER_MODEL=large-v3-turbo` on the existing whisper.cpp image
   (MIT, same binary, same API). Measure LT and PL on ten real 20-second site
   recordings each (the owner's voice and one other speaker) before and after;
   record WER and latency in the runbook. Memory: plan 2 GB RAM for the service.
2. **Evaluation track (no production change):** parakeet-tdt-0.6b-v3 via an
   ONNX export on the same samples, only if LT after step 1 is still unusable.
   Adopting it is a model swap behind the unchanged `/v1/transcribe` contract.
3. **Never** a paid API, never a model whose licence forbids commercial use.

### 4.3 On-device recognition (Android `SpeechRecognizer`, iOS `SFSpeechRecognizer`)

Rejected as the primary engine, kept as a later **opt-in**: (a) Lithuanian
on-device availability is not confirmed on either platform (Apple's
recognizer falls back to the keyboard dictation language and may need the
network; Android reports per-device support through `RecognitionSupport`);
(b) when the OS engine uses the vendor's cloud, audio leaves owner-controlled
infrastructure — the same reason the web's browser-vendor dictation carries a
one-time disclosure; (c) it would be a second engine with a second language
table, which the one-workflow rule forbids. A device-side whisper.cpp
(`whisper.rn`) is possible later for offline capture, but the small models
that fit a phone are the ones that are weak in Lithuanian.

## 5. Owner decisions

| Id | Decision | Default if the owner says nothing |
|---|---|---|
| V-D1 | Deploy the STT service (PR #2198 bundle) — where: the VPS the hosting agent prepares, or another owner host. 2 GB RAM, CPU only, the public hostname goes into `ALLOWED_ORIGINS` and `VOICE_TRANSCRIBE_URL` | not deployed; voice stays honestly "not configured" everywhere |
| V-D2 | Model: `large-v3-turbo` (recommended) vs keep `small` | turbo |
| V-D3 | AI structuring per voice entry (the `work-journal` agent, Gemini today): **off** by default; turning it on is a model-cost decision under the existing per-task ceiling | off — deterministic extraction only |
| V-D4 | Phone permissions and store declarations: `RECORD_AUDIO`, `NSMicrophoneUsageDescription`, Play Data safety "Audio — processed, not stored", App Privacy "Audio data — linked, app functionality". Approving V-3 approves these | V-3 waits |
| V-D5 | Native tokens without a browser `Origin` (V-1b) — accept the design (claims-bound, same limits) | V-1b waits; the phone cannot upload |
| V-D6 | Voice for employer / agency actors (today the `workers`-row gate) | workers only |

## 6. Evidence rules

Each slice is DONE only with its test green on CI and, for V-3/V-5, a real
device recording in the mobile plan's evidence table. "The service exists" is
not "voice works": `COM-6` in the capability register stays PARTIAL until a
human has recorded, reviewed, confirmed and seen the entry with its
`input_origin=voice` rows on production.
