# Low-Cognitive-Load Guidelines v1

**Date:** 2026-07-15 · **Branch:** `feat/launch-blocker-closure-worker-intelligence-v1` · **Baseline:** `origin/main` @ `603cae4a`

Binding design guidelines for every worker-facing screen on LabourMarket.ai.
These exist so the product is understandable to ordinary workers —
construction, factory, driver, welder, cleaner, warehouse, electrician,
installer — **not** to technical users, managers, or AI experts.

This document does not redesign the platform. It sets the rules that new and
existing worker screens must satisfy. It complements — does not replace —
`docs/PLATFORM_DOCTRINE.md` (§7, §7.1, §15, §19 govern AI honesty, skill
trust, and fit-not-rating; the doctrine wins on any conflict).

---

## 1. The one-question test

Every worker screen must answer, at a glance:

> **"What should I do now?"**

It must **not** force the worker to answer:

> "How does the system work?"

If a screen cannot be reduced to one obvious next action, it is too heavy.

---

## 2. One screen → one purpose → one main action

- **One primary action per screen.** Exactly one visually dominant button.
- **Secondary actions are visually quieter** (text links, ghost buttons) and
  few. If there are more than two secondary actions competing, hide the rest
  behind "More" / "Details".
- **No information overload.** Show only what the current step needs. Everything
  else moves behind a disclosure: `Details`, `More information`, `Why?`.
- **Progress is always visible** when a flow has multiple steps: what is done,
  what is the current step, what is missing, roughly how long remains, and
  **why** finishing helps ("a complete profile gets seen by more employers").

---

## 3. Plain language — write for a worker, not an engineer

Words that describe the **implementation** must never appear in a normal worker
flow. Banned in worker-visible copy (they may exist internally and in
admin/superadmin surfaces):

> parser · schema · provenance · hash · validation · registry · import ·
> observation · confidence score · classification · threshold · extraction ·
> pipeline · AI agent · embedding · vector · RLS · RPC · migration · telemetry
> · ingest · normalization · taxonomy · enum · ISO code

Rewrite implementation language into outcomes:

| Don't say (implementation) | Say (worker outcome) |
|---|---|
| "Classification failed" | "We couldn't understand your profession yet — you can tell us." |
| "Confidence threshold not satisfied" | "We're not sure about this one — please check it." |
| "Extraction complete" | "We read your CV. Please check what we found." |
| "Skill observation recorded" | "We noticed this skill in your work." |
| "Validation error" | "Something's missing — here's what to fix." |
| "Import your CV" | "Upload your CV" |

This rule is enforced by
`apps/web/scripts/check-worker-plain-language-copy.ts` (see §8).

---

## 4. No visible seams between internal systems

Internally the profile, CV, Player Card, journal, skills, and evidence are
separate systems. To the worker they are **one guided profile-building
process**. Never make a worker feel they are switching between products, and
never expose internal names for those systems in the main flow.

- The worker builds "your profile" — not "your Player Card", "your evidence
  ledger", or "your capability graph".
- Cross-links between these surfaces read as one journey ("Add today's work"),
  not as navigation between subsystems.

---

## 5. Honest AI, simple words

Follows PLATFORM_DOCTRINE §7 / §7.1. The AI **suggests**; the worker **decides**.

- AI output is always framed as a suggestion the worker reviews:
  *"We found these possible skills. Which are right?"*
- Never state false certainty. If the AI is unsure, say so simply.
- Nothing the AI produces becomes a confirmed profile fact without an explicit
  worker Confirm. Reject and Correct are always one tap away.
- Do not show the worker the numeric confidence score (doctrine §15 hides it
  from external viewers). A worker may see their own progress as friendly
  bins/counts, never as raw numbers or model internals.

---

## 6. Skill states must stay honest and separate

The following states carry different meaning and must never be visually
conflated (see `worker-ai-intelligence-v1.md` for the full model):

Detected · Suggested · Worker-confirmed · Repeatedly-observed ·
Employer-confirmed · Evidence-supported · Outdated

A worker must be able to tell "I confirmed this" apart from "the system thinks
this" at a glance. Confirmed and merely-suggested skills never share the same
styling.

---

## 7. Mobile-first, outdoor-readable

Primary worker devices are phones used on job sites. Every worker screen must
work at **360 px, 390 px, 430 px** widths first.

- Tap targets ≥ 44 px. Primary action reachable with a thumb.
- No horizontal scroll on the worker spine (onboarding, CV, journal, skill
  review, dashboard).
- High contrast for outdoor daylight; never rely on colour alone to convey a
  skill state (pair colour with an icon or word — also an accessibility rule).
- Language switcher reachable on every viewport.

---

## 8. Guardrails (enforced in CI, in lockstep with code)

- **Plain-language guard** — `check-worker-plain-language-copy.ts` fails the
  build if banned implementation wording appears in worker-facing locale
  strings. Scoped to worker namespaces; admin/superadmin/intelligence
  namespaces are excluded.
- **Pilot-honesty guard** — existing `check-pilot-honesty-copy.ts` (no fake AI
  matching / instant hire / auto-verification claims).
- **Fit-not-rating guard** — existing `fit-not-rating.test.ts` (doctrine §19).

A copy change that trips a guard is a launch blocker, not a style nit.

---

## 9. Review checklist (paste into any worker-facing PR)

- [ ] One primary action; secondary actions quiet and few.
- [ ] Screen answers "what do I do now?" without explaining the system.
- [ ] No banned implementation wording in any locale (guard passes).
- [ ] AI output framed as reviewable suggestion; Confirm / Correct / Reject present.
- [ ] Nothing auto-confirmed to a verified record.
- [ ] Skill states visually distinct; confirmed ≠ suggested styling.
- [ ] Progress visible for multi-step flows (done / now / missing / why).
- [ ] Works at 360/390/430 px; tap targets ≥ 44 px; state not colour-only.
- [ ] Raw enums / ISO codes / status codes never shown; friendly labels instead.
