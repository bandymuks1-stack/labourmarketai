# Human-Reviewed AI Assistance Contract v1

Status: ACTIVE (canonical-user-journey-living-cv-crm v1)
Date: 2026-07-13

## Where AI is allowed to act (real workflow sites only)

| Site | Agent | State today |
|---|---|---|
| CV/profile-text structuring (profile review step) | `worker_profile` | wired 2026-07-13; OFF until owner sets `AI_PROVIDER_MODE=live` + `AI_API_KEY`; deterministic lexicon is the always-on path |
| Company need → structured draft (public `/company-need`) | `company_need` | wired earlier; non-persisted, labelled |
| Match explanation (`/match-preview`) | `matching_explanation` | wired earlier; deterministic fit is primary, AI explanation labelled |
| Worker intake draft (`/worker-intake`) | `worker_profile` | wired earlier; non-persisted |
| Voice → text (journal) | self-hosted whisper.cpp | real inference when the service is deployed; transcript human-confirmed before any persist |

No standalone AI dashboard. No new external providers. No general AI
gateway. The 7 remaining registered-but-uninvoked agents stay dormant until
a real workflow site needs them — they must NOT be activated just to look
alive.

## Non-negotiable rules for every AI output

1. **Suggestion, never fact.** Output is labelled as a proposal
   (badge/hint), is editable, rejectable, and is NEVER persisted without an
   explicit human confirmation.
2. **Honest off-state.** With the runtime disabled the surface either shows
   the deterministic result alone (profile structuring) or an explicit
   "assistant not enabled" state (marketing demos) — never a fake AI badge,
   never invented output. Fake-AI copy is a defect: the `/work-abroad`
   "AI helps prepare your CV" note was removed 2026-07-13 for exactly this
   reason.
3. **Data minimisation.** An AI call receives only what the task needs
   (e.g. the composed bio text) — no phone/email/address/coordinates, no
   document contents, no third-party data.
4. **No authority.** AI can never verify a skill, change factual CV data,
   accept/reject a candidate, contact anyone, or send anything external.
5. **One boundary.** All LLM calls go through `lib/ai/runtime` +
   `lib/ai/registry` (zod-validated envelopes, cost clamps);
   `providers/anthropic.ts` is the only file allowed to import the SDK
   (guards: `ai-provider-boundary`, `no-direct-llm-client-call`,
   `no-provider-secret-leak`, `ai-readiness`).

## Activation (owner gate)

Setting `AI_PROVIDER_MODE=live` + `AI_API_KEY` (and for voice:
`VOICE_TRANSCRIBE_URL`/`VOICE_TRANSCRIBE_TOKEN` + deployed service) is an
owner-only action. Nothing in this repo enables a provider by default.
