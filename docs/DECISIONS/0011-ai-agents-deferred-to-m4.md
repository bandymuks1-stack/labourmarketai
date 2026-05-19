# ADR 0011 — AI agents deferred to M4 (core first, AI on top)

**Status:** Accepted · **Milestone:** M4+ · **Vision:** PROJECT_VISION.md §9

## Context
The vision includes six AI agent types (sourcing, fit, document prep,
manager decisions, market watch, communication). Building AI into the
core early would couple a probabilistic layer to unproven foundations and
risk dishonest automation.

## Decision
The AI operational layer is built **on top of** a working core, starting
**M4** — not fused with it, not in M0–M3. M0 documents the six agents
only. Hard rule (PROJECT_VISION.md §9): AI assists; risky actions need
human approval; AI never lies, never fakes verification, never
mass-sends or alters documents without permission, never accepts a worker
without a human decision, never creates fake data.

## Consequences
- M1–M3 deliver a deterministic, auditable core (matching is explainable,
  not a black box).
- The AI layer consumes core data/events; it does not own them.
- Honesty/placeholder governance applies to AI output too ("AI
  suggestion" labelling).
