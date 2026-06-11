# Adaptive Skill Discovery (Design + Core, v1)

**Slice:** `adaptive-skill-discovery-v1`
**Status:** pure core + design. Establishes the principle and the deterministic
logic; the clarify UI + candidate persistence + the player-card surface land in
follow-up slices.

> Worker-first principle: a real worker's vocabulary is bigger than any
> catalogue. An unknown skill is a **candidate signal, not an error**. Nothing is
> auto-verified, AI-mapped, or fabricated.

---

## 1. What exists already
`profile_skill_claims` stores **self-declared, free-label** skill claims
(`label` + `normalized_label`, `source`, trust posture `self_declared`). So the
store for "arbitrary worker skills" already exists and already treats unknown
labels as legitimate (not errors). The catalogue is `skills` (slug, category,
`name_lt`/`name_en`); related: `professions`, `profession_skills`,
`worker_skills`, `platform_skill_aggregates`.

## 2. This slice — the pure core (`lib/skills/candidate-skills.ts`)
- **`classifySkillInput(raw, known)`** → `known` (matches the catalogue by
  normalized slug/name) or **`candidate` (`needsClarification: true`)**. Unknown
  is never an error; empty input returns null.
- **`SkillClarification`** — the prompts a worker answers for a candidate: *how
  you call it · related to (trade) · tools/materials · often goes with*. Never
  auto-filled; blanks stay blank.
- **`coOccurrencePairs(workerLabelSets)`** — counts, per unordered label pair, how
  many workers declared both. A deterministic **signal for human review**, not a
  generator of professions or verifications.
- **`CANDIDATE_TRUST = 'self_declared'`** — candidates are explicitly **not
  verified**.

## 3. Honesty boundaries (pinned by the guard)
- unknown skill → candidate, **never an error / never dropped**;
- candidate is **self-declared / needs-clarification**, **never "verified"** and
  never AI-comprehended;
- co-occurrence is a **review signal only** — it does not auto-create a profession
  or cluster;
- clarify fields are worker-provided; nothing is invented.

## 4. Follow-up slices
1. **Clarify capture** (additive: candidate clarify fields or a small
   `skill_candidate_clarifications` table; a worker-owned RPC) + the clarify UI.
2. **Player-card surface** — candidate skills shown as *self-declared /
   needs-clarification* (distinct from verified), linked to work journal /
   documents / project context / confirmations.
3. **Owner/human review** path for new skill clusters / profession profiles
   (co-occurrence feeds it; a human decides).

## 5. Next
Worker-first avatar / player-card v1 + "My Work Space" (Section F) — where these
candidate skills, evidence, confirmations, and the safety-communication status
come together, worker-first.
