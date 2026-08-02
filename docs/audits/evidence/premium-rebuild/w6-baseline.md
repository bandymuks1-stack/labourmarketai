# W6 — TRUST: BASELINE (acceptance stage, not a rebuild)

Opened 2026-08-02, immediately after
`W5_JOURNAL_EVIDENCE_SKILLS_COMPLETE_WITH_OWNER_GATED_ITEMS` (main
`7621acab`). W6's scope: subjective feedback, journal-derived objective
evidence, reputation. The standing owner ruling (W4 baseline row 23) is the
stage's first law: **no subjective store exists today; nothing may be
fabricated — no stars, no total score.**

Classification: `FULL` · `PARTIAL` · `MISSING` · `BLOCKED` · `DUPLICATE` ·
`OBSOLETE` · `PRODUCTION_PROVEN`, with `PENDING_AUDIT` + exact probe.

## Carried in verified (evidence in the W5 audit records)

| Capability | State | Evidence |
|---|---|---|
| Objective evidence inventory | FULL (inventory) | W5 audit §W6 boundary: `journal_entry_confirmations` (append-only human decisions with actor/org/role/scope), `journal_entry_metrics`, `journal_entry_skills` + provenance, photo continuity, review results (approved/rejected/changes_requested), `worker_skills` trust columns (`verified/verified_by/verified_at`, `source` tier, derived `confidence_score`/`confidence_bin` — all from countable rows), `audit_logs`, learning signals + queue |
| Subjective store | MISSING (guard-pinned absent, BY RULING) | no rating/stars table in any migration; `fit-not-rating` guard bans `trust_score|worker_rating|overall_score|…` in UI; `my-space-human-entry`, `player-card-visualizations`, `w5-live-profile` guards reinforce |
| Dormant `trust_score` columns | OBSOLETE (schema residue) | `organizations.trust_score` (0013:43, mirrored from legacy `companies.trust_score`), `workers.trust_score` — guard-blocked from every surface; DB-drop is a migration (owner gate); render-side they must stay unrendered |
| Confidence model | FULL | `computeConfidence` (score/bin from manager-confirmed entries, self-logged count, unique confirmers, recency) — recomputed on approval; `confidence_bin` rendered honestly |
| Verification honesty | FULL (W5-proven) | verified only per named skill via the gated RPC; auto-confirm writes a real honestly-labelled confirmation row under an owner-enabled policy |

## PENDING_AUDIT — exact probes (first W6 work items)

| Capability | Probe |
|---|---|
| Trust presentation | Where do confidence bins / verified tiers / confirmation counts actually RENDER today (card, CV, person page, scouting) — and where do they render inconsistently? Map every trust-signal render with file:line |
| Reputation derivation candidates | What could a purely objective reputation read derive from the inventory (confirmation density, confirmer diversity, recency, photo-backed share) — inventory the options WITHOUT building; each needs an honesty test: can a worker game it, can an org fake it |
| Subjective feedback scope | What feedback do owners/managers already leave (review notes, `changes_requested` reasons)? Classify what exists vs what a subjective layer would ADD — the ADD list goes to the owner, never built unprompted |
| Trust-signal leakage | Do any trust signals cross the W4 permission matrix boundaries (employer/anon seeing bins or counts they shouldn't)? Verify against `w4-permission-matrix.md` |
| Learning auto-confirm usage | Is any auto-confirm policy enabled in prod (real rows?) — the honest state of the one automated trust writer |

## Rules carried forward

- No fabricated reputation, stars, or single scores — the owner ruling is a hard gate on the whole subjective half; inventory + proposal only, decision goes to the owner ONCE.
- Objective derivations must be count-based, explainable in one sentence, and render with their inputs inspectable (the W5 drill-down precedent).
- Never render the dormant `trust_score` columns.
- ONE reputation engine if any is ever built — no parallel derivations.
- Production acceptance stays local-stack until `PROD_QA_*` is provisioned (standing).

---

## SLICE LOG

### Slice 1 — trust presentation truth (this PR)
ONE canonical `EvidenceTier` module (`lib/evidence/evidence-tier.ts`): `verified === true` is the ONLY path to the top rung (an inconsistent manager_confirmed-source row never inflates — the first draft of this very slice got that wrong and the existing CV honesty guard caught it); the four parallel interpretation sites (match-v1, evidence-visuals, person page inline, cv skill-tiers) now derive from it, keeping their render tokens. ONE canonical lexicon (`evidenceTier` namespace, 11 keys × 12 locales; Danish translated for the ratcheted debt): "Patvirtinta vadovo įrašu / Pagrįsta darbo žurnalo įrašais / Pateikta paties" + entry/count/confirmations families; ~20 surface keys aligned; "Susieti įgūdžiai" (Linked skills) and "Marked accurate by others" eliminated and guard-banned. Auto-confirm honesty: `rowIsAutomatic` + qualifier on the decision timeline, CV proof table and inbox note — automatic never renders identically to hand-confirmed. `confidence_bin` dots gained their 3-item evidence-assurance legend; the numeric score stays unrendered (guard-pinned). **DOCTRINE TRANSITION recorded in four guards** (silent-trust-wording, cv-friendly-copy, no-disclaimer-ui, worker-facing-copy-exhaustive): the old "neutral records language, never who confirmed it" rule is replaced by the W6 precise-origin rule — a certification stem without a named origin is still banned, the vague class ("With records", "Reviewed records") is now banned, PERSON-certification visuals and platform-endorsement claims stay banned. Owner-gated item 10 widened with L4 (`worker_skills` trust columns incl. `verified_by` UUID); L5 recorded as a boundary note. Proof: new guard `evidence-tier-lexicon` + `review-status-automatic` tests; full vitest 12569/12569; browser `w6-tier-lexicon.spec.ts` 5/5 (worker profile + employer person page + CV, desktop + 375px, seeded auto-confirm row, no stars/scores/numeric confidence anywhere).

### Slice 2 — computeConfidence containment (this PR)
Caller map pinned: ONE writer (`confirm-actions.ts` approval recompute, columns `confidence_score/bin/last_recompute_at` only), ONE render (profile bin dots + slice-1 legend), zero other consumers. Containment: `SELF_LOGGED_CONFIDENCE_CAP = 15` — the self-logged term is capped BELOW the ≥30 substantiated boundary, so 30/100/10 000 unconfirmed self entries read as honest early evidence (green), never substantiation; crossing requires manager confirmations / distinct confirmers / real recency. Scope doctrine written into the module: evidence assurance for a skill's records — never reputation/trust/person score, never renamed, never merged with experience counts. Truth-table tests: self-only volumes never yellow; cap < 30 by construction; real confirmations cross honestly; photos/streaks/learning-signals are not and cannot become inputs (type + source pins on the module AND its only writer); no reputation-named exports; the writer never sets `verified`. Existing formula tests unchanged (no case exercised self>15 — W5 pipeline behaviour preserved). Full vitest 12574/12574. Browser: no visual change by design — the same dots, honest earlier.
