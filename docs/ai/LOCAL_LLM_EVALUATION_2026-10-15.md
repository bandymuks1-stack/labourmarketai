# Free / open LLM evaluation for LabourMarket.ai — 2026-10-15

**Owner directive 2026-10-15** ("NEMOKAMO LLM ATRANKA"): before deciding on paid Gemini or a server, evaluate EuroLLM, Mistral and Qwen through the existing `AI_LOCAL_*` integration.
- Use synthetic data only.
- Buy nothing.
- Pick the cheapest option of sufficient quality.
- Pilot it only if existing infrastructure is enough.

## 1. Method (what was actually run)

- **Machine:** the only infrastructure available without buying anything.
  - Owner laptop: AMD Ryzen 5 7520U (4 cores / 8 threads), 16 GB RAM, no usable GPU (Radeon 610M), Windows.
  - Ollama 0.40.4 installed with owner permission.
- **Models** (Q4 quantisation, Ollama):

| Model | Size | License | Languages (official) |
|---|---|---|---|
| **EuroLLM-9B-Instruct** (bartowski Q4_K_M GGUF) | 5.6 GB | Apache 2.0 | all 24 EU languages + Norwegian, Russian, Ukrainian, … |
| **Qwen3-8B** | 5.2 GB | Apache 2.0 | broad multilingual |
| **Mistral NeMo 12B** | 7.1 GB | Apache 2.0 | EN, FR, DE, ES, IT, PT, ZH, JA, KO, AR, HI — **not LT, SV, NO, DA, FI or PL** |

  Mistral Small 24B (~14 GB) does not fit 16 GB RAM alongside the OS, so NeMo 12B stood in as Mistral's open model.
- **Path:** the **production agent path**: `runAiAgentCore` with the real registry prompts, the egress gate, the strict output schemas, and the `local` provider adapter (OpenAI-compatible).
  - Only the production *latency ceilings* were lifted, inside the evaluation process, so quality could be measured at all on a CPU.
  - Harness: `apps/web/.eval-local/` (untracked operator tool).
- **Data:** synthetic only. Work messages, journal entries and chat sentences were written for the test, with no real person or company.
- **Speed:** measured separately with Ollama's own token counters, one model loaded at a time.

## 2. Results

### 2.1 Speed on existing hardware (CPU)

| Model | Prompt tok/s | Generation tok/s | Production ceilings (intent / journal / translation) |
|---|---|---|---|
| Qwen3-8B | ~12 | ~3.4 | **missed every one** |
| Mistral NeMo 12B | ~5 | ~2.5 | **missed every one** |
| EuroLLM-9B | ≤5* | ≤2* | **missed every one** |

\*Measured while RAM was under pressure; at best similar to Qwen3.

- The chat-understanding prompt is about 3,600 tokens (system plus a 94-row intent catalogue). On this CPU that is **about 5–6 minutes per sentence**.
- The production ceiling is about 16 s. EuroLLM's 4,096-token context barely holds the prompt at all.

### 2.2 Quality with the production prompts (synthetic set)

| Task | EuroLLM-9B | Qwen3-8B | Mistral NeMo 12B |
|---|---|---|---|
| Message translation (15: 3 messages × 6 languages) | 6/15 schema-valid; **2/6 in the right language** | 0/15 (timeouts; "thinking" mode spends the budget) | 15/15 schema-valid; **~4/15 correct target language**; one **hallucination** (LT→DE invented "hand sanitizers and protective masks"), one mistranslation ("Betalingen" = payment, for a concrete delivery) |
| Journal structuring (5) | 0/5 (timeouts) | 0/5 (timeouts) | 3/5 valid, **2/5 correct** |
| Chat understanding / plans (3) | 0/3 | 0/3 | 0/3 |

- With a **short task-specific prompt** (not the production one), the same EuroLLM translated LT→EN **perfectly**: "Tomorrow we start at 7 am at the second building. Bring your helmets and safety shoes."
- Qwen3 dropped "tomorrow" and said "hats"; NeMo said "safety glasses".
- The production prompts (English instructions + a multi-field JSON schema) are too heavy for 8–12B models. A dedicated small-model prompt would be needed.

### 2.3 Cost per active user

| Option | Monthly cost now | Note |
|---|---|---|
| **Gemini paid tier** (gemini-3.5-flash-lite, $0.30 in / $2.50 out per 1M tokens, price recorded in `model-registry.ts`) | **≈ $0.30–1** at current volume | Measured in production over the last 30 days: 236 translations (avg 521 in / 173 out tokens) = $0.23; 33 understanding calls (avg 3,007 / 68) = $0.04. About $0.001 per call. |
| Self-hosted GPU (e.g. Hetzner GEX45, €214/month + €209 setup) | €214 fixed | Breaks even with Gemini at **about 200,000 calls/month**. Below that it is many times more expensive. |
| This laptop (CPU) | €0 | **Not usable**: misses every latency ceiling by 10–20×, and quality is insufficient with the production prompts. |

### 2.4 Licences, GDPR, retention

| | EuroLLM | Qwen3 | Mistral NeMo | Gemini paid | Gemini free |
|---|---|---|---|---|---|
| Commercial use | ✅ Apache 2.0 | ✅ Apache 2.0 (check each checkpoint's card) | ✅ Apache 2.0 | ✅ | ✅ |
| Data leaves our infrastructure | ❌ no (self-hosted) | ❌ no | ❌ no | ✅ to Google (processor, DPA) | ✅ to Google (**used to improve products**; EEA apps must use paid) |
| Egress grant needed | **no** (`locality: local` passes the gate) | no | no | yes (exists, now gated on paid-tier confirmation, #2399) | not permissible for personal data |
| Retention | ours | ours | ours | Google logs for a limited period per its terms | Google product use |

## 3. Recommendation (cheapest option of sufficient quality)

1. **Today: Gemini paid tier.** This is the only option that meets quality *and* latency, at about $0.001 per call, i.e. well under €1/month at current volume.
   - Owner steps: confirm billing on the Google project, then set `AI_GEMINI_PAID_TIER_CONFIRMED=1` (#2399).
   - This is a paid service, so it is the owner's decision. Nothing was enabled.
2. **No local pilot now.** Existing infrastructure (CPU only) is insufficient: no pilot was deployed, and nothing needs rolling back.
3. **If sovereignty (no egress) is wanted later, EuroLLM-9B is the right open model.** It has the best language coverage for this market and the best translation in a direct test. It needs:
   - (a) a GPU host (~€214/month);
   - (b) a short dedicated prompt for small models;
   - (c) a re-run of this harness on that GPU before switching.
   It becomes cheaper than Gemini only at about 200k calls/month.
4. Chat understanding should stay deterministic-first in every option. The 3,600-token catalogue prompt is unsuitable for small local models.

## 4. Clean-up (owner's choice)

The models and Ollama stay on the laptop for a re-run. To remove them (about 18 GB), run each of these:

```bash
ollama rm lm-qwen3-8b lm-nemo-12b lm-eurollm-9b qwen3:8b mistral-nemo:12b hf.co/bartowski/EuroLLM-9B-Instruct-GGUF:Q4_K_M
```

```bash
winget uninstall Ollama.Ollama
```
