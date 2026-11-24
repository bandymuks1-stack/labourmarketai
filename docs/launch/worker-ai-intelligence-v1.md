# Worker AI Intelligence — Reality & Honesty v1

**Date:** 2026-07-15 · **Branch:** `feat/launch-blocker-closure-worker-intelligence-v1` · **Baseline:** `origin/main` @ `603cae4a`

What the "AI understanding" of a worker actually does today, stated honestly.
Governed by `docs/PLATFORM_DOCTRINE.md` §7 / §7.1 (AI suggests, human confirms,
never auto-persists) and §15 (skill trust signals; numeric confidence hidden
from viewers). This document is the truthful baseline a launch decision rests
on — no aspirational claims.

---

## 1. Honest summary

- **Nothing the AI produces becomes a confirmed profile fact without an
  explicit worker action.** Verified end-to-end in both the CV import path and
  the daily-journal path. This is the single most important launch property and
  it holds.
- **"AI" today is mostly deterministic.** The live skill recognition is a
  keyword/lexicon recognizer, not a large language model. The optional LLM layer
  is **off by default** (`AI_PROVIDER_MODE` unset → disabled) and degrades to a
  quiet "nothing found" state — never a fake result, never an error wall.
- Because of that, worker-facing copy no longer advertises "(AI)". It says
  "suggestions from this entry" — true whether the engine is the lexicon or,
  later, an enabled model.

## 2. CV understanding — what it extracts

Upload → the raw text is read, then a **deterministic parser** proposes
structured fields. Every proposal is a review row; the worker Saves each one
explicitly. Conflicts require an explicit Replace; a language with no level
blocks Save until chosen.

| Field | Extracted today | Notes |
|---|---|---|
| Work experience | ✅ | period + title |
| Skills | ✅ | separate lexicon extractor, review-gated |
| Languages | ✅ | CEFR / native / fluent |
| Certificates | ✅ | |
| Education | ✅ | + type |
| Salary expectation | ✅ | monthly only |
| Availability clues | ⚠️ partial | relocate/transport/night/weekend; no dates |
| **Profession / job title** | ❌ **gap** | not parsed; the AI agent's `suggested_roles`/`suggested_headline` are not mapped into a review row |
| **Location(s)** | ❌ **gap** | no city/country parsing |

**Follow-ups (documented, not faked in this PR):** add review-gated profession
and location proposals. These are additive and must stay review-gated; they are
**not** required for a worker-acquisition launch (a worker can enter profession
during onboarding), so they are scheduled, not blocking.

**Owner-gated persistence:** some confirmed CV sections (work history, salary,
availability) only persist once migration `20260714161000` is applied. Until
then the UI honestly says the store is not activated and the entry is not
saved — no silent loss. Applying that migration is an owner action.

## 3. Daily work journal → skill recognition (mandatory launch requirement)

The loop is real and wired end-to-end:

```
worker writes a daily entry
  → skills are recognised from the text (lexicon; optional model if enabled)
  → shown as SUGGESTIONS the worker reviews
  → worker: Confirm  /  Correct  /  Reject
  → only confirmed skills become worker-declared profile skills (never verified)
```

- **Confirm / Correct / Reject** is now complete. Previously the worker could
  only Confirm or Reject a suggested skill. This PR adds **Correct**: each
  suggested skill is shown in an editable field, so the worker can fix the
  wording before saving. What is saved is what they typed — never the raw
  suggestion if they changed it. Empty is blocked.
  (`components/app/journal-ai-suggestions.tsx`.)
- **No auto-confirm.** Suggestions run only when the worker asks, and nothing is
  written until they accept an item. The auto-link that connects a *recognised*
  skill to an entry is fenced to `verified = false` and only touches
  already-declared skills — it never creates a confirmed fact.
- **Honest off state.** When no model is enabled or nothing concrete is found,
  the worker sees one quiet line, not an error.

## 4. Skill states (must stay separate — doctrine §15, §19)

| Required state | Modelled | Where |
|---|---|---|
| Detected | ✅ | `recognized_from_text`, display-only |
| Suggested | ✅ | journal / CV suggestions, `needs_confirmation` |
| Worker-confirmed | ✅ | `profile_skill_claims` (self-declared) |
| Repeatedly-observed | ⚠️ not yet a distinct tier | today `work_journal` is binary (≥1 link); follow-up: derive a "seen in N entries" count (display-only, no schema change) |
| Employer-confirmed | ✅ | `worker_skills.verified` / `manager_confirmed` — **owner/manager only, never auto-set** |
| Evidence-supported | ✅ | `worker_skills.source = work_journal` |
| Outdated | ⚠️ partial | per-entry `stale_needs_review`; no profile-level freshness yet (follow-up) |

The **confirmation boundary** — "the system thinks this" vs "I confirmed this"
vs "an employer confirmed this" — is cleanly separated everywhere and is never
crossed without a human. That is the launch-critical invariant, and it holds.

## 5. Plain-language rule for AI output

Enforced by `scripts/check-worker-plain-language-copy.ts` (CI, en + lt). It
scans the worker-facing copy namespaces — the base catalog plus the `journal`
and `labourMarket` UI namespaces — and fails on `parser`, `provenance`,
`classification`, `confidence score`, `extraction`, `pipeline`, `(AI)` tags and
similar implementation wording. Pure domain-term catalogs (skill / profession /
unit names) are intentionally out of scope, since words like "extraction" are
legitimate job names there. Admin / company / billing namespaces are excluded
(sophisticated users). AI output is always framed as a reviewable suggestion in
plain words, and the numeric confidence score stays hidden from viewers per
doctrine §15. Guard scope is deliberately narrow and high-signal — it is a
regression net for the worker spine, not a claim of exhaustive coverage.

## 6. What is NOT claimed

- No claim that an LLM "understands" a CV in production. It is deterministic
  parsing today; the model path is off and honestly disclosed.
- No claim of profession or location auto-detection from CVs (documented gaps).
- No claim that skills are verified by AI. Verification is human, always.
