# Skill / Instruction Pack — Internal AI Process Brain v0

> Project-local agent skill pack. This repo has **no** `.claude/skills/`, so per the
> task's Option B this lives under `docs/agent-skills/`. It extends — does not
> replace — the existing read-only operator doctrine in
> [`docs/agent-os/labourmarket-agent-os-v1.md`](../agent-os/labourmarket-agent-os-v1.md)
> and the binding [`docs/PLATFORM_DOCTRINE.md`](../PLATFORM_DOCTRINE.md) (§7: no fake
> AI / verification). When this pack and the doctrine disagree, the doctrine wins.

## Purpose
A durable contract for building the internal "process brain" — the layer that
helps a worker connect CV, skills and work-journal evidence into one clear
profile view. v0 is a **deterministic, read-only process assistant**: it
suggests, explains, and links. It never decides, verifies, confirms, or mutates.

## Existing skills/instructions to reuse first (inventory)
- **Repo:** `docs/agent-os/` (10 read-only operator roles incl. `cv-profile.md`,
  `work-journal-evidence.md`), `docs/agent-goals/`, `docs/policies/*`,
  `docs/PLATFORM_DOCTRINE.md`, `AGENTS.md` (auto-commit + merge envelope),
  `apps/web/lib/guards/*` (source-level guard pattern), `docs/audits/*`.
- **Existing product layers to build on, not duplicate:** the canonical
  `/dashboard/profile` hub (`profile-hub-overview.tsx`), `worker-evidence-card`,
  `profile-cv-clarity-card`, `cv-engagement-cards` (real `worker_skills.source`
  provenance badge), `lib/profile/*`.
- **Owner global Claude skills** (`~/.claude/skills/`, available via the Skill
  tool, NOT project-managed): graphify, code-review-excellence, frontend-design,
  better-i18n, a11y-audit, web-design-guidelines, playwright/webapp-testing.
  Use these for review/i18n/UX passes; do not vendor them into the repo.

## 1. Internal AI safety contract
- **Suggestion-only.** Output is advice, never an action.
- **Evidence-linked.** Every suggestion points at an existing canonical
  surface (`#profile-edit`, `/dashboard/journal`).
- **Human-approved.** Nothing changes without the user acting themselves.
- **No automatic verification.** The brain never sets verified/confirmed.
- **No silent profile mutation.** Pure data → data; no writes, no server action.
- **No fake score / no fake confirmed skill.** No invented numbers; counts come
  straight from already-fetched signals.

## 2. Data signal doctrine
- **CV / description** = provided / self-claimed / document source — *not proof
  by itself*.
- **Self-declared skills** = user claims.
- **Work journal** = operational evidence source (the worker's own entries).
- **Manager / client approval** = a *stronger* evidence/verification source —
  the only real human flow (`confirm_entry_and_verify_skills` →
  `worker_skills.source='manager_confirmed'`), surfaced elsewhere, not minted here.
- **AI suggestion** = a suggestion, not truth.

## 3. UI doctrine
- One canonical profile/CV/evidence hub: `/dashboard/profile`. **No** parallel
  CV/profile/evidence route or page.
- No disconnected feature islands — the assistant names CV + skills +
  journal/evidence together.
- Every suggestion explains **why** (a reason line). No bare CTAs.

## 4. Guard doctrine
- Block `verified` / `confirmed` / `patvirtinta` / `patikrinta` wording in this
  layer unless it is a real, already-allowed human/document flow (the only such
  affirmative wording lives in `cv-engagement-cards` for `manager_confirmed`).
  Honest negations ("Nothing is confirmed automatically.") are allowed and
  asserted as negations.
- Block network/API calls in v0: the brain imports no `fetch`, `supabase`,
  `http`, `openai`, `anthropic`, `axios`, no server action / mutation.
- Require structured reasons + evidence on every suggestion.
- Require LT/EN copy parity.
- Keep the canonical profile route as the only integration point.

## 5. Future stages (deferred)
- **Stage 0 (now):** deterministic read-only process assistant (this pack).
- **Stage 1:** journal → skill evidence linkage (provenance-derived support).
- **Stage 2:** reviewed AI suggestions / CV extraction suggestions — proposed,
  never auto-applied, always human-confirmed.
- **Stage 3:** role-aware process automation **with explicit approvals** (same
  `--apply` gate as the Agent OS operator roles).

## Where v0 is implemented
- Brain (pure): `apps/web/lib/process-brain/profile-process-brain.ts` (+ test).
- UI: `apps/web/components/app/profile-process-assistant.tsx`, rendered in the
  `/dashboard/profile` hub only.
- Guard: `apps/web/lib/guards/internal-ai-process-brain.test.ts`.
- Copy: `processAssistant` namespace in `messages/{lt,en}.json`.
