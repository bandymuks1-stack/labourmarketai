# TASK 05 — One Real Demand Intake (Roadmap Phase 3 · Slice 3.1)
**For:** Claude Code (executor) · **From:** Chat Claude (architect) · **Date:** 2026-05-30
**Where it fits:** `docs/PHASE3_first_customer_plan.md` → Slice 3.1. This is the staged `feat/cc/demand-consolidation` follow-up.
**Branch:** `feat/cc/demand-consolidation` · **Tier:** 🟡 (touches demand schema) → migration committed, gate before apply.

> Direction toward a goal, not a boundary. The sketch is a floor, not a ceiling. Firm lines are the Guardrails. Go broad — leave exactly ONE way to express demand.

## THE GOAL
A real company must be able to express a real need **in-product**, captured on **one canonical intake** — not by hand, not through three overlapping paths. Today demand is split: `customer_requests` (the live, canonical one) plus `pilot_drafts` and `leads` wired to shipped CTAs. This slice makes the canonical intake the single front door for company demand, so when the first pilot company says "we need X," it lands cleanly in one place that the rest of the platform can build on. When done, a logged-in company can submit a need through the product, see it captured honestly, and there is exactly one demand model underneath — no parallel residue.

## HOW IT FITS THE WHOLE
Phase 5's matching engine, the marketplace, and AI all assume ONE trustworthy demand signal. Consolidating now — while volumes are ~0 and it's cheap — prevents the exact split-brain we spent this effort killing, and gives the first real customer a clean way to tell us what they need.

## READING ORDER
`docs/PHASE3_first_customer_plan.md` → `docs/PROJECT_ROADMAP.md` → `PLATFORM_DOCTRINE.md` → `AGENTS.md` → `CLAUDE.md` → `TASKS.md` → this file.

## GUARDRAILS (firm)
- **ONE intake, no third path:** `customer_requests` (+ `customers`, `customer_request_attachments`) is canonical. Fold `pilot_drafts` (0 rows) into it (a `status='draft'` / type field — your call) and **repoint the live Phase-9 sales-offer / pilot-request CTAs** onto the canonical intake.
- **`leads` — DECIDE, do not auto-retire.** Determine if it's a true duplicate of `customer_requests` OR a distinct pre-auth/marketing funnel layer (anonymous email capture vs an authenticated structured need). If distinct (likely), KEEP it and document it as intentionally separate — not a competing demand path. Only retire `/api/leads` if genuinely redundant.
- **Canonical model only**; author-written content is multilingual (§2: `language` + `original_text`, viewer sees their language).
- **Honest empty states** — no fake/sample requests in the product.
- **🟡 migration additive + reversible, committed, applied only via MCP after gate approval, never `db push`.** If the fold needs a destructive change, that's RED → stop for review.

## DIRECTION (sketch — floor, not ceiling)
You'll likely: map `pilot_drafts` payload → `customer_requests` fields and fold it (0 rows = no data migration), repoint the shipped sales-offer/pilot-request CTAs to the canonical intake, make the conscious `leads` keep-vs-retire decision and document it, ensure a logged-in company user can submit a need and see it captured (honest empty state when none), and write the canonical-demand decision into PLATFORM_DOCTRINE/TASKS. If anything else is needed so there's exactly one clean demand front door, do it.

## DEFINITION OF DONE (outcome)
- A real company can capture a need through the product, on `customer_requests`, on the canonical model.
- `pilot_drafts` is folded (no parallel draft path); the shipped CTAs point at the canonical intake.
- `leads` is consciously decided and documented (kept-as-distinct or retired-as-redundant) — never left ambiguous.
- Exactly one demand model underneath; gate-passed; proof/privacy intact.

Deliver a draft PR (+ the migration SQL queued for review if 🟡). Report with the one canonical demand path and the `leads` decision stated plainly.
