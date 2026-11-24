# PACKAGE C — AI PROVIDER DECISION MATRIX (owner decision required)

Basis: W4/V9 audits (VERIFIED_LOCAL @ main). Current state: `AI_PROVIDER_MODE=disabled`,
0 runs ever (usage_cost_events=0, ai_runs=0 VERIFIED_DB). Nothing user-facing depends on AI
today — every AI touchpoint degrades honestly (deterministic recognizers carry the product).

## What exists (no build needed, only a decision + config)
- Provider adapters SHIPPED: local (OpenAI-compatible self-host: Ollama/LM Studio/vLLM),
  anthropic, openai, gemini, xai, deepl (translation), mock/disabled.
- Free-first chain (PR #1103): cost class free_local → free_tier → paid; honest 3-way
  degradation; per-task USD budget caps enforced (cost-aware routing contract, $0.00–0.20/task).
- Cost ledger built+guarded+empty: ai_runs (27 cols, append-only) + usage_cost_events
  (EUR cents, pinned FX 0.86, no-fabricated-zero CHECKs). Admin telemetry surface exists.
- Data sensitivity filter exists (data-sensitivity.ts); model ids pinned in one file.

## What AI would actually power (currently dormant)
1. Journal→profile/CV AI suggestions (deterministic layer already works without it)
2. CV AI structuring enhancement (deterministic parse already works)
3. AI locales: today hard-capped en/lt/ru; NL/DE users would get silent EN → fix is a
   constant + prompt variants AT ACTIVATION (recorded in W4-B audit)
4. translate_message task (DeepL adapter; char-priced, not in token table)
5. Future: value-statement enrichment (V9/V10 foundation is deterministic BY DESIGN — AI not required)

## OPTIONS

| Option | Cost | Privacy/region | Capability | Commitment |
|---|---|---|---|---|
| O1: stay disabled | €0 | none | deterministic only (current product) | none |
| O2: local self-host (AI_LOCAL_*) | infra only (owner VPS/GPU) | data stays owner-controlled | small-model quality; multilingual weak-to-fair | no new third party — NO legal gate |
| O3: Anthropic paid (haiku/sonnet tiers) | $1-3/MTok in, $5-15/MTok out (list); per-task caps ≤$0.20 | US/EU processing — needs DPA + subprocessors update (#1149 list promises update-first) | strong incl. LT/NL/DE | NEW commercial+legal commitment → OWNER_GATED |
| O4: DeepL only (translation) | per-char; free tier exists (:fx keys) | EU company | translation only | small commitment; still a new subprocessor → OWNER_GATED |

## RECOMMENDATION
O2 first (zero legal gate, proves the chain end-to-end, feeds real cost/latency telemetry into
the empty ledger), THEN evaluate O3 with real usage data — this also unblocks ECONOMIC_SAFETY
evidence honestly. O3/O4 require: owner approval + DPA + subprocessors-list update (promised
public behavior) + budget ceiling decision.

## OWNER DECISION REQUIRED
1. Pick O1/O2/O3/O4 (or sequence). 2. If O2: provide AI_LOCAL_BASE_URL host + model.
3. If O3/O4: approve commitment + monthly budget cap + DPA review. 4. AI locale set at
activation (en/lt/ru → +nl/de). Until then: AI_PROVIDER = OWNER_GATED/CONFIGURATION_GATED,
paid worker plans remain unsellable (they'd sell nothing).
