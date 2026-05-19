# ADR 0010 — Nine priority launch markets

**Status:** Accepted · **Milestone:** M0+ · **Vision:** PROJECT_VISION.md §4

## Context
The platform needs focus at launch but must not bake market assumptions
into the core.

## Decision
Nine equal-priority launch markets from day one:
**LT, LV, EE, NL, DE, DK, NO, SE, PL** — the full Baltic (LT/LV/EE
together, none demoted), key Nordic (DK/NO/SE) and Central-European
anchors (NL/DE/PL). All rendered at equal visual weight on the LiveMap
(full brand-blue border + activity-intensity glow); rest of Europe is dim
"expansion candidate" context. **Architectural requirement:** adding a
country after the first 9 must require no core schema migration and no UI
rework.

## Consequences
- `countries` reference data + map target tier = exactly these 9.
- Legend reads "Active markets (9)" / "Expansion candidates" — no
  intermediate tier.
- Country is data everywhere (text/code), never enum'd into core logic.
