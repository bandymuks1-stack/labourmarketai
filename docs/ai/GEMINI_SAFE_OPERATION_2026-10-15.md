# Gemini — what safe operation requires, and how to depend on it less (2026-10-15)

**Owner directive 2026-10-15 §4:**
- keep the privacy restriction until Gemini's actual data terms are confirmed;
- determine which plan and which data protection are needed;
- do not enable paid services autonomously;
- make translation and chat as independent of Gemini quotas as possible, without breaking privacy.

## 1. Where it stands (FACT, 2026-10-15)

- **Restricted.** #2399 (merged, live) makes both personal-data grants (`translate_message`, `propose_conversation_intent`) answer only while `AI_GEMINI_PAID_TIER_CONFIRMED=1` is deployed. That variable is not set.
  - Message translation: shows the original, with the honest "not translated" state.
  - Sentences the deterministic router cannot read: answered with the honest "AI not switched on" state.
  - Public market explanations: still run (PUBLIC data needs no grant).
- **The tier is not verified.** Production saw 83 `429 RESOURCE_EXHAUSTED … check your plan and billing details` (2026-10-01 … 10-09). That is consistent with free-tier limits but is not proof; only the Google project's billing page proves it.

## 2. What is needed for safe operation

| Requirement | Why | Minimum | Recommended |
|---|---|---|---|
| **Paid Services** | On the free tier Google uses prompts and responses to improve its products, and human reviewers may read them. On the paid tier it does not, and processes them under the Data Processing Addendum for products where Google is a processor. Third-party summaries of the Gemini API terms also state that apps serving EEA/UK/Swiss users must use Paid Services only — confirm in the current terms. | Billing enabled on the Google Cloud project that issued the production `GEMINI_API_KEY`. The key must be created in that project, not used through AI Studio's free tooling. | — |
| **DPA in force** | Article 28 contract with the processor | Google's processor DPA, which applies to paid Gemini API use (accept / confirm in the console) | Google Cloud DPA via **Vertex AI** |
| **Data location** | Gemini API: prompts may be stored or cached transiently in any country where Google has facilities | Disclose it (the privacy policy already names Google/Gemini, #2372; transfer basis per the DPA/SCCs) | **Vertex AI in an EU region** (e.g. europe-west1/4). ML processing happens in the requested region for listed models. Check the current locations page model by model. |
| **Minimisation** | Only what the task needs | Already enforced: the task payload policy (`task-routing.ts` `allowedFields`) sends message text + locales only; no ids, names or attachments | — |

**Owner steps to re-enable (no code change needed):**
1. Google Cloud → the project behind `GEMINI_API_KEY` → Billing → confirm it is enabled.
2. Confirm the DPA.
3. Vercel → production env `AI_GEMINI_PAID_TIER_CONFIRMED=1` → redeploy.

Moving to Vertex AI EU is a separate, larger step: a new adapter route plus a service account. It is recommended, but it needs an owner decision because it is a different paid Google Cloud product.

## 3. Depending less on Gemini quotas, without breaking privacy

| Lever | State | Effect |
|---|---|---|
| Deterministic understanding first | **Built** (`classifyIntent` → goal → model only for the rest) | Most sentences never reach a model; the quota only matters for the remainder |
| Translation resilience | **Built** (`translation-read.ts`): one short retry, a quota cooldown (stops hammering a 429), a per-message failure memo, an in-memory cache | A quota event degrades to "original shown", never an error or a spinner |
| Persistent translation cache | **Not allowed**: doctrine §2 forbids storing translations of user content in the database | — |
| **Self-hosted model** (`local` provider: Ollama / LM Studio / LibreTranslate, `AI_LOCAL_*`) | **Seam built, not deployed** | `locality: "local"` passes the egress gate with **no grant**: data never leaves our own infrastructure, so there is no vendor quota. Needs a host (CPU/GPU) — an infrastructure and cost decision for the owner. |
| DeepL (EU processor) for translation | **Deferred by the owner** (2026-09-17) | Paid; would remove the dependence on Gemini for translation |

**Recommendation:**
- Confirm the Gemini paid tier (step 1–3) for the near term.
- Decide whether translation should move to a self-hosted model (no egress, no quota) or to DeepL.
- Until then, the platform stays fully usable: deterministic chat, and the original text with an honest label.

Sources:
- Gemini API Additional Terms of Service: https://ai.google.dev/terms
- Vertex AI data residency: https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency
