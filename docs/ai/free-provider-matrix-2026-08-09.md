# AI provider matrix — verified 2026-08-09

Checked against each vendor's own current documentation on 2026-08-09. A tier
that was free once is not evidence it is free now, so every row below carries
the page it came from and the date it was read. **Re-verify before promoting
any provider's cost class.**

Nothing in this document activates a provider. It is the evidence behind the
`costClass` values in `apps/web/lib/ai/runtime/provider-chain.ts`.

## The finding that decides the ordering

**Google's Gemini free tier states that content IS used to improve their
products; the paid tier states it is not.** LabourMarket.ai's AI tasks operate
on worker CVs, work-journal entries, absence notes and employer demand text —
personal data under GDPR, for which this platform is the controller. A free
tier whose consideration is the data itself is not a cost saving on that
content; it is a disclosure.

This is why the chain classes every cloud vendor `paid` and puts `free_local`
first. Free-as-in-allowance and free-as-in-safe are different properties, and
only the local runtime has both.

## Matrix

| Provider | Free today? | Key required | Limits (as documented) | Structured output | Privacy consideration | Server-side suitable | Recommended | Integrated |
|---|---|---|---|---|---|---|---|---|
| **Local OpenAI-compatible** (Ollama / LM Studio / vLLM) | Yes — runs on owned hardware | **No** | Operator's hardware only | Weaker; runtime keeps its JSON repair pass | Prompt never leaves the operator's network | Yes | **Yes — first in chain** | Profile landed; HTTP adapter is the next slice |
| **Google Gemini** | Yes, free tier exists | Yes | Flash / Flash-Lite family; per-model RPM/RPD not stated on the pricing page | Yes | **Free tier: "Content used to improve our products". Paid tier: content "not" used** | Paid tier only | Paid tier only, for non-personal tasks | Adapter exists (`wired_env_gated`), classed `paid` |
| **Cloudflare Workers AI** | Yes | Yes (account) | **10,000 Neurons/day**, resets 00:00 UTC; beyond it requires Workers Paid at $0.011/1,000 Neurons | Model-dependent | Not yet reviewed | Plausible | Evaluate next — best free-allowance shape found | No adapter |
| **Groq** | Yes | Not stated on the rate-limit page | e.g. Llama 3.1 8B Instant: 30 RPM, 14.4K RPD, 6K TPM, 500K TPD | OpenAI-compatible | **Training policy not stated in rate-limit docs — must read their policy pages before use** | Unknown until policy read | Not yet | No adapter |
| **OpenRouter** | Yes — model ids ending `:free` | Yes | 20 RPM; **50 requests/day** under $10 lifetime credit, 1,000/day at ≥$10 | Model-dependent | **Free-model data policy not stated in the limits docs — must be read separately** | Unknown until policy read | Not yet — 50/day is below useful volume | No adapter |
| **Anthropic / OpenAI / xAI** | No | Yes | Metered | Yes | Standard commercial terms | Yes | Only when the owner enables one | Adapters exist; classed `paid` |
| **Hugging Face Inference** | Not checked this pass | — | — | — | — | — | — | No adapter |

## What this means for the chain

1. `free_local` is the only class that is both free and privacy-safe, so it
   ranks first and needs no key. This is the shape the old config could not
   express at all.
2. Every cloud vendor stays `paid` until someone verifies its CURRENT terms and
   its training policy. `provider-chain.test.ts` pins that, so promoting one is
   a conscious edit that has to bring a source with it.
3. Two vendors (Groq, OpenRouter) could not be classified honestly from their
   rate-limit pages alone — the training-data question is unanswered there.
   They stay out of the chain rather than going in with a guess.

## Not verified in this pass

- Groq's and OpenRouter's data/training policies (their own policy pages).
- Cloudflare Workers AI's data policy.
- Hugging Face Inference current free terms.
- Whether any free tier permits processing personal data of EU data subjects
  under a DPA — a legal question, not a technical one, and an owner decision.

## Sources

- Gemini pricing — https://ai.google.dev/gemini-api/docs/pricing (read 2026-08-09)
- Cloudflare Workers AI pricing — https://developers.cloudflare.com/workers-ai/platform/pricing/ (read 2026-08-09)
- Groq rate limits — https://console.groq.com/docs/rate-limits (read 2026-08-09)
- OpenRouter limits — https://openrouter.ai/docs/api-reference/limits (read 2026-08-09)
