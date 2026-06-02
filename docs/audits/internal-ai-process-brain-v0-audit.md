# Internal AI Process Brain v0 — Audit

**Date:** 2026-06-02
**Branch:** `feat/cc/internal-ai-process-brain-v0`
**Start gate:** main at `a982f85` includes PR #225 (Profile/CV/Evidence hub) ✓.
**Principle:** deterministic, read-only process assistant. Suggests, explains, links. Never decides, verifies, confirms, or mutates. No external AI/API/network.

---

## 1. Skill / instruction inventory (found)
| Location | Found |
|---|---|
| `.claude/`, `.claude/skills/`, `.claude/agents/` | **none in repo** (repo does not use `.claude/skills`). |
| `docs/agent-os/` | **Agent OS v1** — 10 written read-only operator roles (`cv-profile.md`, `work-journal-evidence.md`, …) with a suggestion-only / no-autonomous-action contract. |
| `docs/agent-goals/`, `docs/policies/`, `docs/audits/`, `docs/PLATFORM_DOCTRINE.md`, `AGENTS.md` | rich existing doctrine + audit/guard conventions. |
| `apps/web/lib/guards/` | source-level guard pattern (vitest) — reused. |
| `apps/web/lib/` | `profile/`, `journal/`, `cv/`, `skills.ts`, etc. — existing read layers reused (no duplication). |
| `~/.claude/skills/` (owner global) | quality stack (graphify, code-review-excellence, frontend-design, better-i18n, a11y-audit, web-design-guidelines, playwright/webapp-testing). Available via the Skill tool; **not** project-managed, not vendored. |

## 2. Skills / instructions added
- **`docs/agent-skills/internal-ai-process-brain-v0.md`** — project-local skill pack (Option B, since no `.claude/skills`). Covers: internal-AI safety contract, data-signal doctrine, UI doctrine, guard doctrine, future stages. **References** (does not duplicate) `docs/agent-os/labourmarket-agent-os-v1.md` and `PLATFORM_DOCTRINE.md`.

## 3. What the brain reads (signals)
From data the profile page already fetched — no new reads, no network:
`hasCv` (saved profile text), `selfDeclaredSkillCount` (worker_skills + free-label claims), `supportedSkillCount` (provenance-derived: `work_journal`/`manager_confirmed`/`verified`), `journalEntryCount`, `hasWorker`.

## 4. What it outputs (structured, explained)
`deriveProfileProcessBrain(signals)` → `{ knownSignals[], missingSignals[], suggestedNextActions[], evidenceLinks[], safetyDisclaimers[] }`. Returns **i18n keys + numeric params only** (never localized strings), so it stays pure and the UI owns copy + LT/EN parity. Each suggestion carries a `reasonKey` ("Why this is suggested") and an href to an **existing** destination (`#profile-edit` or `/dashboard/journal`).

Suggestions it can produce: *Add a description* (no CV), *Add skills* (none declared), *Add a work journal entry* (worker with no entries). When nothing is missing → "The main profile parts are already in place."

## 5. What it cannot do (safety contract)
- Mutate nothing, verify nothing, confirm nothing.
- No external AI / API / network (pure data → data).
- No fake score, no fake confirmed skill, no invented counts.
- No new profile/CV/evidence route — surfaced only in the canonical `/dashboard/profile` hub.
- No automatic-verification wording. The only verify/confirm token in its copy is the **negated** disclaimer "Sistema nieko nepatvirtina automatiškai." / "Nothing is confirmed automatically."

## 6. How this becomes future "Vidi"/internal AI
- **Stage 0 (now):** deterministic read-only assistant (this PR).
- **Stage 1:** journal → skill evidence linkage (provenance-derived support; see the open evidence-support PR).
- **Stage 2:** reviewed AI suggestions / CV extraction — proposed, never auto-applied, human-confirmed.
- **Stage 3:** role-aware process automation with explicit `--apply` approvals (same gate as the Agent OS operator roles).

## 7. Guard coverage
`apps/web/lib/guards/internal-ai-process-brain.test.ts` pins: brain has no network/AI/mutation imports + no Date/random; the five structured output sections + reasons; assistant integrated only on the canonical profile page; names CV+skills+journal together; emits only allowlisted hrefs; no forbidden parallel route; no automatic-verification wording except the negated disclaimer; LT/EN parity; skill pack exists and references Agent OS. Plus `profile-process-brain.test.ts` (7 cases) for the pure logic. Negative controls included.

## 8. Visual evidence
Dashboard auth-gated (routes 307; no session/credentials here) → authenticated screenshots not possible. Build confirms `/lt` + `/en` `/dashboard/profile` compile; guard + unit tests confirm wiring. Evidence: `runtime/review-evidence/labourmarketai/feat-cc-internal-ai-process-brain-v0/EVIDENCE.md`.
