# Voice Work Journal + CV Engine — Execution Report v1

Programme: `labourmarketai-migrations-voice-work-journal-master-goal-v1.md`
Executed: 2026-07-12 · Gap map: `docs/launch/voice-work-journal-gap-map-v1.md`
Boundary doc: `docs/launch/voice-media-future-integration-boundary-v1.md`

Voice is an input method into the ONE canonical Work Journal → skills →
evidence → CV/player-card loop. No second journal, no second CV, no second
skills store, no generic AI chat was built.

## What shipped (PR ledger)

| PR | Slice | State |
|---|---|---|
| #737 | Migration activation audit (PR A) | MERGED |
| #730/#720/#721/#723/#722/#708/#714 | Seven activation slices (PRs B–H) | MERGED + LIVE_IN_PRODUCTION (see production-migration-activation-report-v1.md) |
| #738 | Voice gap map + lip-sync/cloning boundary (PR I) | MERGED |
| #739 | Self-hosted whisper.cpp transcription service pack (PR K) | MERGED — deployable; NOT deployed (INFRASTRUCTURE_GATED) |
| #740 | `voice_journal_jobs` v1 draft migration + decision pack (PR L) | OPEN DRAFT — human-gated, NOT applied, NOT covered by the 2026-07-11 authorization |
| #741 | Recording + disclosure + transcription proxy + transcript review + canonical hand-off (PR J) | MERGED — CI green (quality + migration-safety + deploy) |
| #742 | Final reports + closeout (PR N) | this PR |

## The shipped voice flow (PR J)

1. **Entry**: `/dashboard/journal` gets an "Įrašyti balsu" control; the voice
   surface lives at `/dashboard/journal/voice` (nested — no new top-level
   module). Auth + worker-profile gated server-side.
2. **Disclosure BEFORE recording** (all 12 locales): audio goes to a
   LabourMarket.ai-controlled processing server (no third-party STT), used
   only to produce the text, retained at most until the text is ready
   (≤30 days) and deletable, and NOTHING is added to journal/profile/CV until
   the worker reviews and saves each item personally. Recording is disabled
   until the acknowledgement checkbox is ticked (guard-pinned).
3. **Recording UX**: microphone permission with a real denied+retry state,
   start/pause/resume/stop/cancel, elapsed timer, 10-min auto-stop, 25 MB cap,
   closed MIME set, file-upload alternative through the same validator, 44px
   controls, and no background recording (unmount stops recorder + mic —
   guard-pinned).
4. **Transcription**: browser → server action → bearer-token call to the
   self-hosted whisper.cpp service. The browser never sees the URL or token
   (server-only env `VOICE_TRANSCRIBE_URL`/`VOICE_TRANSCRIBE_TOKEN`, no
   NEXT_PUBLIC — guard-pinned); transcript/audio content is never logged
   (guard-pinned). Queued/processing/completed/failed states are real; when
   the service env is absent the surface shows the honest "not configured"
   state (guard-pinned; nothing simulated).
5. **Review & edit**: the transcript is fully editable in place; "use in
   journal" passes the worker-edited text through a read-once sessionStorage
   key into the ONE existing composer (guard-pinned read-once + removeItem).
6. **Proposals + per-item accept/reject**: the existing composer review stage
   runs the same deterministic extraction as typed text
   (`extractJournalSuggestions` — tasks, time fragments, quantities,
   directions) and the existing `WorkEntrySkillReview` gives per-skill
   accept/reject with source text; unknown fragments stay review-only.
7. **Canonical writes ONLY**: saving goes through the unchanged
   `createJournalEntry` action → `create_journal_entry_full` RPC; skills flow
   through the existing evidence-link path. The voice slice contains zero
   supabase imports and zero new write paths (guard-pinned).

Validation on the PR J branch: typecheck ✅ · eslint (changed files) ✅ ·
full vitest 8,963/8,963 ✅ · build ✅ · i18n-debt within baseline (all 12
locales carry the full `journal.voice` namespace in the same PR) ✅ ·
route-truth-map classified ✅ · new guard `lib/guards/voice-work-journal.test.ts`
(15 static invariants) ✅.

## Truth states (nothing below is claimed live unless it is)

### LIVE_IN_PRODUCTION
- The seven activated migrations + their already-merged consumer UI.

### MERGED_NOT_DEPLOYED
- Transcription service PACK (`services/transcribe/`): Dockerfile,
  zero-dependency authenticated server, compose file, API/env contract,
  resource table, deploy + rollback guide. Deployment is an owner action to
  an owner-controlled Docker host — no host credentials exist in the repo and
  none were used.

### CODE_READY_MIGRATION_UNAPPLIED / OWNER_DECISION_GATED
- `voice_journal_jobs` v1 (PR #740, draft): job history, cross-device resume,
  provenance link (journal entry ↔ voice job), idempotent one-entry-per-job
  confirmation, disclosure-version pinning, retention/deletion ledger.
  The 2026-07-11 authorization explicitly does NOT cover this new migration;
  it waits for its own owner review of the decision pack in the PR.

### INFRASTRUCTURE_GATED
- Live end-to-end voice transcription: requires the owner to (1) deploy
  `services/transcribe` on a Docker host behind TLS and (2) set
  `VOICE_TRANSCRIBE_URL` + `VOICE_TRANSCRIBE_TOKEN` in Vercel. Until then the
  voice surface shows its honest unavailable state. Exact steps:
  `services/transcribe/README.md`.

### PROVIDER_GATED
- LLM-assisted proposals (richer summaries, profession/specialization
  inference, responsibility/leadership signals, CV/player-card improvement
  suggestions): the internal AI runtime exists but is `disabled` with no
  provider key configured anywhere (`AI_PROVIDER_MODE`, `AI_API_KEY` absent
  from every environment). Voice v1 therefore uses deterministic extraction
  only — same code path as typed text. No fake AI was added.

### BLOCKED (external input required)
- Authenticated 390px mobile browser proof: requires local seeded users via
  Docker Desktop (one-time GUI start) → `npx supabase start && npx supabase db
  reset && pnpm db:fixtures:local` → `node apps/web/scripts/marketplace-auth-proof.mjs`,
  extended to `/dashboard/journal/voice`. Real-credential authentication
  against production is out of policy for an agent session. This session
  re-attempted the gate 2026-07-12: launched `Docker Desktop.exe`
  programmatically — the daemon never came up from a non-interactive session
  (process absent after 4+ min), confirming the one-time GUI start is a real
  owner action. The voice surface is built mobile-first (44px controls,
  single-column ≤390px layout) and the layout is exercised by the
  route-smoke + mobile guards, but a real authenticated-device screenshot
  needs the owner-side step above.

### NOT_IMPLEMENTED (deliberately, this phase)
- Voice cloning, avatar/lip-sync video, public audio profiles (boundary doc;
  future owner-gated programme with separate consent).
- Server-side push/callback from the transcription service (v1 is
  synchronous-with-timeout via the proxy; no inbound callback surface exists,
  so there is nothing to replay — if callbacks are added later they need
  HMAC + timestamp + nonce, per the gap map).
- Automatic employer/date/certification/licence/salary/legal-eligibility
  inference — excluded by design; nothing infers what the worker did not say.

## Voice test coverage (implemented in `voice-work-journal.test.ts` + suite)
- Server-only env (no NEXT_PUBLIC, client never touches env/process/fetch).
- Disclosure gating before recording; disclosure names processing, retention,
  no-auto-write; all-locale key parity.
- No second write path (no supabase/journal-action imports in the voice
  surface; proxy performs no DB write; read-once hand-off into the composer).
- Caps both sides (25 MB / closed MIME / 600 s); unmount stops the mic;
  permission-denied retry state; honest unavailable state; no content logging.
- MIME/size/duration rejection and unauthenticated/cross-user rejection are
  enforced in the service (server.mjs) and the action (auth + worker checks);
  callback replay does not apply in v1 (no callback surface).
