# Voice Work Journal + CV Engine — Gap Map & Architecture v1

Programme: `labourmarketai-migrations-voice-work-journal-master-goal-v1.md` (owner goal command, 2026-07-11)
Audited: 2026-07-11 · Base: `origin/main` after the seven-migration activation train.

Voice is an INPUT METHOD into the existing canonical Work Journal → skills →
evidence → CV/player-card loop. This document maps what exists, what is
net-new, and the exact reuse contract. No second journal, no second CV, no
second skills store, no generic AI chat.

## 1. What exists (source-verified)

### Canonical Work Journal
- Write path: server action `createJournalEntry(formData)` in
  `apps/web/lib/journal/actions.ts` → RPC `create_journal_entry_full`
  (atomic entry + metrics; legacy two-step fallback on PGRST202 only).
- Model: `journal_entries` (0013) — `original_text` NOT NULL is the evidence,
  `original_language`, hash-chained (`hash_prev`/`hash_self`), default-closed
  visibility, append-only RLS (SELECT/INSERT only), soft-delete +
  supersede/correction lifecycle (`journal_entry_supersede`,
  `journal_entry_soft_delete`, `buildEditingEntry` in `lib/journal/edit-entry.ts`).
- UI: `app/[locale]/dashboard/journal/page.tsx` +
  `components/app/journal-entry-composer.tsx` (single create/edit surface,
  modes quick/structured/photo over ONE save path; free text →
  `extractJournalSuggestions` → review stage → save).
- Structure: `journal_entry_work_items`, `journal_entry_skills` (worker-asserted
  evidence links, NOT verification), `journal_entry_metrics`
  (`source: worker_input|ai_extracted|manager_corrected` already modeled).
- `journal_entry_extractions` (0013) — built, UNUSED: pre-provisioned home for
  AI/async extraction output (`ai_provider`, `raw_response`, `candidate_skills`,
  `worker_confirmed_at`, `worker_confirmed_subset`).

### Skills / professions / evidence
- Deterministic extraction (NO LLM): `lib/structuring/*` —
  `extract-journal-suggestions.ts`, `skill-recognition.ts`,
  `recognition-tiers.ts` (auto_signal / candidate_suggestion / manual_only),
  LT keyword hints.
- Claim layers: `profile_skill_claims` (self_declared; migration comment
  already names "voice transcript" as an intended future source),
  `candidate_skills` (free-text → candidate, admin promotion), `worker_skills`
  verified ONLY via `confirm_entry_and_verify_skills` /
  `apply_learning_auto_confirmation` (manager confirmation spine).
- ESCO taxonomy + universal profession/skill catalogue live.

### CV / player card
- `lib/player-card/*` + `components/app/worker-player-card.tsx`; work-card
  writes ONLY via `save_worker_card` / `confirm_worker_card` (owner-scoped,
  whitelisted `workers` columns; trust/completeness NOT writable).
- CV import precedent: `app/api/cv/extract/route.ts` + `lib/cv/extract.ts` —
  upload → server extracts text → returns to caller ONLY (no DB write, no
  logging), 5 MB cap, auth-gated. The exact review-before-write shape voice
  needs.

### Storage precedent (blueprint for audio)
- `journal_entry_photos` (20260612): private bucket, `public=false`,
  size+MIME caps at bucket AND RPC AND table CHECK, INSERT RLS
  `with check (false)` — the ONLY insert path is SECURITY DEFINER
  `register_journal_entry_photo` re-checking auth/MIME/size/ownership/path
  prefix `<uid>/<entry_id>/`; storage object policies owner-scoped by first
  path segment; client helper with honest result states
  (`uploaded|invalid|limit|not-ready|failed`).

### AI boundary
- Full internal LLM harness exists and is OFF by default
  (`AI_PROVIDER_MODE=disabled`; `lib/ai/runtime/*`, registry incl.
  `work-journal.ts` agent schema, strict zod output envelope, guard suite
  `ai-provider-boundary`, `no-direct-llm-client-call`,
  `ai-output-schema-required`, learning auto-confirm default OFF).
- `AI_API_KEY` etc. not in `.env.example` — no provider configured on any
  environment. HONEST STATE: PROVIDER_GATED for any LLM-assisted proposals.
- whisper.cpp is transcription, NOT the LLM boundary — server-to-server
  template is `lib/notifications/telegram-owner-alerts.ts` (env-gated flag,
  shared-secret Bearer, AbortController timeout, best-effort, never throws).

### Server / env / i18n / guards
- Feature writes = server actions; REST under `app/api/*` where needed.
- Env contract: `apps/web/lib/env.ts` (zod, validate-at-boot).
- i18n: next-intl; every new key in ALL locales same PR (doctrine §2.4);
  en/lt zero-debt ratchet; journal namespace exists per locale.
- Guard convention: every feature ships `lib/guards/<feature>.test.ts` static
  invariants; validation = typecheck / lint / vitest / build / placeholders /
  i18n-debt / route smoke / constitution / migration-safety CI.

## 2. What does NOT exist (honest gaps — all net-new)

| Gap | State |
|---|---|
| Any audio capture (MediaRecorder/getUserMedia/AudioContext) | ABSENT repo-wide |
| Audio storage bucket / audio MIME allowance | ABSENT |
| Transcription service, client, route, env vars | ABSENT |
| Async job queue / cron / polling worker | ABSENT (nearest shapes: `journal_entry_photos.upload_status`, unused `journal_entry_extractions`) |
| Voice job data model | ABSENT → separate human-gated draft migration (`voice_journal_jobs`) |
| Voice/lip-sync/cloning code or docs | ABSENT (roadmap M4+ mentions voice input only) |

## 3. Architecture decision (smallest honest slice)

1. **Recording UI** on the existing journal surface (`/dashboard/journal`,
   nested routes under it): MediaRecorder start/pause/resume/stop/cancel,
   elapsed time, strict caps (25 MB / 10 min / closed MIME set:
   audio/webm, audio/ogg, audio/mp4, audio/mpeg, audio/wav), file-upload
   alternative through the same validator, permission-denied + retry states,
   44px controls, NO background recording (recorder dies with the surface).
2. **Explicit disclosure BEFORE first recording** (and stored acknowledgement
   version on the job row): audio is sent to a LabourMarket.ai-controlled
   external processing server, why (transcription), retention (auto-delete
   after transcript confirmation or ≤30 days, whichever first), deletion
   control, and that NOTHING updates journal/profile/CV before explicit
   confirmation.
3. **Transcription service** (`services/transcribe/`): self-hosted
   whisper.cpp behind a minimal authenticated HTTP API (Docker), bearer-token
   server-to-server auth, bounded upload, synchronous-with-timeout first +
   job-record polling contract, `/healthz`, idempotency by job key, LT/EN/RU/
   NL/DE where the model permits. Honest `unavailable` state when
   `VOICE_TRANSCRIBE_URL`/`VOICE_TRANSCRIBE_TOKEN` env is absent —
   INFRASTRUCTURE_GATED until the owner provides a host.
4. **Voice job model** — separate HUMAN-GATED draft migration
   (`voice_journal_jobs`: owner worker, status
   recorded→uploading→queued→processing→completed→failed→cancelled,
   language, transcript + edited transcript version, audio storage path,
   idempotency key, disclosure version, retention/delete timestamps, error
   text, timestamps; RLS owner-only; RPC-only writes; paired rollback).
   NOT applied by this programme — decision pack for the owner.
5. **Review & confirm**: transcript fully editable; deterministic
   `extractJournalSuggestions` runs on the edited transcript (same code path
   as typed text — no new extractor); per-item accept/reject/edit with source
   segment + destination shown; journal confirmation SEPARATE from
   skill/profession/evidence/CV suggestions; accepted items flow ONLY through
   `createJournalEntry` (transcript → notes/original_text),
   `journal_entry_skills` auto-link, `profile_skill_claims`
   (source stays honest), `save_worker_card` for CV fields the worker accepts.
   Provenance: `journal_entry_metrics` row `source='worker_input'` with a
   `voice_transcript` marker metric + job id reference; idempotency: one
   journal entry per confirmed job (idempotency key re-check).
6. **Never inferred**: employer, dates beyond stated, certification, licence,
   salary, legal eligibility, completed-work quality — extraction stays
   deterministic keyword/rule tier; LLM enrichment stays PROVIDER_GATED and
   OFF.

## 4. Route plan

- `/dashboard/journal` — entry point button "Įrašyti balsu" on the composer.
- `/dashboard/journal/voice` — recording + disclosure + upload.
- `/dashboard/journal/voice/[jobId]` — status (queued/processing/completed/
  failed), transcript review/edit, per-item proposals, confirm controls,
  history + audio deletion state.
- No new top-level module.

## 5. Security invariants

Owner-scoped RLS on every voice row; private audio bucket, no public URLs,
short-lived signed access only; no service-role from user requests; no
transcript/audio content in logs; no NEXT_PUBLIC secrets; callback-free v1
(server polls/synchronous — no inbound callback surface = no replay problem;
if callbacks are added later they need HMAC + timestamp + nonce);
delete/export honored (`voice_journal_jobs` rows + storage objects removable
by owner; export includes transcripts); no outbound messages of any kind.

## 6. Delivery split (PRs)

- I: this gap map (docs).
- J: recording + review UI (repo-safe, honest `unavailable`/`preparing`
  states until infra + migration exist).
- K: transcription service pack (Dockerfile, server, API contract, env
  contract, deploy/rollback guide) — INFRASTRUCTURE_GATED for deployment.
- L: `voice_journal_jobs` draft migration + decision pack — OWNER_DECISION_GATED.
- M: canonical-write confirmation integration (behind the same gates).
- N: lip-sync boundary doc + authenticated mobile proof + closeout.
