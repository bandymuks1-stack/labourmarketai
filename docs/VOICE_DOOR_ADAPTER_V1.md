# Voice door adapter v1

Owner decision **U-26 = YES** (2026-10-06): voice stays in scope. Voice and
visual are **two equal input doors over the same canonical action spine**
(`docs/design/final/00-GALUTINE-DIZAINO-SISTEMA.md` §A.2). Voice is not a
product, a database, an authorization system, a journal or a matching system.
The Voice Work Journal is only the first slice.

> **Status: `VOICE_FIRST = NOT_GREEN`.** The journal door AND the generic door
> over the typed chat spine (all three actors) are built and proven in a real
> browser at 390 px against a service that implements the real HTTP contract.
> The production recognition engine, real-device proof and the read/navigation
> / draft-form breadth of the generic door are **not** proven. See "Proven / not
> proven" below.

## The chain

```
VOICE (mic)  ->  STT (self-hosted, signed single-use upload)
  ->  editable transcript (the person corrects it)
  ->  [adapter boundary: TEXT leaves the voice module, nothing else]
  ->  the SAME typed-chat turn  (intent router -> action registry -> dispatch)
  ->  existing card / preview  ->  person presses  ->  existing authority + confirmation
  ->  canonical executor / write  ->  canonical history + provenance label
  ->  (optional later) TTS reads back only the existing result text
```

Everything after "TEXT leaves the voice module" is the existing chat spine.
Voice grants **zero** additional authority: the STT step needs only a signed-in
session, and no voice event may call `dispatchWorkerAction`,
`prepareConfirmationAction`, a capability, an executor or `createJournalEntry`.
A spoken "yes" is **not** the confirmation: the existing on-screen review card
and its click are.

## What exists (this slice)

| Piece | File |
|---|---|
| Reusable capture door (all honest states, language choice, a11y, 44 px) | `components/app/voice/voice-capture-panel.tsx` |
| Journal entry wrapper (hand-off + provenance) | `components/app/voice-journal-recorder.tsx` |
| Pure model: capability detection, failure classes, languages, hand-off | `lib/voice/capture-model.ts` |
| Direct upload with real progress | `lib/voice/upload-client.ts` |
| Signed single-use upload token (app side) | `lib/voice/upload-token.ts`, `lib/voice/transcribe-action.ts` (`createVoiceUploadSession`) |
| STT service: token verify, exact-origin CORS, replay, per-subject limit, TTL cache | `services/transcribe/` |
| Boundary guard (voice modules import no action spine / data client) | `lib/guards/voice-door-adapter-boundary.test.ts` |
| Header + capability guards | `lib/guards/security-headers.test.ts`, `lib/guards/voice-work-journal.test.ts` |

### Reusable voice entry pattern

`VoiceCapturePanel` takes `serviceConfigured` and `onUse(result)` and returns
**reviewed text + language + disclosure version**. Any surface can mount it; it
never performs the action itself. States (each a distinct `data-state`):
`ready · permission_required · requesting · recording · paused · uploading ·
transcribing · review · cancelled · failed · service_unavailable ·
permission_denied · policy_blocked · unsupported · no_device · device_busy`.

### Upload transport (why not a Server Action)

Recording is advertised at 25 MB / 10 min. A Server Action is capped at 5 MB and
the platform caps a function body at ~4.5 MB. The global action limit is **not**
raised. The app mints a **120 s, single-use, byte-bounded HMAC token** carrying
an opaque subject (no profile id leaves the app); the browser uploads straight
to the service, which accepts the token only from an exact allow-listed origin.
The master secret is never sent to a browser. Raw audio is never stored by the
app and is deleted by the service when the text is ready; transcript cache is
TTL-bounded (default 600 s, max 3600 s); logs carry sizes and codes only.

### Language

Speech language is **not** the UI locale. A select offers the service's closed
set plus "detect automatically"; the default comes from the stored choice, else
the UI locale when the service speaks it, else auto. The choice is remembered
per browser and travels with the provenance.

### Provenance

A voice-derived journal entry keeps `input_origin=voice`, `voice_language` and
`voice_disclosure_version` as `journal_entry_metrics` rows (`source =
worker_input`, written by the one canonical `createJournalEntryCore`; no
migration). It is a **self-declared label** like every worker_input field -
"dictated and reviewed by the worker" - never a verification.

### Browser-vendor dictation (command finder)

The finder's Web Speech mic is browser-native and, in Chrome/Safari, sends audio
to the browser vendor. Option A is implemented: a one-time disclosure the person
must accept before the first start (remembered per browser), a named failure
state, and no claim that "no external service" is involved. Audio that
LabourMarket.ai itself processes goes through the voice journal.

## Action classification (for the generic door)

Derived only from properties already encoded in the registries (full tables:
the audit's `voice-adapter-action-inventory`). Class is the strongest effect
reachable from one utterance; the commit is judged by its existing tier.

| Class | Meaning | Counts (intents / actions) |
|---|---|---|
| `VOICE_READ_SAFE` | persists/sends nothing; read, route, blocked, navigation | 68 / 11 |
| `VOICE_DRAFT_SAFE` | at most opens a preview or prefilled form; commit is a separate on-screen act | 22 / 16 |
| `VOICE_CONFIRM_REQUIRED` | the commit itself (token + review card + role gate) - reachable only as the existing card | 0 / 27 |
| `VOICE_NOT_READY` | no barrier between one sentence and the effect, or no executor on the chat path | 3 / 3 |

`VOICE_NOT_READY` intents: `switch-context`, `write-employer`,
`open-conversation` (guards G1-G3). Capabilities (60) are MCP transport and are
**forbidden** to the adapter (their draft/confirm tokens are self-mintable).
Strong-irreversible actions (respond-booking, respond-invitation, assign-worker,
move-worker, engagement.end) stay card-and-click only.

## Proven / not proven

Proven (this branch): header `microphone=(self)` served and honoured by a real
Chromium (`allowsFeature("microphone") = true`, `getUserMedia` granted);
record -> pause/resume -> stop -> direct signed upload -> transcript -> edit ->
chat -> work-log preview -> explicit Save + confirm -> canonical entry with the
three provenance rows in the local DB; permission denied, unsupported browser,
service unreachable, engine failure with retry **without re-recording**, cancel
with focus return; 44 px targets; the real `services/transcribe/server.mjs`
HTTP contract (auth/CORS/replay/limits before the engine).

Not proven / open: real whisper.cpp recognition in production
(`VOICE_TRANSCRIBE_URL` not configured/probed there); real phone-class device and
screen-reader pass; interruption by a real incoming call; the generic
`handleSend(origin=voice)` door with the G1-G3/G5 guards; employer/agency use of
STT (today worker-only by the existing `workers` row requirement); TTS; the
exact production origin list for `ALLOWED_ORIGINS`.

## Generic door v1.1 (this slice)

One persistent, discoverable control: the **composer microphone** (44 px, shown
only when the transcription service exists - honest absence). It opens the
reusable `VoiceCapturePanel` as a card in the thread. The reviewed text enters
the same `handleSend` a typed sentence takes, tagged `origin = "voice"`; the
intent router, action registry, executors, authority and confirmation cards are
untouched. The only things `origin = "voice"` changes are in
`lib/conversation/voice-turn-policy.ts`:

1. a bare "yes"/"ok"/"taip"/... is **refused before routing** ("a spoken yes is not a confirmation - press the button on the card");
2. `switch-context`, `open-conversation`, `write-employer` offer the single fuzzy match as a **chip the person presses** instead of acting on it.

Dictated sentences that the router maps to *log work* reach the existing
work-log preview and explicit Save; the voice provenance (`input_origin`,
`voice_language`, `voice_disclosure_version`) is attached to that one canonical
write. The journal page's own voice entry stays as the declared "log work"
door (explicit intent), same write path.

### Actors
`createVoiceUploadSession` requires a signed-in person only: STT grants no
authority. Verified in a real browser for **worker, company (employer) and
agency** sessions: mic present, capture and review work, and the sentence is
then governed by that actor's existing chat authority (e.g. company dictation
routes through the company handlers). No action was duplicated per actor.

### Classification coverage
READ_SAFE (68 intents) and DRAFT_SAFE (22) are reachable by voice exactly as by
typing, because voice only supplies text. CONFIRM_REQUIRED actions remain
card-and-click. NOT_READY intents (3) are guarded as above. Capabilities / MCP
are not used by voice (guard: `voice-door-adapter-boundary`).

### Browser-vendor dictation (command finder) - can it be removed?
Yes in principle: the canonical door could feed the finder query (record -> STT
-> text into `setQuery`). Blockers: it is batch, not streaming (a search box
wants live interim results), needs the service configured for every identity
(now actor-neutral) and a latency budget. Recommendation: keep the disclosed
vendor mic as the interim, do not build a third speech stack, and revisit once
real-device latency of the canonical door is measured. No decision needed now.

### Provenance chain proven
voice -> transcript edit -> `handleSend` -> router -> work-log -> explicit Save
-> `createJournalEntryCore` -> `journal_entry_metrics` rows (local DB, generic
door and journal door). Speech recognition does **not** verify evidence: the
rows are self-declared `worker_input` labels.

