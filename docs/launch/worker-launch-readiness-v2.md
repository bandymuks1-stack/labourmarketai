# Worker Launch Readiness v2

**Date:** 2026-07-15 · **Branch:** `feat/launch-blocker-closure-worker-intelligence-v1` · **Baseline:** `origin/main` @ `603cae4a`

Worker-side launch readiness, focused on making LabourMarket.ai understandable
to ordinary (non-technical) workers before any advertising. Complements — does
not replace — `launch-blocker-register-v1.md` (PR #764, company-side +
measurement). This sprint deliberately does **not** duplicate #764's company
fixes; it closes the worker-intelligence and cognitive-load items #764 left open.

**Terminal state:** `DRAFT_PR_GREEN_READY_FOR_LIMITED_WORKER_ACQUISITION`
(conditional on the owner-gated items in §4 — none of which are code).

---

## 1. What this sprint changed (code, this PR)

### Cognitive load / plain language
- **Onboarding country picker** now shows real localized country names
  ("Lietuva", "Nyderlandai") instead of raw ISO codes ("LT", "NL") on the very
  first screen. (`components/app/onboarding-wizard.tsx`, via `Intl.DisplayNames`
  — no new i18n keys.)
- **Worker-intake form** no longer asks workers to type ISO codes: the
  `"NL, DE"` / `"en, lt"` placeholders are gone and the help text now says
  "countries where you want to work … (for example: Netherlands, Germany)".
  Server parsing is format-agnostic and only feeds a reviewable suggestion, so
  this is safe.
- **Privacy page** never renders a raw database code: `contextType` and
  disclosure field keys fall back to humanized labels instead of
  `chat_message`-style identifiers.
- **Technical-wording leaks removed** from worker copy (en + lt fully; verbatim
  English leaks cleaned in other locales):
  - "Some entries are not clearly **classified**" → plain wording
  - "**Detected** CV sections" → "What we found in your CV"
  - "**Detected** skills" → "Skills we spotted"
  - "CV text is **structured into a profile automatically**" → "We read your CV
    and turn it into a profile you can review"
  - "**Normalized** role" → "Role"
  - "certification **registry**" → "certificate listing"
  - "import a CV" → "upload a CV"
  - journal "**(AI)**" / "**(KI)**" acronym tags removed (en, lt, nl, de, ru)

### Worker AI honesty (see `worker-ai-intelligence-v1.md`)
- **Journal skill recognition now supports Confirm / Correct / Reject.** The
  missing "Correct" is added: a suggested skill appears in an editable field the
  worker can fix before saving. Nothing auto-confirms.
- Journal suggestion labels no longer advertise "AI" (the live engine is a
  deterministic recognizer; the model path is off by default and honestly
  disclosed).

### Durable guardrail
- **New CI guard** `check:worker-plain-language` fails the build if
  implementation wording (`parser`, `provenance`, `classification`,
  `confidence score`, `extraction`, `pipeline`, `(AI)` tags, raw enums …) leaks
  into worker-facing en/lt copy. Wired into `quality.yml` and protected by the
  existing `ci-honesty-copy-wiring.test.ts` so it can't be silently dropped.
- **New guideline doc** `low-cognitive-load-guidelines-v1.md` — binding rules +
  a per-PR review checklist.

## 2. Worker journey — state after this sprint

| Step | State | Note |
|---|---|---|
| Landing → identity → registration | ✅ works | #764 added funnel measurement |
| Google / email login | ✅ works | consent-screen host is owner-gated (§4) |
| Onboarding (name + country) | ✅ simplified | country names, single action |
| CV upload → review | ✅ review-gated | profession/location extraction = documented follow-up |
| Skill confirmation | ✅ Confirm/Correct/Reject | honest states |
| Daily journal → skills | ✅ real loop | mandatory requirement met |
| Availability / profile ready | ✅ works | |
| Dashboard → opportunities → return | ✅ works | density noted in §3 |

## 3. Known, documented, NOT faked

- **CV profession & location extraction** — real gaps; additive follow-up, not
  blocking a worker-acquisition launch (profession is captured in onboarding).
- **"Repeatedly-observed" and profile-level "outdated" skill tiers** — partial;
  display-only follow-ups, no schema change needed.
- **Dashboard home & journal density** — many cards compete with the primary
  action. The `DashboardNextAction` top-slot is the right anchor; a fuller
  de-densification is a design follow-up, deliberately not gutted here (risk).
- **Some CV sections require migration `20260714161000`** to persist — honestly
  surfaced in the UI; applying it is an owner action.

## 4. Owner-gated — NOT code, carried from `launch-blocker-register-v1.md`

- **P0** Apply migration `20260713190000` (company intake queue grant).
- **P0** Worker supply is far below an employer promise → run
  **worker-acquisition first** (this sprint targets exactly that audience).
- **P0** Google consent screen shows the `supabase.co` host → Google/DNS config.
- Legal binding wording (retention, legal bases, Terms) → owner/lawyer.
- Apply migration `20260714161000` (CV self-declared section persistence).

## 5. Validation

See the PR description for the exact command results (`typecheck`, `lint`,
`test`, `build`, `check:worker-plain-language`, `check:i18n-debt`,
`check:primary-route-smoke`, `check:public-seo-indexing`).

## 6. Launch call

**`READY_FOR_LIMITED_WORKER_ACQUISITION`** on the code axis: the worker journey
is simpler, the AI is honest and review-gated, the journal skill loop is
complete, and technical wording is out of the worker spine. Full public launch
(employer side) stays blocked by the owner-gated P0s in §4.
