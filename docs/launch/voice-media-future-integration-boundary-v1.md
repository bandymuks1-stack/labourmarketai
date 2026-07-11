# Voice / Media Future Integration Boundary v1

Programme: `labourmarketai-migrations-voice-work-journal-master-goal-v1.md`
Status: BOUNDARY AUDIT ONLY — nothing in this document is shipped.

## What Voice Work Journal v1 IS

- Worker speaks about their experience on the existing journal surface.
- Audio goes ONLY to a LabourMarket.ai-controlled transcription server
  (self-hosted whisper.cpp), with explicit prior disclosure.
- The worker reviews and fully edits the transcript.
- Accepted facts strengthen the canonical Work Journal, skill evidence,
  profile and CV/player card — through the existing write paths only.
- Audio is retained only until transcript confirmation (or the retention
  ceiling) and is deletable by the worker.

## What is EXPLICITLY OUT of the journal workflow (future, separately gated)

| Capability | Boundary |
|---|---|
| Voice cloning (synthetic reproduction of a worker's voice) | NOT built. Requires separate explicit consent, its own legal review, and an owner decision. Never bundled into journal consent. |
| Lip-sync / avatar video generation | NOT built. Audit-only. Any future integration must live in a marketing-media context, never inside employment evidence. |
| Public audio profiles / voice on public worker cards | NOT built. Journal audio is private processing input, never a public artefact. |
| Advertising / marketing use of worker audio or derived media | Forbidden without separate explicit per-use consent. Journal consent NEVER covers marketing. |

## Isolation rules for any future media work

1. **Separate consent objects.** Journal transcription consent
   (disclosure version on the voice job) can never be read as consent for
   cloning, avatars, or publication. New purpose rows in
   `privacy_consent_purposes` + explicit grant events would be required.
2. **Separate storage.** Marketing media may never live in the private
   journal audio bucket; employment evidence may never be read by a
   marketing pipeline.
3. **Separate identity.** Employment evidence (journal, skills,
   confirmations) is legally load-bearing; synthetic media must never be
   mixable with it — no shared tables, no shared URLs, no shared jobs.
4. **Owner gate.** Any step toward cloning/lip-sync/public audio is an
   OWNER_DECISION_GATED programme of its own with legal review; no agent
   session may begin it from this document.

## Current repo truth

No voice-cloning, lip-sync, avatar, or public-audio code, dependency, or
doc exists in the repository (verified by search 2026-07-11). The only
voice references are roadmap notes naming voice input as a future journal
input method — which is exactly what Voice Work Journal v1 implements.
