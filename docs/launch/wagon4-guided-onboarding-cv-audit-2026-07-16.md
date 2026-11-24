# Wagon 4 — Guided Onboarding and CV Understanding: fact audit + slice (2026-07-16)

Branch `feat/guided-onboarding-cv-understanding-v2` from main `fd882a7b`.

## What the doc asked vs. what main already has

| Doc requirement | Current main state | Verdict |
|---|---|---|
| CV pipeline: validation → extraction → suggestions → review → explicit confirm → persistence | **Fully real and honest** at `/dashboard/profile`: `lib/cv/extract.ts` (unpdf/mammoth/TXT, 5 MB cap, stateless, never logs text), `lib/cv/structured-parse.ts` (deterministic, multi-locale lt/en/ru/de/nl, honest confidence bands never shown as numbers), `cv-import-section-review.tsx` (per-item confirm/edit/remove, `pending→saving→saved/discarded/conflict/needs_migration/error`), persistence via canonical RPCs (`save_self_declared_work_history_v1` — applied to prod 2026-07-16, `save_worker_language_v1`, `save_worker_card`, availability v1/v2). Never auto-confirms; never silently overwrites (conflict state). | **Already delivered** (strongest part of the wagon). |
| Failure recovery (unreadable/unsupported/oversized/empty/partial/network) | Client fast-fail + server 413/415/422 + specific `role="alert"` messages (`cv-import-upload.tsx:39-54`) | **Already delivered.** (No explicit duplicate-file dedupe — duplicate *suggestions* are deduped downstream; noted as acceptable.) |
| Security: private storage, signed URLs, deletion, no CV text in logs | **No CV file is ever stored** — extraction is stateless request/response for the authenticated owner only; only coarse error codes logged; telemetry counts only. Confirmed data lands in owner-only RLS tables. | **Already delivered** (stronger than the spec — nothing to delete or leak). |
| Guided journey: registration → work goal → experience → review → location → availability → profile ready | Onboarding wizard = 2 steps (role; name+country) → straight to dashboard. The journey pieces exist but are NOT stitched; no work-goal/review/availability/ready stages anywhere in one flow. | **THIS WAGON.** |
| Never show model confidence values | Parser keeps `high/medium/low` internal; review UI shows words, not numbers | Already delivered; the new guard also bans it in the journey. |
| Education/certificates/achievements sections | Confirm paths exist but degrade honestly to `needs_migration` — `20260714160000_worker_education_achievements_v1` is **owner-gated, NOT applied** (ledger Deferred) | Out of this wagon (owner gate). Honest degradation verified. |

## Changes in this slice (assembly, not a new subsystem)

1. **`components/app/worker-setup-journey.tsx`** (new) — the guided journey as a
   guide over canonical surfaces: five steps in the doc's order + ready state,
   each linking to the EXISTING form (profession picker + CV import + review at
   `#profile-edit`, work-card location at `/dashboard#work-card`, availability
   at `#cv-availability`). Done-states derive 1:1 from the real readiness
   signals (`deriveWorkerReadiness` — row counts, no score, no percentages).
   Self-gates to workers (`getWorkerPlayerCard() === null` → renders nothing).
2. **Profile page** mounts the journey under the quick nav (`#setup-journey`).
3. **`completeOnboarding`**: a fresh WORKER now lands on
   `/dashboard/profile#setup-journey` (was: bare `/dashboard`) — registration
   flows straight into the guided journey. Company/agency/customer unchanged.
4. **i18n**: `setupJourney.*` namespace added to ALL 11 served locales
   (lt en ru de nl pl et lv no sv da) — purely additive (+319 lines).
5. **`lib/guards/wagon4-setup-journey.test.ts`** (new, 18 tests) — pins: guide
   mounted + worker landing; real readiness signals only (no score/percent/
   confidence); self-gating; anchors exist on target pages; journey copy
   complete AND architecture-free in every served locale.

## Explicitly NOT done (with reasons)
- The onboarding wizard itself keeps its 2 steps — identity capture stays
  minimal; the journey lives on the canonical profile surface (doc: "help the
  user finish the important actions, not create a separate subsystem").
- No application of the owner-gated `20260714160000` migration.
- No changes to the CV pipeline (already real + honest).
- No duplicate-upload dedupe (downstream suggestion dedupe covers the harm).
