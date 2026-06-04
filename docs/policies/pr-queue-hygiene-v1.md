# PR queue hygiene v1 — RED/human-gate drafts are separated from ready PRs

Goal: the owner should always see **one clear next action**, never a mixed pile
of open PRs. This policy defines the lanes and the invariants that keep them
separable, plus a one-command board (`scripts/pr-board.mjs`).

## Lanes

Every open PR falls into exactly one lane:

| Lane | Definition | Owner action |
|------|------------|--------------|
| **READY** | `draft = false` AND no `needs-human-gate` label AND required checks (`quality`, `migration-safety`) green | Review → merge (or it auto-merges per the envelope) |
| **RED / human-gate** | `draft = true` AND `needs-human-gate` label (title also prefixed `[RED/needs-human-gate]`) | Read the migration SQL + RLS diff in the body; approve or decline. **Never merged by the agent.** |
| **WIP draft** | `draft = true` AND no `needs-human-gate` label | None yet — still being built |

## Invariants (the "rule")

1. A PR in the **RED class** (unguarded `drop`, missing rollback, RLS-loosening,
   auth-core change, destructive data op, new secret, billing, live outreach —
   see the Auto-merge Safety Envelope in `CLAUDE.md`) MUST be:
   - opened as a **draft**, AND
   - carry the **`needs-human-gate`** label, AND
   - prefix its title with **`[RED/needs-human-gate]`**.
2. A **READY** PR MUST NOT carry the `needs-human-gate` label and MUST NOT be a
   draft. Flipping a RED PR to ready is an owner decision, not the agent's.
3. The agent merges only READY PRs. It never removes draft status from, or
   merges, a `needs-human-gate` PR.
4. These three signals (draft + label + title prefix) are redundant on purpose:
   the label is the machine-filterable source of truth
   (`gh pr list --label needs-human-gate`), the title prefix is the human one,
   the draft flag is the hard merge stop.

## The check / board

`node scripts/pr-board.mjs` prints the open PRs grouped into the three lanes
with counts and the single recommended next action. It is read-only (no merge,
no label changes) — a reporting lens, safe to run anytime.

Current human-gated drafts at the time of writing (do not merge — owner-gated):
#240, #183, #172, #171, #168. The only READY merge candidate was #250
(company profile request + multi-sector skills), now merged.
