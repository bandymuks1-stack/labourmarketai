# Workforce Requirements Contract v1

Status: ACTIVE (Labour Market OS P2 — work breakdown / requirement derivation)
Date: 2026-07-13

## The rule: deterministic derivation, human confirmation

`apps/web/lib/workforce/work-breakdown.ts` turns one future work entry into
suggested requirement lines using DICTIONARY/RULE derivation only — no LLM,
no IO, no randomness. The same entry + catalogue always derives the same
lines. A machine NEVER confirms a line.

## Derivation rules

| Rule id | What it derives | Confidence contribution |
|---|---|---|
| `crew-from-structured-demand` | One crew line per entry. Profession: the catalogue profession covering the MOST owner-stated skills (reverse `profession_skills` index; ties break alphabetically) → medium signal; fallback: title tokens matching a profession slug (every slug token must appear) → low signal; else `professionSlug: null` + undetermined. Headcount: the owner-stated team size; else 1 + undetermined. Hours: `hours_per_week × headcount × ceil(inclusive days / 7)` — only when all inputs are real. Skills: owner-stated first; else the chosen profession's catalogue skills (explanation labels them implied). Certificates / languages: passed through from the owner's own structured_v2 statements. Partner need: from `target_supply = company` or subcontract/service_request opportunity. | high = stated headcount AND skills-derived profession; medium = one of the two; low = neither |
| `supervisor-team-of-5` | Crews of `SUPERVISOR_TEAM_THRESHOLD` (5) or more get ONE suggested supervisor line (profession `foreman` when the catalogue has it, headcount 1). Rationale: 5 is the smallest crew the staffing model treats as brigade-scale and the catalogue's coordinating profession exists exactly for it. | high (the rule itself is certain; the NEED is still only suggested) |

## Every derived line carries

```
source:       "deterministic:<rule-id>"   (or "human" after an edit)
explanation:  human-readable trace of every decision
confidence:   "high" | "medium" | "low"
status:       "suggested"                 (always — derivation cannot confirm)
undeterminedFields: what a human must decide (headcount, profession,
                    skills, hours, startDate…)
```

Missing inputs become `undeterminedFields`, never invented values.

## Human confirmation contract (pure transitions)

| Transition | Effect |
|---|---|
| `confirmRequirement(plan, id, by, atIso)` | suggested/edited → `confirmed`; stamps `confirmedAtIso`/`confirmedBy` on the plan. The ONLY path to `confirmed` in the whole workforce layer (guard-pinned: the literal assignment exists once, in this file). Rejected lines and unknown ids are no-ops. |
| `editRequirement(plan, id, patch)` | applies a bounded patch, status → `edited`, source → `human`. An edit is a human statement but NOT a confirmation; editing a confirmed line drops it back to `edited`. Rejected lines are not editable. |
| `rejectRequirement(plan, id)` | status → `rejected`; the line stays in the plan as an honest record and is excluded from capacity/gap work. |

All transitions are pure (new plan returned, input untouched) and persisted
as `payload.workforce_plan` via the existing `save_demand_draft` RPC (see
future-work-planning-contract-v1.md).

## Guards + tests

- `lib/workforce/work-breakdown.test.ts` — rule determinism, confidence
  grades, undetermined fields, supervisor threshold, every transition,
  no-auto-confirm.
- `lib/guards/workforce-canonical.test.ts` — `status: "confirmed"` is
  assigned exactly once (confirmRequirement); derivation emits only
  suggested lines; module purity.
